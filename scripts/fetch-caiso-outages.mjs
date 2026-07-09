// scripts/fetch-caiso-outages.mjs
// Pulls TRNS_OUTAGE (transmission outages) from CAISO OASIS.
//
// STRUCTURE (learned from live data, 2026-07-09):
// - This report is an AUDIT FEED: each row is a change event (AUDIT_TYPE=I
//   insert) on an outage record, not the outage itself. Rows whose outage
//   dates fall outside the query window can still appear.
// - EQUIPMENT_OUTAGE is a composite field: "<record_id>|<action>--"
//   e.g. "355469|Inserted--"
// - OUTAGE_NOTES holds the real identity: "OMS <oms_number>: <description>"
//   e.g. "OMS 20152281: PACW Path Limits-PATH LIMITS-0.00-ACLINESEGMENT"
// - One OMS outage may have MULTIPLE time windows (crew segments and/or
//   revisions — indistinguishable in this feed; we keep all distinct
//   windows and display the union).
// - Very long-duration records (e.g. Jan 2026 → Jan 2028) are STANDING
//   OTC LIMITATIONS (path derates), not discrete outages. They're
//   separated into their own category so they don't pollute the
//   active-outage view.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fetchOasisReport, withRetry } from '../lib/oasis-client.mjs';

const DATA_DIR = 'data/caiso';
const OUTAGE_FILE = `${DATA_DIR}/outages.json`;
const RETENTION_DAYS = 90;          // completed outages age out
const STANDING_THRESHOLD_DAYS = 60; // window longer than this => standing limitation

function toTimestamp(dateStr, hourStr) {
  if (!dateStr) return null;
  let iso = dateStr.trim();
  const mdy = iso.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (mdy) iso = `${mdy[3]}-${mdy[1]}-${mdy[2]}`;
  const he = parseInt(hourStr, 10);
  const startHour = Number.isFinite(he) ? Math.max(0, he - 1) : 0; // hour-ending convention (unverified for this report; see README)
  return `${iso}T${String(startHour).padStart(2, '0')}:00:00`;
}

/** Parse "355469|Inserted--" -> { record_id, action } */
function parseEquipmentOutage(s) {
  if (!s) return { record_id: null, action: null };
  const [record_id, actionRaw] = s.split('|');
  return {
    record_id: record_id?.trim() || null,
    action: actionRaw ? actionRaw.replace(/-+$/, '').trim() : null,
  };
}

/** Parse "OMS 20152281: PACW Path Limits-PATH LIMITS-0.00-ACLINESEGMENT" */
function parseNotes(s) {
  if (!s) return { oms: null, description: null, equipment_type: null };
  const omsMatch = s.match(/OMS\s+(\d+)\s*:\s*(.*)$/);
  if (!omsMatch) return { oms: null, description: s, equipment_type: null };
  const rest = omsMatch[2];
  // Equipment type is the trailing -SEGMENT-style token, e.g. ACLINESEGMENT
  const typeMatch = rest.match(/-([A-Z]+)$/);
  return {
    oms: omsMatch[1],
    description: typeMatch ? rest.slice(0, typeMatch.index) : rest,
    equipment_type: typeMatch ? typeMatch[1] : null,
  };
}

