// scripts/fetch-caiso-nomogram.mjs
// PRC_NOMOGRAM — CAISO INTERNAL constraints (branch + nomogram), the layer
// PRC_CNSTR (scheduling/intertie) does not cover.
//
// VERIFIED against live CSV headers (2026-07-19):
//   INTERVALSTARTTIME_GMT, INTERVALENDTIME_GMT, OPR_DT, OPR_HR, OPR_INTERVAL,
//   OPR_TYPE, MARKET_RUN_ID, NOMOGRAM_ID_XML, NOMOGRAM_ID, CONSTRAINT_CAUSE,
//   PRC, GROUP
// No constraint-type column exists; class is inferred from NOMOGRAM_ID shape.
//
// ID FORMATS OBSERVED:
//   branch:  34009_CRWCRKSS_60.0_34016_CRWS LDS_60.0_BR_1 _1
//            {node}_{station}_{kV}_{node}_{station}_{kV}_BR_{ckt}_{n}
//   outage:  OMS_TL23054_OUTAGE_NG   (carries a TL number — outage-driven)
//   control: 7690-CONTRL-INYOKN_EXP_NG
//
// INTERVAL SELECTION: current interval (containing now), plus day peak —
// same convention as fetch-caiso-constraints.mjs v3.
//
// VOLUME GUARD: history keeps BINDING rows only, 14-day retention.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fetchOasisReport, withRetry } from '../lib/oasis-client.mjs';

const DATA_DIR = 'data/caiso';
const CURRENT_FILE = `${DATA_DIR}/nomogram-current.json`;
const HISTORY_FILE = `${DATA_DIR}/nomogram-history.json`;
const HISTORY_RETENTION_DAYS = 14;
const BINDING_EPSILON = 0.005;

const COLUMN_MAP = {
  intervalStart: ['INTERVALSTARTTIME_GMT', 'INTERVAL_START_GMT', 'OPR_DT'],
  intervalEnd:   ['INTERVALENDTIME_GMT', 'INTERVAL_END_GMT'],
  constraintId:  ['NOMOGRAM_ID', 'CONSTRAINT_ID', 'MARKET_CONSTRAINT_ID'],
  market:        ['MARKET_RUN_ID', 'MARKET_TYPE'],
  shadowPrice:   ['PRC', 'SHADOW_PRC', 'SHADOW_PRICE', 'MW', 'VALUE'],
  contingencyId: ['CONSTRAINT_CAUSE', 'CONTINGENCY_ID', 'OUTAGE_ID'],
};

function pickColumn(row, candidates, required = true) {
  for (const c of candidates) {
    if (c in row && row[c] !== '') return row[c];
  }
  if (required) {
    throw new Error(
      `None of [${candidates.join(', ')}] found. Actual headers: ${Object.keys(row).join(', ')}`
    );
  }
  return null;
}

/**
 * Classify and humanize a NOMOGRAM_ID.
 * Returns { class, display, kv, oms_ref } — display is what the UI shows.
 */
export function parseNomogramId(id) {
  if (!id) return { class: 'unknown', display: '(unnamed)', kv: null, oms_ref: null };
  const raw = id.trim();

  // Outage-driven nomogram, e.g. OMS_TL23054_OUTAGE_NG
  const oms = raw.match(/^OMS_([A-Z]+\d+)_/i);
  if (oms) {
    return { class: 'outage', display: `Outage constraint ${oms[1]}`, kv: null, oms_ref: oms[1] };
  }

  // Branch or transformer, e.g.
  //   34009_CRWCRKSS_60.0_34016_CRWS LDS_60.0_BR_1 _1   (BR = branch/line)
  //   32056_CORTINA _60.0_30451_CRTNA  M_ 1.0_XF_1      (XF = transformer)
  const br = raw.match(
    /^\d+_(.+?)_\s*([\d.]+)_\d+_(.+?)_\s*([\d.]+)_(BR|XF)_(\S+)/
  );
  if (br) {
    const [, fromName, fromKv, toName, toKv, kind, ckt] = br;
    const clean = (s) => s.replace(/\s+/g, ' ').trim();
    const isXf = kind.toUpperCase() === 'XF';
    return {
      class: isXf ? 'transformer' : 'branch',
      display: isXf
        ? `${clean(fromName)} ${fromKv}/${toKv} kV transformer (bank ${ckt.trim()})`
        : `${clean(fromName)} – ${clean(toName)} ${fromKv} kV (ckt ${ckt.trim()})`,
      kv: parseFloat(fromKv),
      oms_ref: null,
    };
  }

  // Control/export nomogram, e.g. 7690-CONTRL-INYOKN_EXP_NG
  const ctrl = raw.match(/CONTRL-(.+?)_/i);
  if (ctrl) {
    return {
      class: 'nomogram',
      display: `${ctrl[1].replace(/_/g, ' ').trim()} nomogram`,
      kv: null,
      oms_ref: null,
    };
  }

  // Short-form nomogram, e.g. 7430_CP6_NG
  const short = raw.match(/^\d+_(.+?)_NG$/i);
  if (short) {
    return {
      class: 'nomogram',
      display: `${short[1].replace(/_/g, ' ').trim()} nomogram`,
      kv: null,
      oms_ref: null,
    };
  }

  return { class: 'nomogram', display: raw, kv: null, oms_ref: null };
}

