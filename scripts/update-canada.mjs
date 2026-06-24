// scripts/update-canada.mjs
// Canadian retail pump prices (taxes incl.) from Statistics Canada table
// 18-10-0001 "Monthly average retail prices for gasoline and fuel oil, by
// geography", via the free WDS REST API (no key). Monthly, cents/litre (CAD).
//
//   national + city regular unleaded gasoline -> petrol
//   national + city diesel at self service     -> diesel
//
// Converts CAD cents/L -> USD/L with the CAD rate in latest.json (seeded if
// absent; the FX connector keeps it current from ECB). Owns the "Canada" row
// of FUEL_DATA (source "Statistics Canada") + its city sub-national list;
// everything else is preserved.
//
// Self-discovers the table's geography & fuel members at runtime, so it keeps
// working if Statistics Canada renumbers them.
//
//   node scripts/update-canada.mjs          (writes latest.json)
//   node scripts/update-canada.mjs --dry     (prints, writes nothing)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WDS = "https://www150.statcan.gc.ca/t1/wds/rest";
const PRODUCT = 18100001;
const SOURCE = "Statistics Canada";
const DATA_FILE = path.join(process.cwd(), "public", "data", "latest.json");
const CAD_SEED = { usd: 0.73, sym: "C$" };
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const round3 = (v) => Math.round(v * 1000) / 1000;
const centsToUsdL = (cents, cadUsd) => round3((Number(cents) / 100) * cadUsd);
const fmtPer = (p) => { // "2026-03" -> "Mar 2026"
  const m = String(p).match(/(\d{4})-(\d{2})/);
  return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : String(p);
};
const cityName = (geo) => String(geo).split(",")[0].trim();

async function post(endpoint, body) {
  const res = await fetch(`${WDS}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}`);
  return res.json();
}

// --- pure helpers (unit-tested) -----------------------------------------

// From cube metadata, return { geo: [{id,name}], fuel: {regularId, dieselId} }.
export function readMembers(meta) {
  const obj = Array.isArray(meta) ? meta[0]?.object : meta?.object;
  const dims = obj?.dimension || [];
  const findDim = (re) => dims.find((d) => re.test(String(d.dimensionNameEn || "")));
  const geoDim = findDim(/geograph/i) || dims[0];
  const fuelDim = findDim(/fuel|product/i) || dims[1];
  const geo = (geoDim?.member || []).map((m) => ({ id: m.memberId, name: m.memberNameEn }));
  const fmembers = fuelDim?.member || [];
  const pick = (re) => { const m = fmembers.find((x) => re.test(String(x.memberNameEn || ""))); return m ? m.memberId : null; };
  const regularId = pick(/regular.*gasoline|gasoline.*regular/i);
  const dieselId = pick(/diesel/i);
  return { geo, regularId, dieselId };
}

export const coord = (geoId, fuelId) => `${geoId}.${fuelId}.0.0.0.0.0.0.0.0`;

// Map StatCan data responses -> { coordinate: {value, refPer} }.
export function indexData(rows) {
  const out = {};
  for (const r of rows || []) {
    const o = r.object || {};
    const dp = (o.vectorDataPoint || [])[0];
    if (o.coordinate && dp && dp.value != null) out[o.coordinate] = { value: Number(dp.value), refPer: dp.refPer };
  }
  return out;
}

// --- main ----------------------------------------------------------------

