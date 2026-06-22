// update-worldbank.mjs
// Pulls the latest month of metals, precious metals and agriculture prices from
// the World Bank "Pink Sheet" (CMO-Historical-Data-Monthly.xlsx, Monthly Prices
// sheet) and upserts them into COMMODITIES. Owns ONLY source "World Bank" rows,
// so the EIA energy rows (WTI/Brent/Henry Hub) are left untouched.
//
// Run from repo root:
//   node scripts/update-worldbank.mjs           (writes latest.json)
//   node scripts/update-worldbank.mjs --dry      (prints, writes nothing)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const RESEARCH = "https://www.worldbank.org/en/research/commodity-markets";
const DIRECT = "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx";
const MIRROR = "http://pubdocs.worldbank.org/en/561011486076393416/CMO-Historical-Data-Monthly.xlsx";
const SOURCE = "World Bank";
const SHEET = "Monthly Prices";
const H = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MON_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Commodities to surface. `match` = exact (trimmed) header name in row 5.
export const TARGETS = [
  // Base metals
  { match: "Aluminum", name: "Aluminum", cat: "base" },
  { match: "Copper", name: "Copper", cat: "base" },
  { match: "Iron ore, cfr spot", name: "Iron ore", cat: "base" },
  { match: "Nickel", name: "Nickel", cat: "base" },
  { match: "Zinc", name: "Zinc", cat: "base" },
  { match: "Lead", name: "Lead", cat: "base" },
  { match: "Tin", name: "Tin", cat: "base" },
  // Precious metals
  { match: "Gold", name: "Gold", cat: "precious" },
  { match: "Silver", name: "Silver", cat: "precious" },
  { match: "Platinum", name: "Platinum", cat: "precious" },
  // Agriculture
  { match: "Wheat, US HRW", name: "Wheat (US HRW)", cat: "ag" },
  { match: "Maize", name: "Maize (corn)", cat: "ag" },
  { match: "Soybeans", name: "Soybeans", cat: "ag" },
  { match: "Coffee, Arabica", name: "Coffee (Arabica)", cat: "ag" },
  { match: "Cocoa", name: "Cocoa", cat: "ag" },
  { match: "Sugar, world", name: "Sugar (world)", cat: "ag" },
  { match: "Cotton, A Index", name: "Cotton", cat: "ag" },
  { match: "Rice, Thai 5%", name: "Rice (Thai 5%)", cat: "ag" },

  // --- Expansion (curated from the World Bank Pink Sheet) ---
  // Energy (coexists with the EIA oil/gas benchmarks)
  { match: "Coal, Australian", name: "Coal", cat: "energy" },
  { match: "Natural gas, Europe", name: "Natural gas (Europe)", cat: "energy" },
  { match: "Liquefied natural gas, Japan", name: "LNG (Japan)", cat: "energy" },
  // Beverages
  { match: "Coffee, Robusta", name: "Coffee (Robusta)", cat: "ag" },
  { match: "Tea, avg 3 auctions", name: "Tea", cat: "ag" },
  // Edible oils & meals
  { match: "Palm oil", name: "Palm oil", cat: "ag" },
  { match: "Soybean oil", name: "Soybean oil", cat: "ag" },
  { match: "Soybean meal", name: "Soybean meal", cat: "ag" },
  { match: "Sunflower oil", name: "Sunflower oil", cat: "ag" },
  { match: "Rapeseed oil", name: "Rapeseed oil", cat: "ag" },
  { match: "Coconut oil", name: "Coconut oil", cat: "ag" },
  // Other foods
  { match: "Banana, US", name: "Banana", cat: "ag" },
  { match: "Beef", name: "Beef", cat: "ag" },
  { match: "Chicken", name: "Chicken", cat: "ag" },
  { match: "Lamb", name: "Lamb", cat: "ag" },
  // Raw materials
  { match: "Rubber, TSR20", name: "Rubber", cat: "ag" },
  // Fertilizers
  { match: "Urea", name: "Urea", cat: "ag" },
  { match: "DAP", name: "DAP (fertilizer)", cat: "ag" },
  { match: "Potassium chloride", name: "Potash", cat: "ag" },
  { match: "Phosphate rock", name: "Phosphate rock", cat: "ag" },
];