function normalizeRow(row) {
  const raw = parseFloat(pickColumn(row, COLUMN_MAP.shadowPrice));
  const shadowPrice = Number.isFinite(raw) ? raw : 0;
  const id = pickColumn(row, COLUMN_MAP.constraintId);
  const parsed = parseNomogramId(id);
  return {
    interval_start: pickColumn(row, COLUMN_MAP.intervalStart),
    interval_end: pickColumn(row, COLUMN_MAP.intervalEnd, false),
    constraint_id: id,
    constraint_name: parsed.display,
    constraint_class: parsed.class,
    kv: parsed.kv,
    oms_ref: parsed.oms_ref,
    market: pickColumn(row, COLUMN_MAP.market),
    shadow_price: shadowPrice,
    shadow_price_abs: Math.abs(shadowPrice),
    binding: Math.abs(shadowPrice) > BINDING_EPSILON,
    contingency_id: pickColumn(row, COLUMN_MAP.contingencyId, false),
  };
}

function pickCurrentInterval(rows, nowIso) {
  if (rows.length === 0) return null;
  const containing = rows.find(
    (r) => r.interval_start <= nowIso && (!r.interval_end || r.interval_end > nowIso)
  );
  if (containing) return containing;
  const past = rows.filter((r) => r.interval_start <= nowIso);
  if (past.length) return past.reduce((a, b) => (a.interval_start >= b.interval_start ? a : b));
  return rows.reduce((a, b) => (a.interval_start >= b.interval_start ? a : b));
}

function pickPeakInterval(rows) {
  return rows.reduce((max, r) => (!max || r.shadow_price_abs > max.shadow_price_abs ? r : max), null);
}

function buildCurrentSnapshot(records, nowIso) {
  const byConstraint = {};
  for (const r of records) {
    ((byConstraint[r.constraint_id] ??= {})[r.market] ??= []).push(r);
  }

  const constraints = {};
  for (const [cid, byMarket] of Object.entries(byConstraint)) {
    const entry = {
      constraint_name: cid,
      constraint_class: null,
      kv: null,
      oms_ref: null,
      markets: {},
      worst: null,
    };
    for (const [mkt, rows] of Object.entries(byMarket)) {
      const current = pickCurrentInterval(rows, nowIso);
      const peak = pickPeakInterval(rows);
      entry.constraint_name = current.constraint_name;
      entry.constraint_class = current.constraint_class;
      entry.kv = current.kv;
      entry.oms_ref = current.oms_ref;
      entry.markets[mkt] = {
        ...current,
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
  const bindingOnly = records.filter((r) => r.binding);
  let history = [];
  if (existsSync(HISTORY_FILE)) {
    history = JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
  }
  const seen = new Set(history.map((h) => `${h.constraint_id}|${h.market}|${h.interval_start}`));
  const fresh = bindingOnly.filter(
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
        fetchOasisReport('PRC_NOMOGRAM', { market_run_id: job.market, ti_id: 'ALL' }, job.start, job.end)
      );
      console.log(`PRC_NOMOGRAM ${job.market}: ${rows.length} raw rows`);
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
  const classes = all.reduce((acc, c) => {
    acc[c.constraint_class] = (acc[c.constraint_class] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `Wrote ${all.length} internal constraints (${bindingNow.length} binding at current interval); ${added} new binding history rows.`
  );
  console.log(`  Classes: ${Object.entries(classes).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  for (const c of bindingNow
    .sort((a, b) => b.worst.shadow_price_abs - a.worst.shadow_price_abs)
    .slice(0, 10)) {
    const pk = c.worst.peak;
    console.log(
      `  ${c.constraint_name.slice(0, 46)} | ${c.worst.market} | now ${c.worst.shadow_price.toFixed(2)} | peak ${pk.shadow_price.toFixed(2)} @ ${pk.interval_start?.slice(11, 16)}Z`
    );
  }
}

main();
