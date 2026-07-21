// scripts/build-constraint-registry.mjs
// Builds/updates data/caiso/constraint-registry.json — a DURABLE record of
// every constraint we've observed, used to generate per-constraint pages.
//
// WHY A REGISTRY: constraint IDs churn (a branch binding today may vanish
// next week) and the history files trim at 14 (nomogram) / 30 (intertie)
// days. The registry accumulates across runs so pages don't appear and
// disappear from the sitemap every time a constraint goes quiet.
//
// INPUTS  (read-only): nomogram-current.json, constraints-current.json,
//                      nomogram-history.json, constraints-history.json
// OUTPUT:              constraint-registry.json
//
// IMPORTANT ASYMMETRY: nomogram-history.json stores BINDING ROWS ONLY (a
// volume guard), while constraints-history.json stores all rows. So a
// "% of intervals binding" figure is only meaningful for the intertie feed.
// For internal constraints we report COUNTS of binding intervals observed
// and never a percentage — see stats.binding_pct === null.
//
// RETENTION: entries not seen for REGISTRY_RETENTION_DAYS are dropped, so
// pages for long-dead constraints eventually leave the sitemap.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const DATA_DIR = 'data/caiso';
const REGISTRY_FILE = `${DATA_DIR}/constraint-registry.json`;
const REGISTRY_RETENTION_DAYS = 60;

const FEEDS = [
  { feed: 'internal', current: 'nomogram-current.json', history: 'nomogram-history.json', historyIsBindingOnly: true },
  { feed: 'intertie', current: 'constraints-current.json', history: 'constraints-history.json', historyIsBindingOnly: false },
];

function readJson(file, fallback) {
  const p = `${DATA_DIR}/${file}`;
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    console.warn(`Could not parse ${file}: ${err.message}`);
    return fallback;
  }
}

/**
 * Build a URL-safe slug from a display name, falling back to the raw ID.
 * "SC21ATP – ARVIN 70.0 kV (ckt 1)" -> "sc21atp-arvin-70kv-ckt-1"
 * "MALIN500_ISL"                    -> "malin500-isl"
 */
export function slugify(name, id) {
  const base = (name && name !== id ? name : id) ?? '';
  let s = base
    .toLowerCase()
    .replace(/–|—/g, '-')            // en/em dash -> hyphen
    .replace(/(\d)\s*\.\s*0\s*kv/g, '$1kv') // "70.0 kV" -> "70kv"
    .replace(/\s*kv/g, 'kv')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  if (!s) s = 'constraint';
  return s.slice(0, 80);
}

/** Short deterministic suffix for slug collisions (no crypto dependency). */
function shortHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 4);
}

function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  const now = new Date();
  const nowIso = now.toISOString();

  // Load existing registry (accumulating memory)
  const prev = readJson('constraint-registry.json', { constraints: {} });
  const byId = {};
  for (const entry of Object.values(prev.constraints ?? {})) {
    byId[entry.constraint_id] = entry;
  }

  let seenNow = 0;

  for (const spec of FEEDS) {
    const current = readJson(spec.current, { constraints: {} });
    const history = readJson(spec.history, []);

    // Index history rows by constraint for stat computation
    const histByCid = {};
    for (const row of Array.isArray(history) ? history : []) {
      (histByCid[row.constraint_id] ??= []).push(row);
    }

    for (const [cid, c] of Object.entries(current.constraints ?? {})) {
      seenNow++;
      const rows = histByCid[cid] ?? [];
      const bindingRows = rows.filter((r) => r.binding);

      // Peak across history AND the current snapshot's peaks
      let peakSigned = 0;
      let peakAt = null;
      for (const r of rows) {
        if (Math.abs(r.shadow_price) > Math.abs(peakSigned)) {
          peakSigned = r.shadow_price;
          peakAt = r.interval_start;
        }
      }
      for (const m of Object.values(c.markets ?? {})) {
        const pk = m.peak?.shadow_price ?? m.shadow_price;
        if (pk != null && Math.abs(pk) > Math.abs(peakSigned)) {
          peakSigned = pk;
          peakAt = m.peak?.interval_start ?? m.interval_start;
        }
      }

      const existing = byId[cid];
      const entry = {
        constraint_id: cid,
        name: c.constraint_name ?? cid,
        class: c.constraint_class ?? (spec.feed === 'intertie' ? 'intertie' : null),
        kv: c.kv ?? null,
        oms_ref: c.oms_ref ?? null,
        feed: spec.feed,
        markets: Object.keys(c.markets ?? {}).sort(),
        first_seen: existing?.first_seen ?? nowIso,
        last_seen: nowIso,
        currently_binding: !!c.worst?.binding,
        stats: {
          history_rows: rows.length,
          binding_intervals: bindingRows.length,
          // Only meaningful when history retains non-binding rows too.
          binding_pct: spec.historyIsBindingOnly
            ? null
            : rows.length
              ? Math.round((bindingRows.length / rows.length) * 1000) / 10
              : null,
          history_is_binding_only: spec.historyIsBindingOnly,
          peak_signed: Math.round(peakSigned * 100) / 100,
          peak_abs: Math.round(Math.abs(peakSigned) * 100) / 100,
          peak_at: peakAt,
          // Carry forward the all-time peak so it survives history trimming
          alltime_peak_abs: Math.max(
            Math.abs(peakSigned),
            existing?.stats?.alltime_peak_abs ?? 0
          ),
        },
      };
      entry.stats.alltime_peak_abs = Math.round(entry.stats.alltime_peak_abs * 100) / 100;
      byId[cid] = entry;
    }
  }

  // Retention: drop entries not seen recently
  const cutoff = new Date(now.getTime() - REGISTRY_RETENTION_DAYS * 86400_000).toISOString();
  let dropped = 0;
  for (const [cid, e] of Object.entries(byId)) {
    if (e.last_seen < cutoff) { delete byId[cid]; dropped++; }
  }

  // Assign slugs with deterministic collision handling
  const constraints = {};
  const usedSlugs = new Set();
  // Sort for stable slug assignment across runs
  const sorted = Object.values(byId).sort((a, b) => a.constraint_id.localeCompare(b.constraint_id));
  for (const e of sorted) {
    let slug = slugify(e.name, e.constraint_id);
    if (usedSlugs.has(slug)) slug = `${slug}-${shortHash(e.constraint_id)}`;
    usedSlugs.add(slug);
    constraints[slug] = { slug, ...e };
  }

  const out = {
    generated_at: nowIso,
    retention_days: REGISTRY_RETENTION_DAYS,
    counts: {
      total: Object.keys(constraints).length,
      internal: Object.values(constraints).filter((c) => c.feed === 'internal').length,
      intertie: Object.values(constraints).filter((c) => c.feed === 'intertie').length,
      binding_now: Object.values(constraints).filter((c) => c.currently_binding).length,
    },
    constraints,
  };
  writeFileSync(REGISTRY_FILE, JSON.stringify(out, null, 2));

  console.log(
    `Registry: ${out.counts.total} constraints (${out.counts.internal} internal, ${out.counts.intertie} intertie); ` +
    `${seenNow} seen in this snapshot, ${dropped} aged out.`
  );
  const top = Object.values(constraints)
    .sort((a, b) => b.stats.alltime_peak_abs - a.stats.alltime_peak_abs)
    .slice(0, 8);
  for (const c of top) {
    console.log(
      `  /${c.slug}  ← ${c.name.slice(0, 44)} | peak $${c.stats.peak_signed} | binding intervals ${c.stats.binding_intervals}`
    );
  }
}

main();
