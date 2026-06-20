// update-eu-fuels.mjs
// Pulls EU consumer pump prices (taxes incl.) from the EC Weekly Oil Bulletin
// "prices with taxes" xlsx, converts EUR/1000L -> USD/L using the EUR rate
// already in latest.json, and upserts the 27 EU country rows into FUEL_DATA.
//
// Owns ONLY rows with source "EC Oil Bulletin" (leaves the US/EIA row alone).
// Run from repo root:
//   node scripts/update-eu-fuels.mjs           (writes latest.json)
//   node scripts/update-eu-fuels.mjs --dry      (prints, writes nothing)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const PAGE = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en";
const HOST = "https://energy.ec.europa.eu";
const SOURCE = "EC Oil Bulletin";
const BASE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// The 27 EU member states, spelled to match latest.json DATA geos.
export const EU_27 = new Set([
  "Austria","Belgium","Bulgaria","Croatia","Cyprus","Czechia","Denmark",
  "Estonia","Finland","France","Germany","Greece","Hungary","Ireland",
  "Italy","Latvia","Lithuania","Luxembourg","Malta","Netherlands","Poland",
  "Portugal","Romania","Slovakia","Slovenia","Spain","Sweden",
]);

const decEnt = (s) =>
  s.replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,"<").replace(/&gt;/g,">");
const stripTags = (s) => decEnt(s.replace(/<[^>]+>/g," ").replace(/\s+/g," ")).trim();
const absUrl = (h) => (h.startsWith("http") ? h : HOST + (h.startsWith("/") ? h : "/" + h));
const round3 = (x) => Math.round(x * 1000) / 1000;

// --- pure helpers (unit-tested) -----------------------------------------

export function findXlsxUrlFromHtml(html) {
  const re = /href\s*=\s*"([^"]*document\/download\/[^"]*)"/gi;
  const items = []; let m;
  while ((m = re.exec(html))) {
    const href = decEnt(m[1]);
    const label = stripTags(html.slice(Math.max(0, m.index - 220), m.index)).slice(-110);
    items.push({ href, label });
  }
  const dec = (h) => { try { return decodeURIComponent(h); } catch { return h; } };
  const hay = (it) => (dec(it.href) + " " + it.label).toLowerCase();
  const cand =
    items.find((it) => {
      const h = hay(it);
      return h.includes("with taxes") && !h.includes("without") && h.includes(".xlsx");
    }) ||
    items.find((it) => hay(it).includes("prices with taxes"));
  return cand ? absUrl(cand.href) : null;
}

function cellVal(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return v.result;
    if ("text" in v) return v.text;
    return null;
  }
  return v;
}

// Turn a worksheet into a 1-based-trimmed grid of plain values.
export function sheetToGrid(ws) {
  const grid = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    grid[n] = (row.values || []).slice(1).map(cellVal);
  });
  return grid;
}

function fmtDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return null;
  return dt.getUTCDate() + " " + MONTHS[dt.getUTCMonth()] + " " + dt.getUTCFullYear();
}

// Locate petrol/diesel columns from the header row; fall back to fixed indices.
export function findColumns(headerRow) {
  const h = (headerRow || []).map((x) => (x == null ? "" : String(x)).toLowerCase());
  let petrol = h.findIndex((s) => s.includes("euro-super") || s.includes("super 95"));
  let diesel = h.findIndex((s) => s.includes("automotive gas oil") || s.includes("gas oil automobile"));
  if (petrol < 0) petrol = 1;
  if (diesel < 0) diesel = 2;
  return { petrol, diesel };
}

// Extract { period, rows:[{geo, petrolEUR, dieselEUR}] } from the grid.
export function extract(grid) {
  const header = grid[1] || [];
  const { petrol, diesel } = findColumns(header);
  const period = grid[2] ? fmtDate(grid[2][0]) : null;
  const rows = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r || r.length === 0) continue;
    const geo = typeof r[0] === "string" ? r[0].trim() : null;
    if (!geo || !EU_27.has(geo)) continue; // skips headers, units, EU/EA averages
    const p = Number(r[petrol]);
    const d = Number(r[diesel]);
    rows.push({ geo, petrolEUR: isFinite(p) ? p : null, dieselEUR: isFinite(d) ? d : null });
  }
  return { period, cols: { petrol, diesel }, rows };
}

