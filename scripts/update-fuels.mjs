// scripts/update-fuels.mjs
// US retail transport-fuel prices (taxes included) from the EIA API v2
// "Gasoline and Diesel Fuel Update" (petroleum/pri/gnd, weekly) -> latest.json.
//
//   National regular gasoline   EMM_EPMR_PTE_NUS_DPG   $/gal
//   National on-highway diesel  EMD_EPD2D_PTE_NUS_DPG   $/gal
//   + EIA's selected-state regular gasoline series (best-effort)
//
// EIA reports $/US gallon; we store $/litre (the dashboard toggles back to
// $/gal on display). Each national price carries a ~1-month % change.
// This script OWNS the United States row of FUEL_DATA and its sub-national list;
// any other countries a future connector adds are preserved.
//
// It ALSO backfills ~10 years of weekly US gasoline & diesel history into
// public/data/fuel-history.json (shared with the EU connector), MERGING so it
// only sets its own "United States" entry. Non-fatal.
//
// Run from your project root:
//   EIA_API_KEY=your_key  node scripts/update-fuels.mjs

import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.EIA_API_KEY;
if (!API_KEY) {
  console.error("\u2717 Missing EIA_API_KEY.\n  Run:  EIA_API_KEY=your_key node scripts/update-fuels.mjs");
  process.exit(1);
}
const DATA_FILE = path.join(process.cwd(), "public", "data", "latest.json");
const FUEL_HIST = path.join(process.cwd(), "public", "data", "fuel-history.json");
const L_PER_GAL = 3.785411784;
const HIST_WEEKS = 520; // ~10 years of weekly points

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = (p) => { const d = new Date(p); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const perL = (perGal) => Math.round((perGal / L_PER_GAL) * 1000) / 1000; // $/gal -> $/L, 3dp
const round1 = (v) => Math.round(v * 10) / 10;

async function eiaSeries(series) {
  const url = new URL("https://api.eia.gov/v2/petroleum/pri/gnd/data/");
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("frequency", "weekly");
  url.searchParams.append("data[]", "value");
  url.searchParams.append("facets[series][]", series);
  url.searchParams.append("sort[0][column]", "period");
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.set("length", "20");
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

// Weekly history as ascending [ISO-date, $/L] pairs.
async function eiaHistory(series, length = HIST_WEEKS) {
  const url = new URL("https://api.eia.gov/v2/petroleum/pri/gnd/data/");
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("frequency", "weekly");
  url.searchParams.append("data[]", "value");
  url.searchParams.append("facets[series][]", series);
  url.searchParams.append("sort[0][column]", "period");
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.set("length", String(length));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${series} history HTTP ${res.status}`);
  const rows = ((await res.json()).response?.data || []).filter((r) => r.value != null);
  return rows.map((r) => [String(r.period).slice(0, 10), perL(Number(r.value))]).reverse();
}

// Merge our (US) entry into the shared fuel-history file, leaving other geos alone.
function mergeFuelHistory(geo, region, petrol, diesel) {
  let ex = { series: {} };
  try { ex = JSON.parse(fs.readFileSync(FUEL_HIST, "utf8")); } catch {}
  const series = { ...(ex.series || {}) };
  series[geo] = { geo, region, petrol, diesel };
  const out = { updated: new Date().toISOString().slice(0, 10), series };
  fs.writeFileSync(FUEL_HIST, JSON.stringify(out));
  return Object.keys(series).length;
}

async function tryS(label, series) {
  try {
    const r = await eiaSeries(series);
    console.log(`  ${label}: $${r.value}/gal (${fmtDate(r.period)})`);
    return r;
  } catch (e) {
    console.warn(`  \u26a0 ${label} failed (${e.message})`);
    return null;
  }
}

const STATES = [
  { name: "California",    series: "EMM_EPMR_PTE_SCA_DPG" },
  { name: "Washington",    series: "EMM_EPMR_PTE_SWA_DPG" },
  { name: "New York",      series: "EMM_EPMR_PTE_SNY_DPG" },
  { name: "Massachusetts", series: "EMM_EPMR_PTE_SMA_DPG" },
  { name: "Florida",       series: "EMM_EPMR_PTE_SFL_DPG" },
  { name: "Colorado",      series: "EMM_EPMR_PTE_SCO_DPG" },
  { name: "Ohio",          series: "EMM_EPMR_PTE_SOH_DPG" },
  { name: "Minnesota",     series: "EMM_EPMR_PTE_SMN_DPG" },
  { name: "Texas",         series: "EMM_EPMR_PTE_STX_DPG" },
];

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  data.FUEL_DATA = data.FUEL_DATA || [];
  data.FUEL_SUBNATIONAL = data.FUEL_SUBNATIONAL || {};

  console.log("National:");
  const gas = await tryS("Regular gasoline", "EMM_EPMR_PTE_NUS_DPG");
  const dsl = await tryS("On-highway diesel", "EMD_EPD2D_PTE_NUS_DPG");

  const priorUS = data.FUEL_DATA.find((d) => d.geo === "United States");
  if (gas || dsl || priorUS) {
    const petrol = gas ? perL(gas.value) : priorUS?.petrol ?? null;
    const diesel = dsl ? perL(dsl.value) : priorUS?.diesel ?? null;
    const period = fmtDate((gas || dsl)?.period || new Date());
    const us = { geo: "United States", region: "N. America", petrol, diesel, source: "EIA", period };
    data.FUEL_DATA = [us, ...data.FUEL_DATA.filter((d) => d.geo !== "United States")];
    if (gas) console.log(`  -> US petrol $${petrol}/L, diesel ${diesel != null ? "$" + diesel + "/L" : "n/a"} (gasoline ${round1(gas.chg)}% MoM)`);
  } else {
    console.warn("  \u26a0 no national data and no prior US row \u2014 US left out");
  }

  console.log("Selected states (gasoline):");
  const subs = [];
  for (const s of STATES) {
    const r = await tryS(s.name, s.series);
    if (r) subs.push({ name: s.name, petrol: perL(r.value), diesel: null });
  }
  subs.sort((a, b) => b.petrol - a.petrol);
  if (subs.length) data.FUEL_SUBNATIONAL["United States"] = subs;
  else delete data.FUEL_SUBNATIONAL["United States"];

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`\u2713 Transport fuels \u2014 US national ${gas || dsl ? "written" : "unchanged"}, ${subs.length}/${STATES.length} states resolved.`);

  // --- Weekly history backfill for the per-country fuel charts (merged, non-fatal) ---
  try {
    const petrolH = gas ? await eiaHistory("EMM_EPMR_PTE_NUS_DPG") : [];
    const dieselH = dsl ? await eiaHistory("EMD_EPD2D_PTE_NUS_DPG") : [];
    if (petrolH.length || dieselH.length) {
      const n = mergeFuelHistory("United States", "N. America", petrolH, dieselH);
      console.log(`  fuel history: US gasoline ${petrolH.length}, diesel ${dieselH.length} weeks (${n} geos in file)`);
    }
  } catch (e) {
    console.warn("  \u26a0 US fuel history failed:", e.message);
  }
}

main().catch((e) => { console.error("\u2717 " + e.message); process.exit(1); });
