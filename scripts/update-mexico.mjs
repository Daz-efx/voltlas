// scripts/update-mexico.mjs
// Mexican retail pump prices (taxes incl.) from the CRE (Comisión Reguladora
// de Energía) official "precios vigentes" feed — the same station-level data
// published at datos.gob.mx, updated every few hours, in MXN/litre.
//
//   regular gasoline (Magna) -> petrol      diesel -> diesel
//
// The feed is ~thousands of individual stations, so we take the MEDIAN across
// all stations (robust to the feed's known "atypical"/stale outliers) to get a
// national average, then convert MXN/L -> USD/L with the MXN rate in
// latest.json (seeded if absent; the FX connector keeps it current from ECB).
//
// Owns the "Mexico" row of FUEL_DATA (source "CRE"); everything else preserved.
// State-level breakdown is intentionally omitted (the raw feed has no clean
// state field — only coordinates — so that would need geocoding).
//
//   node scripts/update-mexico.mjs          (writes latest.json)
//   node scripts/update-mexico.mjs --dry     (prints, writes nothing)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRICES_URL = "https://publicacionexterna.azurewebsites.net/publicaciones/prices";
const SOURCE = "CRE";
const DATA_FILE = path.join(process.cwd(), "public", "data", "latest.json");
const MXN_SEED = { usd: 0.054, sym: "MX$" };
const MIN_MXN = 5, MAX_MXN = 60; // sane per-litre band to drop zeros / capture errors
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const round3 = (v) => Math.round(v * 1000) / 1000;
const today = () => { const d = new Date(); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

// --- pure helpers (unit-tested) -----------------------------------------

export function median(nums) {
  const a = nums.filter((x) => isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

// Pull all prices of a given fuel type from the CRE prices XML.
export function pricesFor(xml, type) {
  const re = new RegExp(`<gas_price[^>]*type="${type}"[^>]*>\\s*([\\d.]+)\\s*</gas_price>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(xml))) {
    const v = Number(m[1]);
    if (isFinite(v) && v >= MIN_MXN && v <= MAX_MXN) out.push(v);
  }
  return out;
}

export function upsert(data, row) {
  data.FUEL_DATA = [...(data.FUEL_DATA || []).filter((r) => r.geo !== "Mexico"), row];
  return data;
}

// --- main ----------------------------------------------------------------

async function main() {
  const dry = process.argv.includes("--dry");
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  data.FX = data.FX || {};
  if (!data.FX.MXN) { data.FX.MXN = { ...MXN_SEED }; console.log("seeded FX.MXN (FX connector will refine from ECB)"); }
  const mxnUsd = data.FX.MXN.usd;

  console.log("fetching CRE prices feed…");
  const res = await fetch(PRICES_URL, { headers: { "User-Agent": "Voltlas/1.0 (+https://voltlas.com)", Accept: "application/xml,text/xml,*/*" } });
  if (!res.ok) throw new Error(`prices HTTP ${res.status}`);
  const xml = await res.text();

  const reg = pricesFor(xml, "regular");
  const dsl = pricesFor(xml, "diesel");
  console.log(`stations with a usable price — regular ${reg.length}, diesel ${dsl.length}`);
  if (reg.length < 100 && dsl.length < 100) throw new Error("too few prices parsed; feed shape may have changed (aborting)");

  const petrolMxn = median(reg), dieselMxn = median(dsl);
  const petrol = petrolMxn != null ? round3(petrolMxn * mxnUsd) : null;
  const diesel = dieselMxn != null ? round3(dieselMxn * mxnUsd) : null;
  const row = { geo: "Mexico", region: "N. America", petrol, diesel, source: SOURCE, period: today() };

  console.log(`\nMexico national medians — regular ${petrolMxn?.toFixed(2)} MXN/L -> $${petrol}/L · diesel ${dieselMxn?.toFixed(2)} MXN/L -> $${diesel}/L  (MXN→USD @ ${mxnUsd})`);

  if (dry) { console.log("\n--dry: nothing written."); return; }
  upsert(data, row);
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log("\n\u2713 wrote latest.json — Mexico national pump prices.");
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("\u2717 " + e.message); process.exit(1); });
}
