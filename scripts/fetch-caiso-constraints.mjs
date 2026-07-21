// scripts/fetch-caiso-constraints.mjs
// PRC_CNSTR — CAISO scheduling/intertie constraint shadow prices (DAM + RTM).
//
// v3 CHANGE — INTERVAL SELECTION (2026-07-19):
// Previously kept the LATEST interval per market. Correct for RTM (latest =
// now), WRONG for DAM: DAM publishes the whole operating day at once, so
// "latest" meant hour 24, not the current hour. Now selects the interval
// CONTAINING NOW (falling back to the nearest past interval, then latest),
// and additionally records the day's PEAK interval by magnitude.
//
// Shape is backwards compatible: markets[MKT] still carries the current
// interval's fields at the top level; the peak is added as markets[MKT].peak.
//
// SIGN CONVENTION: CAISO reports mixed signs. shadow_price is raw;
// shadow_price_abs is severity; binding = |price| > epsilon.
//
// SCHEMA: constraint_id = physical interface (primary), market_run_id = sub-key,
// `worst` = max |shadow_price| across markets (current intervals).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fetchOasisReport, withRetry } from '../lib/oasis-client.mjs';

const DATA_DIR = 'data/caiso';
const CURRENT_FILE = `${DATA_DIR}/constraints-current.json`;
const HISTORY_FILE = `${DATA_DIR}/constraints-history.json`;
const HISTORY_RETENTION_DAYS = 30;
const BINDING_EPSILON = 0.005;

// Verified live headers (2026-07-09)
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
    constraint_name:
      pickColumn(row, COLUMN_MAP.constraintName, false) ?? pickColumn(row, COLUMN_MAP.constraintId),
    market: pickColumn(row, COLUMN_MAP.market),
    shadow_price: shadowPrice,
    shadow_price_abs: Math.abs(shadowPrice),
    binding: Math.abs(shadowPrice) > BINDING_EPSILON,
    contingency_id: pickColumn(row, COLUMN_MAP.contingencyId, false),
    ti_direction: row.TI_DIRECTION || null,
  };
}

/**
 * Pick the interval covering `nowIso` from a market's rows.
 * Preference: containing interval -> nearest past start -> latest start.
 * (OASIS timestamps are ISO-8601 UTC, so string compare is chronological.)
 */
export function pickCurrentInterval(rows, nowIso) {
  if (rows.length === 0) return null;
  const containing = rows.find(
    (r) => r.interval_start <= nowIso && (!r.interval_end || r.interval_end > nowIso)
  );
  if (containing) return containing;
  const past = rows.filter((r) => r.interval_start <= nowIso);
  if (past.length) {
    return past.reduce((a, b) => (a.interval_start >= b.interval_start ? a : b));
  }
  return rows.reduce((a, b) => (a.interval_start >= b.interval_start ? a : b));
}

/** Largest-magnitude interval across the whole published window. */
function pickPeakInterval(rows) {
  return rows.reduce(
    (max, r) => (!max || r.shadow_price_abs > max.shadow_price_abs ? r : max),
    null
  );
}

function buildCurrentSnapshot(records, nowIso) {
  // Group rows by constraint, then by market
  const byConstraint = {};
  for (const r of records) {
    ((byConstraint[r.constraint_id] ??= {})[r.market] ??= []).push(r);
  }

  const constraints = {};
  for (const [cid, byMarket] of Object.entries(byConstraint)) {
    const entry = { constraint_name: cid, markets: {}, worst: null };
    for (const [mkt, rows] of Object.entries(byMarket)) {
      const current = pickCurrentInterval(rows, nowIso);
      const peak = pickPeakInterval(rows);
      entry.constraint_name = current.constraint_name ?? cid;
      entry.markets[mkt] = {
        ...current, // current-interval fields at top level (backwards compatible)
        intervals_published: rows.length,
        peak: {
          shadow_price: peak.shadow_price,
          shadow_price_abs: peak.shadow_price_abs,
          binding: peak.binding,
          interval_start: peak.interval_start,
        },
      };
    }
    entry.worst = Object.values(entry.markets).reduce(
      (max, m) => (!max || m.shadow_price_abs > max.shadow_price_abs ? m : max),
      null
    );
    constraints[cid] = entry;
  }
  return { updated_at: nowIso, constraints };
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
  const nowIso = now.toISOString();
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
        fetchOasisReport('PRC_CNSTR', { market_run_id: job.market, ti_id: 'ALL' }, job.start, job.end)
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

  const snapshot = buildCurrentSnapshot(allRecords, nowIso);
  writeFileSync(CURRENT_FILE, JSON.stringify(snapshot, null, 2));
  const added = appendHistory(allRecords);

  const all = Object.values(snapshot.constraints);
  const bindingNow = all.filter((c) => c.worst?.binding);
  console.log(
    `Wrote ${all.length} constraints (${bindingNow.length} binding at current interval); ${added} new history rows.`
  );
  for (const c of bindingNow
    .sort((a, b) => b.worst.shadow_price_abs - a.worst.shadow_price_abs)
    .slice(0, 5)) {
    const pk = c.worst.peak;
    console.log(
      `  ${c.constraint_name} | ${c.worst.market} | now ${c.worst.shadow_price} | peak ${pk.shadow_price} @ ${pk.interval_start?.slice(11, 16)}Z`
    );
  }
}

main();