// Build FUEL_DATA rows (USD/L) from extracted EUR/1000L values.
export function toFuelRows(extracted, eurUsd) {
  const out = [];
  for (const r of extracted.rows) {
    if (r.petrolEUR == null && r.dieselEUR == null) continue;
    out.push({
      geo: r.geo,
      region: "Europe",
      petrol: r.petrolEUR == null ? null : round3((r.petrolEUR / 1000) * eurUsd),
      diesel: r.dieselEUR == null ? null : round3((r.dieselEUR / 1000) * eurUsd),
      source: SOURCE,
      period: extracted.period,
    });
  }
  return out;
}

// Replace this connector's rows; preserve everyone else's (e.g. US/EIA).
export function upsert(data, fuelRows) {
  const others = (data.FUEL_DATA || []).filter((r) => r.source !== SOURCE);
  data.FUEL_DATA = others.concat(fuelRows);
  data.FUEL_CADENCE = data.FUEL_CADENCE || {};
  if (!data.FUEL_CADENCE[SOURCE]) data.FUEL_CADENCE[SOURCE] = "weekly";
  return data;
}

// --- live fetch + main ---------------------------------------------------

async function getText(url) {
  const res = await fetch(url, { headers: { ...BASE_HEADERS, Accept: "text/html,*/*" } });
  if (!res.ok) throw new Error("page HTTP " + res.status);
  return res.text();
}
async function getBuffer(url) {
  const res = await fetch(encodeURI(url), { headers: { ...BASE_HEADERS, Accept: "*/*" } });
  if (!res.ok) throw new Error("xlsx HTTP " + res.status);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const dry = process.argv.includes("--dry");
  const latestPath = path.join(process.cwd(), "public", "data", "latest.json");
  const raw = fs.readFileSync(latestPath, "utf8");
  const data = JSON.parse(raw);
  const eurUsd = data?.FX?.EUR?.usd;
  if (!eurUsd) throw new Error("FX.EUR.usd missing from latest.json");

  console.log("EUR->USD rate:", eurUsd, "(FX_DATE " + data.FX_DATE + ")");

  const html = await getText(PAGE);
  const url = findXlsxUrlFromHtml(html);
  if (!url) throw new Error("could not find prices-with-taxes xlsx link");
  console.log("xlsx link:", url);

  const buf = await getBuffer(url);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const grid = sheetToGrid(wb.worksheets[0]);

  const extracted = extract(grid);
  console.log("data period:", extracted.period, "| petrol col", extracted.cols.petrol, "diesel col", extracted.cols.diesel);
  const fuelRows = toFuelRows(extracted, eurUsd);

  console.log("\nparsed " + fuelRows.length + " EU countries:");
  for (const r of fuelRows) {
    console.log("  " + r.geo.padEnd(13) + " petrol $" + r.petrol + "/L   diesel $" + r.diesel + "/L");
  }
  const missing = [...EU_27].filter((g) => !fuelRows.some((r) => r.geo === g));
  if (missing.length) console.log("WARNING missing:", missing.join(", "));

  if (fuelRows.length < 20) throw new Error("only " + fuelRows.length + " countries parsed; aborting (no write)");

  upsert(data, fuelRows);

  if (dry) {
    console.log("\n--dry: not writing. FUEL_DATA would have " + data.FUEL_DATA.length + " rows.");
    return;
  }
  const pretty = /\n\s/.test(raw.slice(0, 300));
  fs.writeFileSync(latestPath, JSON.stringify(data, null, pretty ? 2 : 0));
  console.log("\nwrote latest.json (" + data.FUEL_DATA.length + " FUEL_DATA rows, " +
    "incl. " + fuelRows.length + " EU + " + (data.FUEL_DATA.length - fuelRows.length) + " other)");
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
}
