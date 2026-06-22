// scripts/update-commodities.mjs
// Energy commodity spot prices from the EIA API v2 -> public/data/latest.json.
//
// This script OWNS the COMMODITIES list and rebuilds it from the three EIA
// energy benchmarks on every run, so no stale or sample rows can ever linger:
//   • Crude oil — WTI         (RWTC)     petroleum/pri/spt     $/bbl
//   • Crude oil — Brent       (RBRTE)    petroleum/pri/spt     $/bbl
//   • Natural gas — Henry Hub (RNGWHHD)  natural-gas/pri/fut   $/MMBtu
// Each price carries a ~1-month % change. If a single fetch fails, the last
// good value for that benchmark is kept rather than dropped.
//
// It ALSO writes a monthly price history for these three benchmarks into
// public/data/commodity-history.json (for the /commodity/[slug] pages). That
// file is shared with the World Bank connector, so we MERGE: we only set our
// own (energy) series and leave every other source's series untouched. The
// history step is non-fatal — a failure there never affects the price update.
//
// Run from your project root:
//   EIA_API_KEY=your_key  node scripts/update-commodities.mjs

import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.EIA_API_KEY;
if (!API_KEY) {
  console.error("\u2717 Missing EIA_API_KEY.\n  Run:  EIA_API_KEY=your_key node scripts/update-commodities.mjs");
  process.exit(1);
}
const DATA_FILE = path.join(process.cwd(), "public", "data", "latest.json");
const HIST_FILE = path.join(process.cwd(), "public", "data", "commodity-history.json");
const HIST_CAP = 300; // ~25 years of monthly points

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = (p) => { const d = new Date(p); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

async function eiaSeries(route, series) {
  const url = new URL(`https://api.eia.gov/v2/${route}/data/`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("frequency", "daily");
  url.searchParams.append("data[]", "value");
  url.searchParams.append("facets[series][]", series);
  url.searchParams.append("sort[0][column]", "period");
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.set("length", "60");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${series} HTTP ${res.status}`);
  const rows = ((await res.json()).response?.data || []).filter((r) => r.value != null);
  if (!rows.length) throw new Error(`${series} returned no data`);
  const latest = rows[0];
  const latestDate = new Date(latest.period);
  const prior = rows.find((r) => latestDate - new Date(r.period) >= 28 * 864e5) || rows[rows.length - 1];
  const chg = prior ? ((latest.value - prior.value) / prior.value) * 100 : 0;
  return { value: Number(latest.value), period: latest.period, chg };
}

// Monthly history (ascending [code, value], code normalised to YYYYMmm to match
// the World Bank series format the pages already understand).
async function eiaMonthly(route, series, length = HIST_CAP) {
  const url = new URL(`https://api.eia.gov/v2/${route}/data/`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("frequency", "monthly");
  url.searchParams.append("data[]", "value");
  url.searchParams.append("facets[series][]", series);
  url.searchParams.append("sort[0][column]", "period");
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.set("length", String(length));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${series} monthly HTTP ${res.status}`);
  const rows = ((await res.json()).response?.data || []).filter((r) => r.value != null);
  const pts = rows
    .map((r) => {
      const m = /^(\d{4})-(\d{2})/.exec(String(r.period));
      return m ? [`${m[1]}M${m[2]}`, round2(Number(r.value))] : null;
    })
    .filter(Boolean)
    .reverse();
  return pts;
}

function mergeHistory(ourSeries) {
  let existing = { series: {} };
  try { existing = JSON.parse(fs.readFileSync(HIST_FILE, "utf8")); } catch {}
  const merged = {
    source: "Multiple official sources (EIA, World Bank)",
    updated: existing.updated || null,
    series: { ...(existing.series || {}), ...ourSeries },
  };
  fs.writeFileSync(HIST_FILE, JSON.stringify(merged));
  return Object.keys(merged.series).length;
}

async function tryS(label, route, series) {
  try {
    const r = await eiaSeries(route, series);
    console.log(`  ${label}: $${r.value} (${fmtDate(r.period)}, ${r.chg >= 0 ? "+" : ""}${round1(r.chg)}%)`);
    return r;
  } catch (e) {
    console.warn(`  \u26a0 ${label} failed (${e.message})`);
    return null;
  }
}

const SPECS = [
  { name: "Crude oil \u2014 WTI",         route: "petroleum/pri/spt",   series: "RWTC",    unit: "$/bbl",    dec: 1 },
  { name: "Crude oil \u2014 Brent",       route: "petroleum/pri/spt",   series: "RBRTE",   unit: "$/bbl",    dec: 1 },
  { name: "Natural gas \u2014 Henry Hub", route: "natural-gas/pri/fut", series: "RNGWHHD", unit: "$/MMBtu", dec: 2 },
];

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const prior = Object.fromEntries((data.COMMODITIES || []).map((c) => [c.name, c]));

  const rows = [];
  for (const s of SPECS) {
    const r = await tryS(s.name, s.route, s.series);
    if (r) {
      rows.push({
        name: s.name, cat: "energy",
        price: s.dec === 2 ? round2(r.value) : round1(r.value),
        unit: s.unit, chg: round1(r.chg), source: "EIA", period: fmtDate(r.period),
      });
    } else if (prior[s.name]) {
      console.warn(`  \u2192 keeping last good value for ${s.name}`);
      rows.push(prior[s.name]);
    }
  }

  data.COMMODITIES = rows; // owns the list — energy benchmarks only, all real
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`\u2713 Commodities (EIA energy) \u2014 ${rows.length} of ${SPECS.length} written.`);

  // --- Monthly history for the price-history pages (merged, non-fatal) ---
  try {
    const series = {};
    for (const s of SPECS) {
      try {
        const pts = await eiaMonthly(s.route, s.series);
        if (pts.length) series[s.name] = { name: s.name, cat: "energy", unit: s.unit, points: pts };
        console.log(`  history ${s.name}: ${pts.length} months`);
      } catch (e) {
        console.warn(`  \u26a0 ${s.name} history failed (${e.message})`);
      }
    }
    if (Object.keys(series).length) {
      const total = mergeHistory(series);
      console.log(`\u2713 Energy history merged \u2014 ${Object.keys(series).length} energy series (${total} total in file).`);
    } else {
      console.warn("  \u26a0 no energy history written.");
    }
  } catch (e) {
    console.warn("  \u26a0 energy history step skipped:", e.message);
  }
}

main().catch((e) => { console.error("\u2717 " + e.message); process.exit(1); });