const round = (x, n) => { const p = 10 ** n; return Math.round(x * p) / p; };
const isNum = (v) => typeof v === "number" && isFinite(v);
const cleanUnit = (u) => (u == null ? "" : String(u).replace(/[()]/g, "").trim());
const norm = (s) => (s == null ? "" : String(s).replace(/\s*\*+\s*$/, "").replace(/\s+/g, " ").trim());

export function findMonthlyUrlFromHtml(html) {
  const m = html.match(/https?:\/\/[^"'\s)]*CMO-Historical-Data-Monthly\.xlsx/i);
  return m ? m[0] : null;
}

function cellVal(v) {
  if (v == null) return null;
  if (typeof v === "object") {
    if ("result" in v) return v.result;
    if ("text" in v) return v.text;
    return null;
  }
  return v;
}

export function sheetToGrid(ws) {
  const grid = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    grid[n] = (row.values || []).slice(1).map(cellVal);
  });
  return grid;
}

const DATE_RE = /^(\d{4})M(\d{2})$/;
function parsePeriod(code) {
  const m = DATE_RE.exec(String(code).trim());
  if (!m) return null;
  const mi = parseInt(m[2], 10) - 1;
  return MONTHS[mi] ? `${MONTHS[mi]} ${m[1]}` : null;
}

// Find the names row (has "Gold" & "Aluminum"), its units row, and the last two
// data rows (rows whose first cell is a YYYYMmm code).
export function locate(grid) {
  let namesIdx = -1;
  for (let i = 1; i < grid.length && i < 30; i++) {
    const r = (grid[i] || []).map(norm);
    if (r.includes("Gold") && r.includes("Aluminum")) { namesIdx = i; break; }
  }
  if (namesIdx < 0) throw new Error("could not find header row (Gold/Aluminum)");
  const dataIdx = [];
  for (let i = namesIdx + 1; i < grid.length; i++) {
    const c0 = grid[i] && grid[i][0];
    if (c0 != null && DATE_RE.test(String(c0).trim())) dataIdx.push(i);
  }
  if (dataIdx.length < 1) throw new Error("no data rows found");
  const dataRows = dataIdx.map((i) => grid[i]);
  return {
    names: grid[namesIdx],
    units: grid[namesIdx + 1] || [],
    dataRows,
    latest: dataRows[dataRows.length - 1],
    prior: dataRows.length >= 2 ? dataRows[dataRows.length - 2] : null,
  };
}

export function buildColMap(namesRow) {
  const map = new Map();
  (namesRow || []).forEach((v, i) => { const k = norm(v); if (k && !map.has(k)) map.set(k, i); });
  return map;
}

export function extract(grid) {
  const { names, units, latest, prior } = locate(grid);
  const col = buildColMap(names);
  const period = parsePeriod(latest[0]);
  const rows = [];
  const missing = [];
  for (const t of TARGETS) {
    const i = col.get(t.match);
    if (i == null) { missing.push(t.match); continue; }
    const price = latest[i];
    if (!isNum(price)) { missing.push(t.match + " (no latest)"); continue; }
    const prev = prior ? prior[i] : null;
    const chg = isNum(prev) && prev !== 0 ? round(((price - prev) / prev) * 100, 1) : 0;
    rows.push({ name: t.name, cat: t.cat, price: round(price, 2), unit: cleanUnit(units[i]) || "$/mt", chg, source: SOURCE, period });
  }
  return { period, rows, missing };
}

export function upsert(data, rows) {
  const others = (data.COMMODITIES || []).filter((c) => c.source !== SOURCE);
  data.COMMODITIES = others.concat(rows);
  return data;
}

// Build a per-commodity monthly history (capped at the most recent `cap` points,
// ~25 years by default) for the price-history pages. Keyed by display name so it
// lines up with the COMMODITIES rows.
export function extractHistory(grid, cap = 300) {
  const { names, units, dataRows } = locate(grid);
  const col = buildColMap(names);
  const updated = parsePeriod(dataRows[dataRows.length - 1][0]);
  const series = {};
  for (const t of TARGETS) {
    const i = col.get(t.match);
    if (i == null) continue;
    let pts = [];
    for (const r of dataRows) {
      const code = r[0] == null ? null : String(r[0]).trim();
      const v = r[i];
      if (code && DATE_RE.test(code) && isNum(v)) pts.push([code, round(v, 2)]);
    }
    if (cap && pts.length > cap) pts = pts.slice(pts.length - cap);
    if (pts.length) series[t.name] = { name: t.name, cat: t.cat, unit: cleanUnit(units[i]) || "$/mt", points: pts };
  }
  return { source: "World Bank Pink Sheet", updated, series };
}

