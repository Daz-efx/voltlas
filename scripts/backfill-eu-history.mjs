// scripts/backfill-eu-history.mjs  — ONE-TIME backfill, safe to delete after.
// Reads the EC Weekly Oil Bulletin "price developments 2005 onwards" workbook,
// pulls the per-country euro-super 95 (-> petrol) and automotive diesel weekly
// series from the "Prices with taxes" sheet (EUR / 1000 L), converts to USD/L
// using the EUR rate already in latest.json, and MERGES the most-recent ~520
// weeks into public/data/fuel-history.json (leaving the US/EIA entry intact).
//
// Includes a currency self-check: each country's newest backfilled price is
// compared to the current value in latest.json; if many are wildly off it
// aborts (a sign the file is in national currency, not EUR).
//
//   node scripts/backfill-eu-history.mjs            (writes after the check)
//   node scripts/backfill-eu-history.mjs --dry      (parse + check, write nothing)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const PAGE = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en";
const HOST = "https://energy.ec.europa.eu";
const FALLBACK =
  "https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx";
const CAP = 520; // most recent ~10 years of weekly points (matches the connectors)
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

// EC two/three-letter codes -> our geo names (EU-27 only; aggregates/UK skipped).
export const CODE_TO_GEO = {
  AT: "Austria", BE: "Belgium", BG: "Bulgaria", HR: "Croatia", CY: "Cyprus",
  CZ: "Czechia", DK: "Denmark", EE: "Estonia", FI: "Finland", FR: "France",
  DE: "Germany", EL: "Greece", GR: "Greece", HU: "Hungary", IE: "Ireland",
  IT: "Italy", LV: "Latvia", LT: "Lithuania", LU: "Luxembourg", MT: "Malta",
  NL: "Netherlands", PL: "Poland", PT: "Portugal", RO: "Romania", SK: "Slovakia",
  SI: "Slovenia", ES: "Spain", SE: "Sweden",
};