async function main() {
  const dry = process.argv.includes("--dry");
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  data.FX = data.FX || {};
  if (!data.FX.CAD) { data.FX.CAD = { ...CAD_SEED }; console.log("seeded FX.CAD (FX connector will refine from ECB)"); }
  const cadUsd = data.FX.CAD.usd;
  data.FUEL_DATA = data.FUEL_DATA || [];
  data.FUEL_SUBNATIONAL = data.FUEL_SUBNATIONAL || {};

  console.log("fetching cube metadata…");
  const meta = await post("getCubeMetadata", [{ productId: PRODUCT }]);
  const { geo, regularId, dieselId } = readMembers(meta);
  if (!geo.length) throw new Error("no geography members found");
  if (!regularId && !dieselId) throw new Error("could not locate regular-gasoline / diesel fuel members");
  console.log(`members: ${geo.length} geographies · regular=${regularId} diesel=${dieselId}`);

  // Build the coordinates we want (Canada + every city, for both fuels).
  const wants = [];
  for (const g of geo) {
    if (regularId) wants.push({ geo: g, fuel: "petrol", coordinate: coord(g.id, regularId) });
    if (dieselId) wants.push({ geo: g, fuel: "diesel", coordinate: coord(g.id, dieselId) });
  }
  console.log(`requesting ${wants.length} series…`);
  const reqs = wants.map((w) => ({ productId: PRODUCT, coordinate: w.coordinate, latestN: 12 }));
  const resp = await post("getDataFromCubePidCoordAndLatestNPeriods", reqs);
  const list = Array.isArray(resp) ? resp : [resp];

  // Assemble per-geography { petrol, diesel, refPer } by request order. The very
  // latest month is often an unpublished null placeholder, so per series we take
  // the most recent data point that actually has a value.
  const rows = {};
  let resolved = 0;
  for (let i = 0; i < wants.length; i++) {
    const w = wants[i];
    const o = list[i] && list[i].object ? list[i].object : null;
    const pts = (o && o.vectorDataPoint) || [];
    let best = null;
    for (const dp of pts) {
      if (dp.value == null) continue;
      if (!best || String(dp.refPer) > String(best.refPer)) best = dp;
    }
    if (!best) continue;
    resolved++;
    const name = w.geo.name;
    rows[name] = rows[name] || { geo: name, refPer: best.refPer };
    rows[name][w.fuel] = centsToUsdL(best.value, cadUsd);
    if (best.refPer && String(best.refPer) > String(rows[name].refPer || "")) rows[name].refPer = best.refPer;
  }
  console.log(`resolved ${resolved}/${wants.length} data points`);
  if (resolved === 0) {
    console.error("\nNo data points came back. Raw first response item (for debugging):");
    console.error(JSON.stringify(list[0], null, 2).slice(0, 1500));
    throw new Error("StatCan returned no usable data — see the raw item above");
  }

  const canada = rows["Canada"];
  if (!canada || (canada.petrol == null && canada.diesel == null)) throw new Error("no national Canada value resolved; aborting");
  const period = fmtPer(canada.refPer);

  const natRow = { geo: "Canada", region: "N. America", petrol: canada.petrol ?? null, diesel: canada.diesel ?? null, source: SOURCE, period };
  data.FUEL_DATA = [...data.FUEL_DATA.filter((r) => r.geo !== "Canada"), natRow];

  const subs = [];
  for (const [name, r] of Object.entries(rows)) {
    if (name === "Canada") continue;
    if (r.petrol == null && r.diesel == null) continue;
    subs.push({ name: cityName(name), petrol: r.petrol ?? null, diesel: r.diesel ?? null });
  }
  subs.sort((a, b) => (b.petrol ?? 0) - (a.petrol ?? 0));
  if (subs.length) data.FUEL_SUBNATIONAL["Canada"] = subs;

  console.log(`\nCanada (${period}): petrol ${natRow.petrol != null ? "$" + natRow.petrol + "/L" : "n/a"}, diesel ${natRow.diesel != null ? "$" + natRow.diesel + "/L" : "n/a"}  ·  ${subs.length} cities`);
  for (const s of subs.slice(0, 6)) console.log(`  ${cityName(s.name).padEnd(14)} petrol ${s.petrol != null ? "$" + s.petrol : "—"}  diesel ${s.diesel != null ? "$" + s.diesel : "—"}`);

  if (dry) { console.log("\n--dry: nothing written."); return; }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`\n\u2713 wrote latest.json — Canada national + ${subs.length} cities (CAD\u2192USD @ ${cadUsd}).`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("\u2717 " + e.message); process.exit(1); });
}
