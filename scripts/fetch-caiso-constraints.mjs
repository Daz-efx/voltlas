// scripts/fetch-caiso-constraints.mjs
// Pulls PRC_CNSTR (constraint shadow prices) for DAM + RTM and writes
// normalized JSON into the Voltlas data layer.
//
// SIGN CONVENTION (learned from live data, 2026-07-09):
// CAISO reports these shadow prices as NEGATIVE values (LP dual convention).
// A more-negative number = more binding. We therefore:
//   - preserve the RAW signed value in shadow_price
//   - add shadow_price_abs for ranking/severity
//   - binding = |shadow_price| > 0.005 (epsilon guards float noise)
// PENDING VERIFICATION: check one value against the OASIS web UI to decide
// whether the frontend should display the sign or the magnitude.
//
// SCHEMA (locked): constraint_id = physical interface (primary key);
// market_run_id = sub-key; `worst` = max |shadow_price| across markets.
//
// SCOPE NOTE: with ti_id=ALL this report returns intertie scheduling-limit
// constraints (_ITC/_ISL). Internal flowgate constraints are expected in
// PRC_NOMOGRAM (v2 layer, not yet ingested).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fetchOasisReport, withRetry } from '../lib/oasis-client.mjs';

const DATA_DIR = 'data/caiso';
const CURRENT_FILE = `${DATA_DIR}/constraints-current.json`;
const HISTORY_FILE = `${DATA_DIR}/constraints-history.json`;
const HISTORY_RETENTION_DAYS = 30;
const BINDING_EPSILON = 0.005;

// Verified live headers (2026-07-09):
// INTERVALSTARTTIME_GMT, INTERVALENDTIME_GMT, OPR_DT, OPR_HR, OPR_INTERVAL,
// OPR_TYPE, MARKET_RUN_ID, TI_ID_XML, TI_ID, TI_DIRECTION, CONSTRAINT_CAUSE,
// MW, GROUP
const COLUMN_MAP = {
  intervalStart: ['INTERVALSTARTTIME_GMT', 'INTERVAL_START_GMT', 'OPR_DT'],
  intervalEnd:   ['INTERVALENDTIME_GMT', 'INTERVAL_END_GMT'],
  constraintId:  ['TI_ID', 'CONSTRAINT_ID', 'MARKET_CONSTRAINT_ID'],
  constraintName:['TI_ID', 'CONSTRAINT_NAME', 'TI_NAME'],
  market:        ['MARKET_RUN_ID', 'MARKET_TYPE'],
  shadowPrice:   ['MW', 'SHADOW_PRC', 'SHADOW_PRICE', 'PRC', 'VALUE'],
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
  const raw = parseFloat(pickColumn(row, COLUMN_MAP.shadowPrice));
  const shadowPrice = Number.isFinite(raw) ? raw : 0;
  return {
    interval_start: pickColumn(row, COLUMN_MAP.intervalStart),
    interval_end: pickColumn(row, COLUMN_MAP.intervalEnd, false),
    constraint_id: pickColumn(row, COLUMN_MAP.constraintId),
    constraint_name: pickColumn(row, COLUMN_MAP.constraintName, false) ?? pickColumn(row, COLUMN_MAP.constraintId),
    market: pickColumn(row, COLUMN_MAP.market),
    shadow_price: shadowPrice,                       // raw signed value as CAISO reports it
    shadow_price_abs: Math.abs(shadowPrice),          // severity, for ranking
    binding: Math.abs(shadowPrice) > BINDING_EPSILON, // magnitude-based
    contingency_id: pickColumn(row, COLUMN_MAP.contingencyId, false),
    ti_direction: row.TI_DIRECTION || null,
  };
}

function buildCurrentSnapshot(records) {
  const constraints = {};
  for (const r of records) {
    const entry = (constraints[r.constraint_id] ??= {
      constraint_name: r.constraint_name,
      markets: {},
      worst: null,
    });
    const existing = entry.markets[r.market];
    if (!existing || r.interval_start > existing.interval_start) {
      entry.markets[r.market] = r;
    }
  }
  for (const entry of Object.values(constraints)) {
    // Worst = largest MAGNITUDE across markets
    entry.worst = Object.values(entry.markets).reduce(
      (max, m) => (!max || m.shadow_price_abs > max.shadow_price_abs ? m : max),
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
  const seen = new Set(history.map((h) => `${h.constraint_id}|${h.market}|${h.interval_start}`));
  const fresh = records.filter(
    (r) => !seen.has(`${r.constraint_id}|${r.market}|${r.interval_start}`)
  );
  history.push(...fresh);
  const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * 86400_000).toISOString();
  history = history.filter((h) => h.interval_start >= cutoff);
  writeFileSync(HISTORY_FILE, JSON.stringify(history));
  return fresh.length;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  const now = new Date();
  const allRecords = [];

  const jobs = [
    { market: 'RTM', start: new Date(now.getTime() - 60 * 60_000), end: now },
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
      allRecords.push(...rows.map(normalizeRow));
    } catch (err) {
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

  const bindingNow = Object.values(snapshot.constraints).filter((c) => c.worst?.binding);
  console.log(
    `Wrote ${Object.keys(snapshot.constraints).length} constraints (${bindingNow.length} binding); ${added} new history rows.`
  );
  for (const c of bindingNow
    .sort((a, b) => b.worst.shadow_price_abs - a.worst.shadow_price_abs)
    .slice(0, 5)) {
    console.log(
      `  ${c.constraint_name} | ${c.worst.market} | ${c.worst.shadow_price} $/MWh (|${c.worst.shadow_price_abs}|)`
    );
  }
}

main();
