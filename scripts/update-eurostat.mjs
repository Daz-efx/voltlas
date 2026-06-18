// scripts/update-eurostat.mjs
// Pulls the latest bi-annual European retail energy prices from Eurostat into
// public/data/latest.json (no API key required). Covers the full EU27 + EFTA
// (Norway, Iceland). Creates any country not yet in the dataset, with its
// currency / display code / price-level metadata, then fills:
//   • electricity, household      nrg_pc_204, band DC (2500-4999 kWh) -> elecRes
//   • electricity, non-household  nrg_pc_205, band IC (500-1999 MWh)  -> elecBiz
//   • natural gas, household       nrg_pc_202, band D2 (20-199 GJ)     -> gasRes
// All all-taxes-included, EUR/kWh, converted to USD via the FX rate in the file.
//
// Run from your project root:   node scripts/update-eurostat.mjs

import fs from "node:fs";
import path from "node:path";

const DATA_FILE = path.join(process.cwd(), "public", "data", "latest.json");

// name -> { eu: Eurostat geo code, code: display ISO2, ccy, pli (price-level, US=100) }
// Greece is "EL" in Eurostat. UK is intentionally absent (kept on DESNZ).
const COUNTRIES = {
  Germany: { eu: "DE", code: "DE", ccy: "EUR", pli: 100 },
  Denmark: { eu: "DK", code: "DK", ccy: "DKK", pli: 125 },
  Ireland: { eu: "IE", code: "IE", ccy: "EUR", pli: 120 },
  Italy: { eu: "IT", code: "IT", ccy: "EUR", pli: 95 },
  Belgium: { eu: "BE", code: "BE", ccy: "EUR", pli: 108 },
  Netherlands: { eu: "NL", code: "NL", ccy: "EUR", pli: 110 },
  Austria: { eu: "AT", code: "AT", ccy: "EUR", pli: 105 },
  Czechia: { eu: "CZ", code: "CZ", ccy: "CZK", pli: 70 },
  France: { eu: "FR", code: "FR", ccy: "EUR", pli: 105 },
  Greece: { eu: "EL", code: "GR", ccy: "EUR", pli: 80 },
  Poland: { eu: "PL", code: "PL", ccy: "PLN", pli: 60 },
  Spain: { eu: "ES", code: "ES", ccy: "EUR", pli: 85 },
  Portugal: { eu: "PT", code: "PT", ccy: "EUR", pli: 80 },
  Romania: { eu: "RO", code: "RO", ccy: "RON", pli: 55 },
  Finland: { eu: "FI", code: "FI", ccy: "EUR", pli: 115 },
  Sweden: { eu: "SE", code: "SE", ccy: "SEK", pli: 110 },
  Hungary: { eu: "HU", code: "HU", ccy: "HUF", pli: 60 },
  Norway: { eu: "NO", code: "NO", ccy: "NOK", pli: 122 },
  // EU27 completion + Iceland
  Bulgaria: { eu: "BG", code: "BG", ccy: "BGN", pli: 50 },
  Croatia: { eu: "HR", code: "HR", ccy: "EUR", pli: 65 },
  Cyprus: { eu: "CY", code: "CY", ccy: "EUR", pli: 88 },
  Estonia: { eu: "EE", code: "EE", ccy: "EUR", pli: 85 },
  Latvia: { eu: "LV", code: "LV", ccy: "EUR", pli: 75 },
  Lithuania: { eu: "LT", code: "LT", ccy: "EUR", pli: 70 },
  Luxembourg: { eu: "LU", code: "LU", ccy: "EUR", pli: 125 },
  Malta: { eu: "MT", code: "MT", ccy: "EUR", pli: 85 },
  Slovenia: { eu: "SI", code: "SI", ccy: "EUR", pli: 78 },
  Slovakia: { eu: "SK", code: "SK", ccy: "EUR", pli: 72 },
  Iceland: { eu: "IS", code: "IS", ccy: "ISK", pli: 130 },
};

// FX entries to introduce if the data file doesn't already have them.
const FX_ADD = {
  BGN: { usd: 0.554, sym: "BGN" }, // lev, pegged to EUR
  ISK: { usd: 0.0073, sym: "ISK" }, // Icelandic króna
};

const round3 = (v) => Math.round(v * 1000) / 1000;
const fmtSemester = (p) => {
  const m = String(p).match(/(\d{4}).*?S?([12])/);
  return m ? `H${m[2]} ${m[1]}` : String(p);
};

export function parseGeo(j) {
  if (!j.dimension || !j.value || !j.id || !j.size) throw new Error("no values");
  const gpos = j.id.indexOf("geo");
  let stride = 1;
  for (let i = gpos + 1; i < j.size.length; i++) stride *= j.size[i];
  const index = j.dimension.geo.category.index;
  const values = {};
  for (const [code, gi] of Object.entries(index)) {
    const v = j.value[gi * stride];
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
  for (const [ccy, rate] of Object.entries(FX_ADD)) if (!(ccy in data.FX)) data.FX[ccy] = rate;

  const elecH = await tryFetch("electricity household", "nrg_pc_204",
    { nrg_cons: "KWH2500-4999", unit: "KWH", tax: "I_TAX", currency: "EUR" });
  const elecB = await tryFetch("electricity business", "nrg_pc_205",
    { nrg_cons: "MWH500-1999", unit: "KWH", tax: "I_TAX", currency: "EUR" });
  const gasH = await tryFetch("gas household", "nrg_pc_202",
    { nrg_cons: "GJ20-199", unit: "KWH", tax: "I_TAX", currency: "EUR" });

  const period = elecH.period ? fmtSemester(elecH.period) : (gasH.period ? fmtSemester(gasH.period) : null);
  let updated = 0, added = 0;

  for (const [name, info] of Object.entries(COUNTRIES)) {
    let row = data.DATA.find((d) => d.geo === name);
    if (!row) {
      row = { geo: name, code: info.code, region: "Europe", elecRes: null, elecBiz: null, gasRes: null, source: "Eurostat", period: period || "H2 2025" };
      data.DATA.push(row);
      added++;
    }
    if (!(name in data.COUNTRY_CCY)) data.COUNTRY_CCY[name] = info.ccy;
    if (!(name in data.PLI)) data.PLI[name] = info.pli;

    const eh = elecH.values[info.eu], eb = elecB.values[info.eu], gh = gasH.values[info.eu];
    let touched = false;
    if (eh != null) { row.elecRes = round3(eh * eurToUsd); touched = true; }
    if (eb != null) { row.elecBiz = round3(eb * eurToUsd); touched = true; }
    if (gh != null) { row.gasRes = round3(gh * eurToUsd); touched = true; }
    if (touched) { row.source = "Eurostat"; if (period) row.period = period; updated++; }
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`✓ Eurostat update — ${updated} European countries with live data (${added} newly added)${period ? " · " + period : ""}.`);
  const newOnes = ["Luxembourg", "Bulgaria", "Iceland", "Estonia"].map((n) => {
    const r = data.DATA.find((d) => d.geo === n); return r ? `${n} $${r.elecRes}` : null;
  }).filter(Boolean);
  console.log("  new e.g.: " + newOnes.join(" · "));
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main().catch((e) => { console.error("✗ " + e.message); process.exit(1); });