function windowDays(start, end) {
  if (!start || !end) return 0;
  return (new Date(end) - new Date(start)) / 86400_000;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  const now = new Date();
  // 30-day query window (OASIS caps at 31). Note: because this is an
  // audit feed, the window filters CHANGE dates, not outage dates —
  // long-standing records still appear if they were touched.
  const start = new Date(now.getTime() - 3 * 86400_000);
  const end = new Date(now.getTime() + 27 * 86400_000);

  const rows = await withRetry(() =>
    fetchOasisReport(
      'TRNS_OUTAGE',
      { ti_id: 'ALL', ti_direction: 'ALL' },
      start,
      end
    )
  );
  console.log(`TRNS_OUTAGE: ${rows.length} raw rows`);

  // Load existing log (keyed by OMS number)
  let outages = {};
  if (existsSync(OUTAGE_FILE)) {
    const parsed = JSON.parse(readFileSync(OUTAGE_FILE, 'utf8'));
    outages = parsed.outages ?? {};
  }

  for (const row of rows) {
    const { record_id, action } = parseEquipmentOutage(row.EQUIPMENT_OUTAGE);
    const { oms, description, equipment_type } = parseNotes(row.OUTAGE_NOTES);
    const key = oms ?? record_id ?? `${row.TI_ID}|${row.START_DATE}`; // graceful degradation
    const curtailed = parseFloat(row.CURTAILED_OTC_MW);

    const entry = (outages[key] ??= {
      oms_number: oms,
      record_id,
      ti_id: row.TI_ID || null,
      ti_direction: row.TI_DIRECTION || null,
      description: description || null,
      equipment_type: equipment_type || null,
      windows: {},
      last_action: null,
      last_updated: null,
    });

    // Window keyed by start time; latest UPD_DATE_GMT revision wins
    const w = {
      start_time: toTimestamp(row.START_DATE, row.START_HOUR),
      end_time: toTimestamp(row.END_DATE, row.END_HOUR),
      curtailed_otc_mw: Number.isFinite(curtailed) ? curtailed : null,
      updated: row.UPD_DATE_GMT || row.UPD_DATE || null,
    };
    const wKey = w.start_time ?? 'unknown';
    const existing = entry.windows[wKey];
    if (!existing || (w.updated ?? '') >= (existing.updated ?? '')) {
      entry.windows[wKey] = w;
    }

    if ((row.UPD_DATE_GMT ?? '') >= (entry.last_updated ?? '')) {
      entry.last_updated = row.UPD_DATE_GMT || entry.last_updated;
      entry.last_action = action || entry.last_action;
    }
    entry.last_seen = new Date().toISOString();
  }

  // Derive per-outage summary fields + classify + retention
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86400_000).toISOString();
  let discrete = 0, standing = 0;

  for (const [key, o] of Object.entries(outages)) {
    const wins = Object.values(o.windows).filter((w) => w.start_time);
    if (wins.length === 0) { delete outages[key]; continue; }

    o.first_start = wins.reduce((m, w) => (!m || w.start_time < m ? w.start_time : m), null);
    o.last_end = wins.reduce((m, w) => (!m || (w.end_time ?? '') > m ? w.end_time : m), null);
    o.max_curtailed_mw = wins.reduce(
      (m, w) => (w.curtailed_otc_mw != null && w.curtailed_otc_mw > m ? w.curtailed_otc_mw : m), 0
    );

    // Classify: any single window longer than threshold => standing limitation
    o.category = wins.some((w) => windowDays(w.start_time, w.end_time) > STANDING_THRESHOLD_DAYS)
      ? 'standing_limitation'
      : 'outage';

    // Display status from the union of windows
    const anyActive = wins.some(
      (w) => w.start_time <= nowIso && (!w.end_time || w.end_time >= nowIso)
    );
    const anyUpcoming = wins.some((w) => w.start_time > nowIso);
    o.display_status = anyActive ? 'active' : anyUpcoming ? 'upcoming' : 'completed';

    if (o.category === 'outage' && o.display_status === 'completed' && o.last_end && o.last_end < cutoff) {
      delete outages[key];
      continue;
    }
    o.category === 'outage' ? discrete++ : standing++;
  }

  writeFileSync(
    OUTAGE_FILE,
    JSON.stringify({ updated_at: nowIso, outages }, null, 2)
  );
  console.log(
    `Log holds ${Object.keys(outages).length} records: ${discrete} discrete outages, ${standing} standing limitations.`
  );

  // Quick visibility into current state for sanity-checking
  const active = Object.values(outages).filter(
    (o) => o.category === 'outage' && o.display_status === 'active'
  );
  console.log(`Active discrete outages right now: ${active.length}`);
  for (const o of active.slice(0, 5)) {
    console.log(
      `  OMS ${o.oms_number} | ${o.ti_id} | ${String(o.description).slice(0, 50)} | max ${o.max_curtailed_mw} MW curtailed`
    );
  }
}

main().catch((err) => {
  console.error(`Outage fetch failed: ${err.message}`);
  process.exit(1);
});
