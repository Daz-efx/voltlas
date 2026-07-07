// probe-eu-history.mjs  — ONE-TIME discovery, safe to delete afterward.
// Downloads the EC Weekly Oil Bulletin "price developments 2005 onwards"
// history workbook and prints its structure (sheet names, dimensions, the
// top-left corner of each sheet, and column-A labels) so we can write a
// correct backfill parser. Writes NOTHING.
//
//   node scripts/probe-eu-history.mjs
//
// If the page-scrape can't find the link it falls back to the known URL.

import ExcelJS from "exceljs";

const PAGE = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en";
const HOST = "https://energy.ec.europa.eu";
// Fallback (UUID may rotate week to week; scrape is preferred):
const FALLBACK =
  "https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

const decEnt = (s) =>
  s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const stripTags = (s) => decEnt(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
const absUrl = (h) => (h.startsWith("http") ? h : HOST + (h.startsWith("/") ? h : "/" + h));

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

// Compact a cell to a short printable string.
function show(v) {
  if (v == null) return "·";
  if (v instanceof Date) return "D:" + v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return show(v.result);
    if ("text" in v) return String(v.text);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    return "{obj}";
  }
  if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length > 22 ? s.slice(0, 21) + "…" : s;
}

function rowVals(row, maxCols) {
  const out = [];
  for (let c = 1; c <= maxCols; c++) out.push(show(row.getCell(c).value));
  return out;
}

async function main() {
  let url = FALLBACK;
  try {
    const res = await fetch(PAGE, { headers: { ...HEADERS, Accept: "text/html,*/*" } });
    if (res.ok) {
      const found = findHistoryUrl(await res.text());
      if (found) { url = found; console.log("scraped history link:", url); }
      else console.log("(could not scrape history link; using fallback)");
    }
  } catch (e) { console.log("(page fetch failed:", e.message, "— using fallback)"); }
  if (url === FALLBACK) console.log("using fallback URL:", url);

  console.log("\ndownloading…");
  const res = await fetch(encodeURI(url), { headers: { ...HEADERS, Accept: "*/*" } });
  if (!res.ok) throw new Error("download HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log("downloaded", (buf.length / 1e6).toFixed(2), "MB");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  console.log("\n=== SHEETS (" + wb.worksheets.length + ") ===");
  wb.worksheets.forEach((ws, i) => {
    console.log(`  [${i}] "${ws.name}"  rows≈${ws.rowCount} cols≈${ws.columnCount}`);
  });

  const dumpSheets = wb.worksheets.slice(0, 6);
  for (const ws of dumpSheets) {
    const maxCols = Math.min(ws.columnCount || 14, 16);
    console.log("\n=================================================");
    console.log(`SHEET "${ws.name}"  (showing first 12 rows × ${maxCols} cols)`);
    console.log("=================================================");
    for (let r = 1; r <= Math.min(12, ws.rowCount); r++) {
      console.log(String(r).padStart(3) + " | " + rowVals(ws.getRow(r), maxCols).join(" | "));
    }
    console.log("--- column A, rows 1..30 (row labels) ---");
    const labels = [];
    for (let r = 1; r <= Math.min(30, ws.rowCount); r++) labels.push(r + ":" + show(ws.getRow(r).getCell(1).value));
    console.log(labels.join("  "));
    console.log("--- row 1, cols 1.." + maxCols + " (header) ---");
    console.log(rowVals(ws.getRow(1), maxCols).join("  "));
  }

  console.log("\n=== done — paste everything above ===");
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
