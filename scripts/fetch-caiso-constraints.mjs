// scripts/fetch-caiso-constraints.mjs
// Pulls PRC_CNSTR (constraint shadow prices) for DAM + RTM and writes
// normalized JSON into the Voltlas data layer.
//
// SCHEMA DECISION (locked in per design discussion):
//   - constraint_id (physical interface) is the PRIMARY key
//   - market_run_id is a SUB-key under each constraint
//   - The "All" landing view dedupes to worst-case (max shadow price)
//     across markets per physical interface; per-market tabs show
//     each market's row independently.
//
// COLUMN-NAME CAVEAT: field names below (SHADOW_PRC, CONSTRAINT_ID, etc.)
// come from the OASIS interface spec's XML data items. CAISO's CSV export
// headers are sometimes more verbose. On first live run, if normalizeRow()
// throws MissingColumnError, check the logged header row and update
// COLUMN_MAP accordingly. Do not silently guess.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fetchOasisReport, withRetry } from '../lib/oasis-client.mjs';

const DATA_DIR = 'data/caiso';
const CURRENT_FILE = `${DATA_DIR}/constraints-current.json`;
const HISTORY_FILE = `${DATA_DIR}/constraints-history.json`;
const HISTORY_RETENTION_DAYS = 30; // keep JSON small; archive strategy TBD

// Map of logical field -> candidate CSV column names, first match wins.
// Extend this list after inspecting the first real CSV pull.
const COLUMN_MAP = {
  intervalStart: ['INTERVALSTARTTIME_GMT', 'INTERVAL_START_GMT', 'OPR_DT'],
  intervalEnd:   ['INTERVALENDTIME_GMT', 'INTERVAL_END_GMT'],
  constraintId:  ['CONSTRAINT_ID', 'TI_ID', 'MARKET_CONSTRAINT_ID'],
  constraintName:['CONSTRAINT_NAME', 'TI_NAME', 'MARKET_CONSTRAINT_NAME'],
  market:        ['MARKET_RUN_ID', 'MARKET_TYPE'],
  shadowPrice:   ['SHADOW_PRC', 'SHADOW_PRICE', 'PRC', 'VALUE', 'MW'],
  contingencyId: ['CONSTRAINT_CAUSE', 'CONTINGENCY_ID', 'OUTAGE_ID'],
};

class MissingColumnError extends Error {}

function pickColumn(row, candidates, required = true) {
  for (const c of candidates) {
    if (c in row && row[c] !== '') return row[c];
  }
  if (required) {
    throw new MissingColumnError(
      `None of [${candidates.join(', ')}] found. Actual headers: ${Object.keys(row).join(', ')}`
    );
  }
  return null;
}

function normalizeRow(row) {
  const shadowPrice = parseFloat(pickColumn(row, COLUMN_MAP.shadowPrice));
  return {
    interval_start: pickColumn(row, COLUMN_MAP.intervalStart),
    interval_end: pickColumn(row, COLUMN_MAP.intervalEnd, false),
    constraint_id: pickColumn(row, COLUMN_MAP.constraintId),
    constraint_name: pickColumn(row, COLUMN_MAP.constraintName, false) ?? pickColumn(row, COLUMN_MAP.constraintId),
    market: pickColumn(row, COLUMN_MAP.market),
    shadow_price: Number.isFinite(shadowPrice) ? shadowPrice : 0,
    binding: Number.isFinite(shadowPrice) && shadowPrice > 0,
    contingency_id: pickColumn(row, COLUMN_MAP.contingencyId, false),
  };
}

/**
 * Build the "current" snapshot with the dedup structure:
 * {
 *   updated_at,
 *   constraints: {
 *     [constraint_id]: {
 *       constraint_name,
 *       markets: { DAM: {...}, RTM: {...} },   // per-market rows, independent
 *       worst: { market, shadow_price, ... }   // max across markets, for "All" tab
 *     }
 *   }
 * }
 */
function buildCurrentSnapshot(records) {
  const constraints = {};
  for (const r of records) {
    const entry = (constraints[r.constraint_id] ??= {
      constraint_name: r.constraint_name,
      markets: {},
      worst: null,
    });
    // Keep only the latest interval per market
    const existing = entry.markets[r.market];
    if (!existing || r.interval_start > existing.interval_start) {
      entry.markets[r.market] = r;
    }
  }
  for (const entry of Object.values(constraints)) {
    entry.worst = Object.values(entry.markets).reduce(
      (max, m) => (!max || m.shadow_price > max.shadow_price ? m : max),
      null
    );
  }
  return { updated_at: new Date().toISOString(), constraints };
}

function appendHistory(records) {
  let history = [];
  if (existsSync(HISTORY_FILE)) {
    history = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
  }

  // Dedupe on (constraint_id, market, interval_start)
  const seen = new Set(history.map((h) => `${h.constraint_id}|${h.market}|${h.interval_start}`));
  const fresh = records.filter(
    (r) => !seen.has(`${r.constraint_id}|${r.market}|${r.interval_start}`)
  );
  history.push(...fresh);

  // Retention trim
  const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * 86400_000).toISOString();
  history = history.filter((h) => h.interval_start >= cutoff);

  writeFileSync(HISTORY_FILE, JSON.stringify(history));
  return fresh.length;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  const now = new Date();
  const allRecords = [];

  // RTM: rolling recent window. DAM: today's full day (published once daily).
  const jobs = [
    {
      market: 'RTM',
      start: new Date(now.getTime() - 60 * 60_000), // last hour
      end: now,
    },
    {
      market: 'DAM',
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)),
    },
  ];

  for (const job of jobs) {
    try {
      const rows = await withRetry(() =>
        fetchOasisReport(
          'PRC_CNSTR',
          { market_run_id: job.market, ti_id: 'ALL' },
          job.start,
          job.end
        )
      );
      console.log(`PRC_CNSTR ${job.market}: ${rows.length} raw rows`);
      if (rows.length > 0) {
        console.log(`  Headers seen: ${Object.keys(rows[0]).join(', ')}`);
      }
      allRecords.push(...rows.map(normalizeRow));
    } catch (err) {
      // One market failing shouldn't kill the other's update
      console.error(`FAILED ${job.market}: ${err.message}`);
      process.exitCode = 1;
    }
  }

  if (allRecords.length === 0) {
    console.error('No records fetched from any market — leaving existing data untouched.');
    process.exit(1);
  }

  const snapshot = buildCurrentSnapshot(allRecords);
  writeFileSync(CURRENT_FILE, JSON.stringify(snapshot, null, 2));
  const added = appendHistory(allRecords);
  console.log(
    `Wrote ${Object.keys(snapshot.constraints).length} constraints to current; ${added} new history rows.`
  );
}

main();
