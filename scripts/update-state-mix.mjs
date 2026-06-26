// scripts/update-state-mix.mjs
// US state electricity generation mix (% by source) + an estimated carbon
// intensity, from EIA's electric-power-operational-data route (Form EIA-923),
// annual, all sectors. Mirrors the country power-mix so the map can shade US
// states by the same lenses (renewables / carbon).
//
// Strategy that avoids fuel-code guesswork: request ALL fuel types per state
// (no fueltypeid filter), then bucket the known *granular* codes into our nine
// categories and skip aggregate codes (ALL, AOR, …) so nothing double-counts.
//
//   EIA_API_KEY=xxxx node scripts/update-state-mix.mjs
//   EIA_API_KEY=xxxx node scripts/update-state-mix.mjs --dry

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KEY = process.env.EIA_API_KEY;
const OUT = path.join(process.cwd(), "public", "data", "state-mix.json");
const BASE = "https://api.eia.gov/v2/electricity/electric-power-operational-data/data/";

// EIA granular fueltypeid -> our category. Aggregate codes (ALL, AOR, RNW, FOS,
// …) are deliberately absent, so they're skipped and never double-counted.
const FUEL_MAP = {
  COW: "coal", PC: "oil", PEL: "oil", NG: "gas", OOG: "gas",
  NUC: "nuclear", HYC: "hydro", WND: "wind", SUN: "solar",
  WWW: "bioenergy", WAS: "bioenergy", GEO: "other", OTH: "other",
  // HPS (pumped storage) intentionally omitted — it's storage, not a source.
};
const RENEW = new Set(["hydro", "wind", "solar", "bioenergy", "other"]);
// Rough direct-combustion factors (gCO2/kWh) for an *estimated* state intensity.
const CI_FACTOR = { coal: 1000, oil: 650, gas: 450, nuclear: 0, hydro: 0, wind: 0, solar: 0, bioenergy: 0, other: 0 };

const STATES = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));
const NAME = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };

// Build per-state mix from the flat EIA rows.
export function buildStateMix(rows) {
  // rows: [{ period, location, fueltypeid, generation }]
  const byState = {};
  for (const r of rows) {
    const st = r.location;
    if (!STATES.has(st)) continue;
    const cat = FUEL_MAP[r.fueltypeid];
    if (!cat) continue; // aggregate / unknown -> skip
    const year = parseInt(r.period, 10);
    const gen = Number(r.generation);
    if (!isFinite(year) || !isFinite(gen)) continue;
    const s = (byState[st] ||= {});
    // keep only the latest year present for each state
    if (s.year == null || year > s.year) { s.year = year; s.gen = {}; }
    if (year < s.year) continue;
    s.gen[cat] = (s.gen[cat] || 0) + gen;
  }
  const series = {};
  for (const [st, s] of Object.entries(byState)) {
    const total = Object.values(s.gen).reduce((a, b) => a + b, 0);
    if (!total || total <= 0) continue;
    const mix = {}; let ren = 0, ciNum = 0;
    for (const cat of Object.keys(CI_FACTOR)) {
      const share = ((s.gen[cat] || 0) / total) * 100;
      mix[cat] = Math.round(share * 10) / 10;
      if (RENEW.has(cat)) ren += share;
      ciNum += share * (CI_FACTOR[cat] || 0);
    }
    series[st] = {
      name: NAME[st] || st,
      year: s.year,
      ren: Math.min(100, Math.round(ren * 10) / 10),
      ciEst: Math.round(ciNum / 100),
      mix,
    };
  }
  return series;
}

async function main() {
  const dry = process.argv.includes("--dry");
  if (!KEY) throw new Error("EIA_API_KEY not set");
  // One call: all states, all fuel types, recent annual rows (sorted newest
  // first). 50 states × ~14 fuels ≈ 700 rows/yr, so 5000 rows ≈ 7 years.
  const qs = new URLSearchParams();
  qs.set("api_key", KEY);
  qs.set("frequency", "annual");
  qs.append("data[]", "generation");
  qs.append("facets[sectorid][]", "99"); // all sectors
  qs.append("sort[0][column]", "period");
  qs.append("sort[0][direction]", "desc");
  qs.set("length", "5000");
  const url = `${BASE}?${qs.toString()}`;
  console.log("requesting EIA state generation (all sectors, annual)…");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EIA HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const rows = j?.response?.data;
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error(`no rows returned — check facet names. keys: ${JSON.stringify(Object.keys(j?.response || j || {}))}`);
  }
  console.log(`got ${rows.length} rows; sample: ${JSON.stringify(rows[0])}`);

  const series = buildStateMix(rows);
  const n = Object.keys(series).length;
  console.log(`built mix for ${n} states`);
  for (const st of ["CA", "WV", "WA", "TX"]) {
    const s = series[st];
    if (s) console.log(`  ${st} (${s.year}): ren ${s.ren}% · ~${s.ciEst} gCO2/kWh · ${Object.entries(s.mix).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }
  if (n < 40) throw new Error(`only ${n} states parsed; aborting (expected ~51)`);

  if (dry) { console.log(`\n--dry: would write ${n} states.`); return; }
  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: "EIA Form EIA-923", note: "Carbon intensity is estimated from the generation mix using standard emission factors.", series }));
  console.log(`\n\u2713 wrote state-mix.json — ${n} states.`);

  // Mirror into latest.json under STATE_MIX so the homepage (which spreads every
  // top-level key into <Dashboard {...data}/>) hands it to the map with no page edit.
  try {
    const latestPath = path.join(process.cwd(), "public", "data", "latest.json");
    const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    latest.STATE_MIX = series;
    fs.writeFileSync(latestPath, JSON.stringify(latest, null, 2) + "\n");
    console.log(`mirrored STATE_MIX into latest.json (${n} states)`);
  } catch (e) {
    console.warn("latest.json STATE_MIX mirror skipped:", e.message);
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("\u2717 " + e.message); process.exit(1); });
}