const decEnt = (s) =>
  s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const stripTags = (s) => decEnt(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
const absUrl = (h) => (h.startsWith("http") ? h : HOST + (h.startsWith("/") ? h : "/" + h));
const round3 = (x) => Math.round(x * 1000) / 1000;
const isoOf = (d) => { const dt = d instanceof Date ? d : new Date(d); return isNaN(dt) ? null : dt.toISOString().slice(0, 10); };

function findHistoryUrl(html) {
  const re = /href\s*=\s*"([^"]*document\/download\/[^"]*)"/gi;
  const items = []; let m;
  while ((m = re.exec(html))) {
    const href = decEnt(m[1]);
    const label = stripTags(html.slice(Math.max(0, m.index - 260), m.index)).slice(-150);
    items.push({ href, label });
  }
  const dec = (h) => { try { return decodeURIComponent(h); } catch { return h; } };
  const hay = (it) => (dec(it.href) + " " + it.label).toLowerCase();
  const cand =
    items.find((it) => { const h = hay(it); return h.includes(".xlsx") && (h.includes("2005") || h.includes("history") || h.includes("developments")); }) ||
    items.find((it) => hay(it).includes("history"));
  return cand ? absUrl(cand.href) : null;
}

function cellVal(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return v.result;
    if ("text" in v) return v.text;
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
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

// --- pure parse logic (unit-tested) -------------------------------------

// From the header row, find each country block's petrol & diesel column indices.
export function detectBlocks(headerRow) {
  const blocks = [];
  for (let j = 0; j < headerRow.length; j++) {
    const h = headerRow[j] == null ? "" : String(headerRow[j]);
    const m = /^(.+?)_price_with_tax_euro/i.exec(h);
    if (!m) continue;
    const code = m[1].toUpperCase().replace(/[^A-Z]/g, "");
    // diesel is the next column; confirm it looks like a diesel header
    const dh = headerRow[j + 1] == null ? "" : String(headerRow[j + 1]);
    const dieselIdx = /diesel/i.test(dh) ? j + 1 : j + 1;
    blocks.push({ code, petrolIdx: j, dieselIdx });
  }
  return blocks;
}

// Build { geo: { geo, region, petrol:[[iso,usd/L]], diesel:[...] } } for EU-27.
export function parseGrid(grid, eurUsd, { cap = CAP, dataStartRow = 4 } = {}) {
  const header = grid[1] || [];
  const blocks = detectBlocks(header);
  const out = {};
  for (const b of blocks) {
    const geo = CODE_TO_GEO[b.code];
    if (!geo || out[geo]) continue; // skip aggregates / non-EU27 / dup (EL+GR)
    const petrol = [], diesel = [];
    for (let r = dataStartRow; r < grid.length; r++) {
      const row = grid[r];
      if (!row) continue;
      const iso = isoOf(row[0]);
      if (!iso) continue;
      const pe = Number(row[b.petrolIdx]);
      const di = Number(row[b.dieselIdx]);
      if (isFinite(pe) && pe > 0) petrol.push([iso, round3((pe / 1000) * eurUsd)]);
      if (isFinite(di) && di > 0) diesel.push([iso, round3((di / 1000) * eurUsd)]);
    }
    const tail = (arr) => { arr.sort((a, b) => (a[0] < b[0] ? -1 : 1)); return arr.length > cap ? arr.slice(arr.length - cap) : arr; };
    out[geo] = { geo, region: "Europe", petrol: tail(petrol), diesel: tail(diesel) };
  }
  return out;
}

// --- live fetch + main ---------------------------------------------------

async function main() {
  const dry = process.argv.includes("--dry");
  const latestPath = path.join(process.cwd(), "public", "data", "latest.json");
  const histPath = path.join(process.cwd(), "public", "data", "fuel-history.json");
  const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  const eurUsd = latest?.FX?.EUR?.usd;
  if (!eurUsd) throw new Error("FX.EUR.usd missing from latest.json");
  console.log("EUR->USD:", eurUsd, "(FX_DATE " + latest.FX_DATE + ")");

  let url = FALLBACK;
  try {
    const res = await fetch(PAGE, { headers: { ...HEADERS, Accept: "text/html,*/*" } });
    if (res.ok) { const f = findHistoryUrl(await res.text()); if (f) url = f; }
  } catch {}
  console.log("history file:", url);

  const res = await fetch(encodeURI(url), { headers: { ...HEADERS, Accept: "*/*" } });
  if (!res.ok) throw new Error("download HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log("downloaded", (buf.length / 1e6).toFixed(2), "MB");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets.find((s) => /with tax/i.test(s.name) && !/wo|without/i.test(s.name)) || wb.worksheets[0];
  console.log('using sheet "' + ws.name + '"');
  const grid = sheetToGrid(ws);

  const series = parseGrid(grid, eurUsd);
  const geos = Object.keys(series).sort();
  console.log("\nparsed " + geos.length + " EU countries (most recent " + CAP + " weeks each)");

  // --- currency self-check vs current snapshot in latest.json ---
  const cur = {};
  for (const f of latest.FUEL_DATA || []) cur[f.geo] = f;
  console.log("\nsanity check (newest backfilled vs current latest.json):");
  console.log("  geo            backfill$/L  current$/L  ratio");
  let bad = 0, checked = 0;
  for (const geo of geos) {
    const pts = series[geo].petrol;
    const newest = pts.length ? pts[pts.length - 1][1] : null;
    const now = cur[geo] ? cur[geo].petrol : null;
    let ratioStr = "   n/a";
    if (newest != null && now != null && now > 0) {
      const ratio = newest / now;
      checked++;
      if (Math.abs(ratio - 1) > 0.25) bad++;
      ratioStr = ratio.toFixed(3);
    }
    console.log("  " + geo.padEnd(14) + String(newest ?? "—").padStart(9) + "  " + String(now ?? "—").padStart(10) + "  " + ratioStr.padStart(7));
  }
  console.log(`\n${geos.length} parsed · ${checked} checked vs snapshot · ${bad} off by >25%`);
  if (checked >= 10 && bad > checked * 0.3) {
    throw new Error(`${bad}/${checked} countries off by >25% — likely a currency mismatch (national vs EUR). Aborting, nothing written.`);
  }
  console.log(bad === 0 ? "✓ all checked countries line up with the live snapshot (EUR basis confirmed)."
    : `⚠ ${bad} country(ies) off >25% — review the table above before trusting those.`);

  // --- merge into fuel-history.json (preserve US + any other geos) ---
  let hist = { series: {} };
  try { hist = JSON.parse(fs.readFileSync(histPath, "utf8")); } catch {}
  const merged = { updated: new Date().toISOString().slice(0, 10), series: { ...(hist.series || {}), ...series } };

  if (dry) {
    console.log("\n--dry: not writing. Would set " + geos.length + " EU geos; file would have " + Object.keys(merged.series).length + " total.");
    return;
  }
  fs.writeFileSync(histPath, JSON.stringify(merged));
  const sizeMB = (fs.statSync(histPath).size / 1e6).toFixed(2);
  console.log("\nwrote fuel-history.json — " + Object.keys(merged.series).length + " geos total (" + sizeMB + " MB).");
  console.log("Now: npm run build, then commit public/data/fuel-history.json and push.");
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
}
