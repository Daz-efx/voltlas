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
// (Metals / precious / agriculture from the World Bank Pink Sheet are a future
//  connector; when added, merge its rows in here so neither overwrites the other.)
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
}

main().catch((e) => { console.error("\u2717 " + e.message); process.exit(1); });
