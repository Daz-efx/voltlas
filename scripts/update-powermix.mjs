// scripts/update-powermix.mjs
// Electricity generation mix (% by source) + carbon intensity per country,
// from Ember's yearly electricity data as packaged in the Our World in Data
// energy dataset (CC BY 4.0; Ember aggregates EIA, Eurostat, UN & national
// statistics). One tidy CSV, shares pre-computed. Annual data.
//
// Writes public/data/power-mix.json keyed by country:
//   { updated, source, series: { "<geo>": { year, ci, genTWh, mix:{...} } } }
// where mix holds nine mutually-exclusive shares that sum to ~100%.
//
//   node scripts/update-powermix.mjs          (writes power-mix.json)
//   node scripts/update-powermix.mjs --dry      (prints a few, writes nothing)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CSV_URL = "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv";
const OUT = path.join(process.cwd(), "public", "data", "power-mix.json");
const SOURCE = "Ember (via Our World in Data)";

// fuel key -> OWID share column. Mutually exclusive so the bar sums to ~100%.
const FUELS = [
  ["coal", "coal_share_elec"],
  ["oil", "oil_share_elec"],
  ["gas", "gas_share_elec"],
  ["nuclear", "nuclear_share_elec"],
  ["hydro", "hydro_share_elec"],
  ["wind", "wind_share_elec"],
  ["solar", "solar_share_elec"],
  ["bioenergy", "biofuel_share_elec"],
  ["other", "other_renewables_share_elec_exc_biofuel"],
];

export function parseCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else { if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; }
  }
  out.push(cur);
  return out;
}

// CSV text -> { country: { year, ci, genTWh, mix:{fuel:share} } }, latest year
// with a real mix per country.
export function extractMix(csvText) {
  const lines = csvText.split(/\r?\n/);
  const header = parseCsvLine(lines[0].replace(/^\uFEFF/, ""));
  const ix = (name) => header.indexOf(name);
  const iCountry = ix("country"), iYear = ix("year");
  const iCi = ix("carbon_intensity_elec"), iGen = ix("electricity_generation");
  const fuelIx = FUELS.map(([k, col]) => [k, ix(col)]);
  if (iCountry < 0 || iYear < 0 || fuelIx.some(([, j]) => j < 0)) throw new Error("expected OWID columns not found");

  const series = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const r = parseCsvLine(lines[i]);
    const country = r[iCountry];
    const year = parseInt(r[iYear], 10);
    if (!country || !year) continue;
    const mix = {}; let any = false, sum = 0;
    for (const [k, j] of fuelIx) {
      const v = r[j];
      if (v === "" || v == null) { mix[k] = null; continue; }
      const n = Number(v);
      if (!isFinite(n)) { mix[k] = null; continue; }
      mix[k] = Math.round(n * 10) / 10; any = true; sum += mix[k];
    }
    if (!any || sum < 50) continue; // skip rows without a genuine, full mix
    if (series[country] && series[country].year >= year) continue;
    const ciN = Number(r[iCi]); const genN = Number(r[iGen]);
    series[country] = {
      year,
      ci: r[iCi] !== "" && isFinite(ciN) ? Math.round(ciN) : null,
      genTWh: r[iGen] !== "" && isFinite(genN) ? Math.round(genN) : null,
      mix,
    };
  }
  return series;
}

async function main() {
  const dry = process.argv.includes("--dry");
  console.log("downloading Ember/OWID energy CSV…");
  const res = await fetch(CSV_URL, { headers: { "User-Agent": "Voltlas/1.0 (+https://voltlas.com)" } });
  if (!res.ok) throw new Error(`CSV HTTP ${res.status}`);
  const csv = await res.text();
  console.log(`parsing ${(csv.length / 1e6).toFixed(1)} MB…`);

  const series = extractMix(csv);
  const n = Object.keys(series).length;
  if (n < 100) throw new Error(`only ${n} countries parsed; aborting`);
  console.log(`parsed mix for ${n} countries`);

  for (const c of ["France", "Poland", "Norway", "United States"]) {
    const s = series[c];
    if (s) console.log(`  ${c} (${s.year}): ${Object.entries(s.mix).filter(([, v]) => v).map(([k, v]) => `${k} ${v}%`).join(", ")} · ${s.ci} gCO2/kWh`);
  }

  if (dry) { console.log(`\n--dry: would write ${n} countries.`); return; }
  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), source: SOURCE, series }));
  console.log(`\n\u2713 wrote power-mix.json — ${n} countries.`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("\u2717 " + e.message); process.exit(1); });
}
