// scripts/update-sparklines.mjs
// Stamps the last N *real* data points onto each row in latest.json so the
// homepage sparklines show genuine recent history instead of synthetic noise.
// Reads the three history files the other connectors already produce, so it
// must run LAST in the pipeline (after every history file is written).
//
// Adds to each row:
//   DATA[i].spark        = { elecRes:[…], elecBiz:[…], gasRes:[…] }  (USD/kWh)
//   FUEL_DATA[i].spark   = { petrol:[…], diesel:[…] }                (USD/L)
//   COMMODITIES[i].spark = [ … ]                                     (price)
// Only series with >=2 points are included; everything else is left absent,
// and the Spark component renders nothing rather than a fake line.
//
//   node scripts/update-sparklines.mjs
//   node scripts/update-sparklines.mjs --dry

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(process.cwd(), "public", "data");
const LATEST = path.join(DIR, "latest.json");
const N = 24; // last N points per series — recent trajectory, source-agnostic

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

// [[code,val],…] -> [val,…] (numbers only), last N. Returns null if < 2 points.
export function tail(pairs, n = N) {
  if (!Array.isArray(pairs)) return null;
  const vals = pairs
    .map((p) => (Array.isArray(p) ? p[1] : p))
    .filter((v) => v != null && v !== "" && Number.isFinite(Number(v)))
    .map(Number);
  return vals.length >= 2 ? vals.slice(-n) : null;
}

// Build a {field:[…]} spark object from a history entry, dropping empty fields.
function sparkObj(entry, fields) {
  if (!entry) return null;
  const out = {};
  for (const f of fields) { const t = tail(entry[f]); if (t) out[f] = t; }
  return Object.keys(out).length ? out : null;
}

export function enrich(latest, energyHist, fuelHist, commodityHist) {
  let de = 0, df = 0, dc = 0;
  for (const row of latest.DATA || []) {
    const s = sparkObj((energyHist.series || {})[row.geo], ["elecRes", "elecBiz", "gasRes"]);
    if (s) { row.spark = s; de++; } else delete row.spark;
  }
  for (const row of latest.FUEL_DATA || []) {
    const s = sparkObj((fuelHist.series || {})[row.geo], ["petrol", "diesel"]);
    if (s) { row.spark = s; df++; } else delete row.spark;
  }
  for (const row of latest.COMMODITIES || []) {
    const t = tail(((commodityHist.series || {})[row.name] || {}).points);
    if (t) { row.spark = t; dc++; } else delete row.spark;
  }
  return { de, df, dc };
}

async function main() {
  const dry = process.argv.includes("--dry");
  const latest = readJson(LATEST, null);
  if (!latest) throw new Error("latest.json not found");
  const energyHist = readJson(path.join(DIR, "energy-history.json"), { series: {} });
  const fuelHist = readJson(path.join(DIR, "fuel-history.json"), { series: {} });
  const commodityHist = readJson(path.join(DIR, "commodity-history.json"), { series: {} });

  const { de, df, dc } = enrich(latest, energyHist, fuelHist, commodityHist);
  console.log(`sparkline points stamped — ${de} energy · ${df} fuel · ${dc} commodity rows`);
  if (de + df + dc === 0) throw new Error("no history matched any row; aborting (check history files ran first)");

  if (dry) { console.log("--dry: writing nothing."); return; }
  fs.writeFileSync(LATEST, JSON.stringify(latest, null, 2) + "\n");
  console.log("\u2713 wrote latest.json with real sparkline series.");
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("\u2717 " + e.message); process.exit(1); });
}
