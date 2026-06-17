// scripts/update-eia.mjs
// Pulls the latest MONTHLY US retail electricity prices (residential & commercial)
// by state from the EIA API v2 and writes them into public/data/latest.json.
//
// Run from your project root:
//   EIA_API_KEY=your_key_here  node scripts/update-eia.mjs
//
// The key is read from the environment — it is never stored in this file,
// so this script is safe to commit to your public repo.

import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.EIA_API_KEY;
if (!API_KEY) {
  console.error("✗ Missing EIA_API_KEY.\n  Run:  EIA_API_KEY=your_key node scripts/update-eia.mjs");
  process.exit(1);
}

const DATA_FILE = path.join(process.cwd(), "public", "data", "latest.json");

// Dashboard state names -> EIA two-letter stateid
const STATE_ID = {
  Hawaii: "HI", California: "CA", Massachusetts: "MA", Connecticut: "CT",
  "New York": "NY", Michigan: "MI", "New Jersey": "NJ", Illinois: "IL",
  Ohio: "OH", Colorado: "CO", Texas: "TX", Florida: "FL",
  Idaho: "ID", Washington: "WA", Louisiana: "LA", "North Dakota": "ND",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtPeriod = (p) => { const [y, m] = p.split("-"); return `${MONTHS[Number(m) - 1]} ${y}`; };
const round3 = (v) => Math.round(v * 1000) / 1000;

async function fetchEIA() {
  const url = new URL("https://api.eia.gov/v2/electricity/retail-sales/data/");
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("frequency", "monthly");
  url.searchParams.append("data[]", "price");
  url.searchParams.append("facets[sectorid][]", "RES"); // residential -> elecRes
  url.searchParams.append("facets[sectorid][]", "COM"); // commercial  -> elecBiz
  url.searchParams.append("sort[0][column]", "period");
  url.searchParams.append("sort[0][direction]", "desc");
  url.searchParams.set("length", "5000");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EIA API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (!json.response || !json.response.data) throw new Error("Unexpected EIA response shape.");
  return json.response.data;
}

function buildLatest(rows) {
  const latestPeriod = rows.reduce((m, r) => (r.period > m ? r.period : m), "");
  const byState = {}; // { stateid: { RES: $/kWh, COM: $/kWh } }
  for (const r of rows) {
    if (r.period !== latestPeriod || r.price == null) continue;
    (byState[r.stateid] ??= {})[r.sectorid] = Number(r.price) / 100; // cents -> dollars
  }
  return { latestPeriod, byState };
}

async function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const rows = await fetchEIA();
  const { latestPeriod, byState } = buildLatest(rows);
  if (!latestPeriod) throw new Error("No data returned from EIA.");
  const label = fmtPeriod(latestPeriod);
  let updates = 0;

  // US national row
  const us = data.DATA.find((d) => d.geo === "United States");
  if (us && byState.US) {
    if (byState.US.RES != null) { us.elecRes = round3(byState.US.RES); updates++; }
    if (byState.US.COM != null) { us.elecBiz = round3(byState.US.COM); updates++; }
    us.period = label;
    us.source = "EIA";
  } else {
    console.warn("  (no US national total returned — left unchanged)");
  }

  // US states (sub-national drill-down)
  for (const s of data.SUBNATIONAL["United States"] || []) {
    const id = STATE_ID[s.name];
    const p = id && byState[id];
    if (!p) { console.warn(`  (no EIA data for ${s.name})`); continue; }
    if (p.RES != null) s.elecRes = round3(p.RES);
    if (p.COM != null) s.elecBiz = round3(p.COM);
    updates++;
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`✓ Updated ${updates} US electricity figures from EIA (${label}).`);
  if (us) console.log(`  US household: $${us.elecRes}/kWh · business: $${us.elecBiz}/kWh`);
}

main().catch((e) => { console.error("✗ " + e.message); process.exit(1); });
