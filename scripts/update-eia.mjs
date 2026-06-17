// scripts/update-eia.mjs
// Pulls the latest MONTHLY US retail prices from the EIA API v2 into
// public/data/latest.json:
//   • electricity — residential & commercial, by state (retail-sales)
//   • natural gas — residential, by state (pri/sum, process PRS)
//
// Run from your project root:
//   EIA_API_KEY=your_key_here  node scripts/update-eia.mjs
//
// The key is read from the environment — never stored here — so this
// script is safe to commit to your public repo.

import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.EIA_API_KEY;
if (!API_KEY) {
  console.error("✗ Missing EIA_API_KEY.\n  Run:  EIA_API_KEY=your_key node scripts/update-eia.mjs");
  process.exit(1);
}

const DATA_FILE = path.join(process.cwd(), "public", "data", "latest.json");

// Dashboard state names -> EIA two-letter postal code (= electricity stateid,
// and the suffix of the natural-gas duoarea, e.g. "S" + "CA" = "SCA").
const POSTAL = {
  Hawaii: "HI", California: "CA", Massachusetts: "MA", Connecticut: "CT",
  "New York": "NY", Michigan: "MI", "New Jersey": "NJ", Illinois: "IL",
  Ohio: "OH", Colorado: "CO", Texas: "TX", Florida: "FL",
  Idaho: "ID", Washington: "WA", Louisiana: "LA", "North Dakota": "ND",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtPeriod = (p) => { const [y, m] = p.split("-"); return `${MONTHS[Number(m) - 1]} ${y}`; };
const round3 = (v) => Math.round(v * 1000) / 1000;
const MCF_TO_KWH = 303.9; // 1 thousand cu ft natural gas ≈ 303.9 kWh

async function eiaGet(route, extra) {
  const url = new URL(`https://api.eia.gov/v2/${route}/data/`);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("frequency", "monthly");
  url.searchParams.append("sort[0][column]", "period");
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.set("length", "5000");
  for (const [k, v] of extra) url.searchParams.append(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EIA ${route} ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (!json.response || !json.response.data) throw new Error(`Unexpected EIA ${route} response shape.`);
  return json.response.data;
}

// ── Electricity: residential (RES) & commercial (COM) price, cents/kWh ──
async function fetchElectricity() {
  const rows = await eiaGet("electricity/retail-sales", [
    ["data[]", "price"], ["facets[sectorid][]", "RES"], ["facets[sectorid][]", "COM"],
  ]);
  const latest = rows.reduce((m, r) => (r.period > m ? r.period : m), "");
  const byState = {};
  for (const r of rows) {
    if (r.period !== latest || r.price == null) continue;
    (byState[r.stateid] ??= {})[r.sectorid] = Number(r.price) / 100; // cents -> $/kWh
  }
  return { latest, byState };
}

// ── Natural gas: residential price (PRS), $/thousand cu ft -> $/kWh ──
async function fetchGas() {
  const rows = await eiaGet("natural-gas/pri/sum", [
    ["data[]", "value"], ["facets[process][]", "PRS"],
  ]);
  const latest = rows.reduce((m, r) => (r.period > m ? r.period : m), "");
  const byArea = {}, byName = {};
  for (const r of rows) {
    if (r.period !== latest || r.value == null) continue;
    const kwh = Number(r.value) / MCF_TO_KWH;
    if (!Number.isFinite(kwh)) continue;
    if (r.duoarea) byArea[r.duoarea] = kwh;
    if (r["area-name"]) byName[String(r["area-name"]).toLowerCase()] = kwh;
  }
  return { latest, byArea, byName };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const elec = await fetchElectricity();
  const gas = await fetchGas();
  if (!elec.latest) throw new Error("No electricity data returned from EIA.");
  let eUpd = 0, gUpd = 0;

  const us = data.DATA.find((d) => d.geo === "United States");
  if (us && elec.byState.US) {
    if (elec.byState.US.RES != null) { us.elecRes = round3(elec.byState.US.RES); eUpd++; }
    if (elec.byState.US.COM != null) { us.elecBiz = round3(elec.byState.US.COM); eUpd++; }
    us.period = fmtPeriod(elec.latest);
    us.source = "EIA";
  }
  if (us) {
    const v = gas.byArea.NUS ?? gas.byName["u.s."] ?? gas.byName["united states"];
    if (v != null) { us.gasRes = round3(v); gUpd++; }
  }

  for (const s of data.SUBNATIONAL["United States"] || []) {
    const code = POSTAL[s.name];
    const e = code && elec.byState[code];
    if (e) {
      if (e.RES != null) s.elecRes = round3(e.RES);
      if (e.COM != null) s.elecBiz = round3(e.COM);
      eUpd++;
    } else console.warn(`  (no EIA electricity for ${s.name})`);
    const g = (code && gas.byArea["S" + code]) ?? gas.byName[s.name.toLowerCase()];
    if (g != null) { s.gasRes = round3(g); gUpd++; }
  }

  if (gUpd === 0) {
    console.warn("  ⚠ No gas figures matched. Sample areas EIA returned:",
      Object.keys(gas.byArea).slice(0, 12));
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`✓ EIA update — electricity (${fmtPeriod(elec.latest)}): ${eUpd} figures · natural gas (${gas.latest ? fmtPeriod(gas.latest) : "n/a"}): ${gUpd} figures.`);
  if (us) console.log(`  US household — electricity $${us.elecRes}/kWh · gas $${us.gasRes}/kWh`);
}

main().catch((e) => { console.error("✗ " + e.message); process.exit(1); });
