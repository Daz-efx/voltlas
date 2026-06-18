// scripts/update-commodities.mjs
// Energy commodity spot prices from the EIA API v2 -> public/data/latest.json.
//   • Crude oil — WTI    (series RWTC)   petroleum/pri/spt   $/bbl
//   • Crude oil — Brent  (series RBRTE)  petroleum/pri/spt   $/bbl
//   • Natural gas — Henry Hub (RNGWHHD)  natural-gas/pri/fut $/MMBtu
// Each price carries a ~1-month % change. Metals / precious / agriculture come
// from the World Bank Pink Sheet (separate, Excel-based) — not this script.
//
// Run from your project root:
//   EIA_API_KEY=your_key  node scripts/update-commodities.mjs

import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.EIA_API_KEY;
if (!API_KEY) {
  console.error("✗ Missing EIA_API_KEY.\n  Run:  EIA_API_KEY=your_key node scripts/update-commodities.mjs");
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
    console.warn(`  ⚠ ${label} failed (${e.message}) — left unchanged`);
    return null;
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const wti = await tryS("WTI", "petroleum/pri/spt", "RWTC");
  const brent = await tryS("Brent", "petroleum/pri/spt", "RBRTE");
  const hh = await tryS("Henry Hub", "natural-gas/pri/fut", "RNGWHHD");

  const apply = (name, r, dec) => {
    if (!r) return 0;
    const c = data.COMMODITIES.find((x) => x.name === name);
    if (!c) { console.warn(`  (no commodity row "${name}")`); return 0; }
    c.price = dec === 2 ? round2(r.value) : round1(r.value);
    c.chg = round1(r.chg);
    c.source = "EIA";
    c.period = fmtDate(r.period);
    return 1;
  };

  let n = 0;
  n += apply("Crude oil — WTI", wti, 1);
  n += apply("Crude oil — Brent", brent, 1);
  n += apply("Natural gas — Henry Hub", hh, 2);

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`✓ Commodities (EIA energy) — ${n} of 3 updated.`);
}

main().catch((e) => { console.error("✗ " + e.message); process.exit(1); });
