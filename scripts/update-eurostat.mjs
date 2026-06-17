// scripts/update-eurostat.mjs
// Pulls the latest bi-annual European retail energy prices from Eurostat into
// public/data/latest.json (no API key required):
//   • electricity, household      nrg_pc_204, band DC (2500-4999 kWh)  -> elecRes
//   • electricity, non-household  nrg_pc_205, band IC (500-1999 MWh)   -> elecBiz
//   • natural gas, household       nrg_pc_202, band D2 (20-199 GJ)      -> gasRes
// All all-taxes-included, in EUR/kWh, converted to USD via the FX rate already
// stored in latest.json.
//
// Run from your project root:   node scripts/update-eurostat.mjs

import fs from "node:fs";
import path from "node:path";

const DATA_FILE = path.join(process.cwd(), "public", "data", "latest.json");

// Dashboard country name -> Eurostat geo code.
// UK omitted on purpose (we keep the DESNZ figure). Greece is "EL" in Eurostat.
const GEO = {
  Germany: "DE", Denmark: "DK", Ireland: "IE", Italy: "IT", Belgium: "BE",
  Netherlands: "NL", Austria: "AT", Czechia: "CZ", France: "FR", Greece: "EL",
  Poland: "PL", Spain: "ES", Portugal: "PT", Romania: "RO", Finland: "FI",
  Sweden: "SE", Hungary: "HU", Norway: "NO",
};

const round3 = (v) => Math.round(v * 1000) / 1000;
const fmtSemester = (p) => {
  const m = String(p).match(/(\d{4}).*?S?([12])/); // "2025-S2" or "2025S2"
  return m ? `H${m[2]} ${m[1]}` : String(p);
};

// Parse a Eurostat JSON-stat response where every dimension except geo (and
// time, size 1 via lastTimePeriod) has been filtered to a single value.
export function parseGeo(j) {
  if (!j.dimension || !j.value || !j.id || !j.size) throw new Error("no values");
  const gpos = j.id.indexOf("geo");
  let stride = 1;
  for (let i = gpos + 1; i < j.size.length; i++) stride *= j.size[i];
  const index = j.dimension.geo.category.index; // { DE: 0, FR: 1, ... }
  const values = {};
  for (const [code, gi] of Object.entries(index)) {
    const v = j.value[gi * stride]; // all other dims sit at index 0
    if (v != null) values[code] = Number(v);
  }
  const period = Object.keys(j.dimension.time.category.index)[0];
  return { values, period };
}

async function eurostat(dataset, filters) {
  const url = new URL(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${dataset}`);
  url.searchParams.set("format", "JSON");
  url.searchParams.set("lang", "EN");
  url.searchParams.set("lastTimePeriod", "1");
  for (const [k, v] of Object.entries(filters)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${dataset} HTTP ${res.status}`);
  return parseGeo(await res.json());
}

async function tryFetch(label, dataset, filters) {
  try {
    const r = await eurostat(dataset, filters);
    console.log(`  ${label}: ${Object.keys(r.values).length} countries (${fmtSemester(r.period)})`);
    return r;
  } catch (e) {
    console.warn(`  ⚠ ${label} failed (${e.message}) — those values left unchanged`);
    return { values: {}, period: null };
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const eurToUsd = data.FX?.EUR?.usd ?? 1.084;

  const elecH = await tryFetch("electricity household", "nrg_pc_204",
    { nrg_cons: "KWH2500-4999", unit: "KWH", tax: "I_TAX", currency: "EUR" });
  const elecB = await tryFetch("electricity business", "nrg_pc_205",
    { nrg_cons: "MWH500-1999", unit: "KWH", tax: "I_TAX", currency: "EUR" });
  const gasH = await tryFetch("gas household", "nrg_pc_202",
    { nrg_cons: "GJ20-199", unit: "KWH", tax: "I_TAX", currency: "EUR" });

  const period = elecH.period ? fmtSemester(elecH.period) : null;
  let updated = 0;

  for (const [name, code] of Object.entries(GEO)) {
    const row = data.DATA.find((d) => d.geo === name);
    if (!row) continue;
    let touched = false;
    if (elecH.values[code] != null) { row.elecRes = round3(elecH.values[code] * eurToUsd); touched = true; }
    if (elecB.values[code] != null) { row.elecBiz = round3(elecB.values[code] * eurToUsd); touched = true; }
    if (gasH.values[code] != null) { row.gasRes = round3(gasH.values[code] * eurToUsd); touched = true; }
    if (touched) {
      row.source = "Eurostat";
      if (period) row.period = period;
      updated++;
    } else {
      console.warn(`  (no Eurostat data matched for ${name})`);
    }
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`✓ Eurostat update — ${updated} European countries refreshed${period ? " (" + period + ")" : ""}.`);
  const de = data.DATA.find((d) => d.geo === "Germany");
  if (de) console.log(`  e.g. Germany — electricity $${de.elecRes}/kWh · gas $${de.gasRes}/kWh`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main().catch((e) => { console.error("✗ " + e.message); process.exit(1); });