async function getText(url) {
  const r = await fetch(url, { headers: { ...H, Accept: "text/html,*/*" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}
async function getBuffer(url) {
  const r = await fetch(url, { headers: { ...H, Accept: "*/*" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return Buffer.from(await r.arrayBuffer());
}

async function resolveUrl() {
  try {
    const html = await getText(RESEARCH);
    const u = findMonthlyUrlFromHtml(html);
    if (u) { console.log("link from research page:", u); return u; }
  } catch (e) { console.log("research scrape failed:", e.message); }
  console.log("using fallback direct URL");
  return DIRECT;
}

async function downloadWorkbook() {
  const primary = await resolveUrl();
  for (const u of [primary, DIRECT, MIRROR]) {
    try { const b = await getBuffer(u); console.log("downloaded", b.length, "bytes"); return b; }
    catch (e) { console.log("download failed", u, "—", e.message); }
  }
  throw new Error("could not download Pink Sheet from any source");
}

async function main() {
  const dry = process.argv.includes("--dry");
  const list = process.argv.includes("--list");
  const latestPath = path.join(process.cwd(), "public", "data", "latest.json");
  const raw = fs.readFileSync(latestPath, "utf8");
  const data = JSON.parse(raw);

  const buf = await downloadWorkbook();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.getWorksheet(SHEET) || wb.worksheets.find((s) => s.rowCount > 50);
  if (!ws) throw new Error("Monthly Prices sheet not found");
  const grid = sheetToGrid(ws);

  if (list) {
    const { names, units, latest } = locate(grid);
    const col = buildColMap(names);
    console.log("\nPink Sheet columns — name | unit | latest value:");
    for (const [name, i] of col) {
      console.log(`  ${name}  |  ${cleanUnit(units[i]) || "-"}  |  ${isNum(latest[i]) ? latest[i] : "-"}`);
    }
    console.log(`\n(${col.size} columns total)`);
    return;
  }

  const { period, rows, missing } = extract(grid);
  console.log("\nlatest period:", period, "| extracted", rows.length, "commodities");
  for (const r of rows) console.log("  " + r.cat.padEnd(8) + r.name.padEnd(18) + r.price + " " + r.unit + "  (" + (r.chg >= 0 ? "+" : "") + r.chg + "%)");
  if (missing.length) console.log("MISSING:", missing.join(", "));
  if (rows.length < 10) throw new Error("only " + rows.length + " parsed; aborting (no write)");

  // keep the COMMODITY_CATS that already exist; just ensure base/precious/ag are present
  const haveCats = new Set((data.COMMODITY_CATS || []).map((c) => c.key));
  for (const need of ["base", "precious", "ag"]) {
    if (!haveCats.has(need)) console.log("NOTE: COMMODITY_CATS missing category:", need);
  }

  upsert(data, rows);
  const energy = data.COMMODITIES.filter((c) => c.source !== SOURCE).length;
  console.log("\nCOMMODITIES now:", data.COMMODITIES.length, "(" + rows.length + " World Bank + " + energy + " other)");

  if (dry) { console.log("--dry: not writing."); return; }
  const pretty = /\n\s/.test(raw.slice(0, 300));
  fs.writeFileSync(latestPath, JSON.stringify(data, null, pretty ? 2 : 0));
  console.log("wrote latest.json");

  // Also emit the monthly back-history for the per-commodity price pages.
  // MERGE into the shared history file: set our (World Bank) series and leave
  // every other source's series (e.g. EIA energy) untouched, regardless of run order.
  const hist = extractHistory(grid);
  const histPath = path.join(process.cwd(), "public", "data", "commodity-history.json");
  let existingHist = { series: {} };
  try { existingHist = JSON.parse(fs.readFileSync(histPath, "utf8")); } catch {}
  const mergedHist = {
    source: "Multiple official sources (EIA, World Bank)",
    updated: hist.updated || existingHist.updated || null,
    series: { ...(existingHist.series || {}), ...hist.series },
  };
  fs.writeFileSync(histPath, JSON.stringify(mergedHist));
  const counts = Object.values(hist.series).map((s) => s.points.length);
  console.log("merged commodity-history.json —", Object.keys(hist.series).length, "World Bank series, up to", Math.max(0, ...counts), "months each;", Object.keys(mergedHist.series).length, "total in file");
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
}
