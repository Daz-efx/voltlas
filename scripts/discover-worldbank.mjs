// discover-worldbank.mjs  (READ-ONLY, writes nothing)
// Run from repo root:  node scripts/discover-worldbank.mjs
// Paste the full output back.

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const RESEARCH = "https://www.worldbank.org/en/research/commodity-markets";
const DIRECT = "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx";
const MIRROR = "http://pubdocs.worldbank.org/en/561011486076393416/CMO-Historical-Data-Monthly.xlsx";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const H = { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" };

const line = (s = "") => console.log(s);
const hr = (l) => line("\n========== " + l + " ==========");

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

// ---- PART 1: existing commodity structures in latest.json ----
function inspectLatest() {
  hr("PART 1: latest.json commodities");
  const p = path.join(process.cwd(), "public", "data", "latest.json");
  if (!fs.existsSync(p)) { line("latest.json NOT FOUND at " + p); return; }
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  line("COMMODITY_CATS:");
  line(JSON.stringify(d.COMMODITY_CATS, null, 2));
  const com = d.COMMODITIES || [];
  line("\nCOMMODITIES count: " + com.length);
  line("COMMODITIES rows:");
  com.forEach((c) => line("  " + JSON.stringify(c)));
  line("\nsources owning rows: " + [...new Set(com.map((c) => c.source))].join(", "));
}

// ---- PART 2: find the monthly xlsx link ----
async function findLink() {
  hr("PART 2: link discovery");
  // (a) scrape the research page for a direct xlsx or a doc-page link
  try {
    const html = await getText(RESEARCH);
    line("research page length: " + html.length);
    const xlsx = [...new Set(html.match(/https?:\/\/[^"'\s)]*CMO-Historical-Data-Monthly\.xlsx/gi) || [])];
    line("monthly xlsx links on research page: " + (xlsx.length ? xlsx.join(" | ") : "(none directly)"));
    const docPage = [...new Set(html.match(/https?:\/\/thedocs\.worldbank\.org\/en\/doc\/[^"'\s)]*pink-sheet[^"'\s)]*/gi) || [])];
    line("pink-sheet doc-page links: " + (docPage.length ? docPage.slice(0, 3).join(" | ") : "(none)"));
    if (xlsx.length) return xlsx[0];
  } catch (e) { line("research scrape error: " + e.message); }
  line("falling back to known direct URL");
  return DIRECT;
}

// ---- PART 3: xlsx structure ----
async function dumpXlsx(url) {
  hr("PART 3: xlsx structure");
  let buf;
  for (const u of [url, DIRECT, MIRROR]) {
    try { buf = await getBuffer(u); line("downloaded " + buf.length + " bytes from " + u); break; }
    catch (e) { line("failed " + u + " — " + e.message); }
  }
  if (!buf) { line("could not download xlsx from any source"); return; }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  line("sheets: " + wb.worksheets.map((s) => `${JSON.stringify(s.name)}(${s.rowCount}x${s.columnCount})`).join(", "));
  const ws = wb.getWorksheet("Monthly Prices") || wb.worksheets[0];
  line("\nusing sheet: " + JSON.stringify(ws.name) + "  rows=" + ws.rowCount);
  const dump = (n) => {
    const row = ws.getRow(n);
    const vals = (row.values || []).slice(1).map((v) => (v && typeof v === "object" && "result" in v ? v.result : v));
    line("  R" + String(n).padStart(3, "0") + ": " + JSON.stringify(vals));
  };
  line("\n-- header block (rows 1-9) --");
  for (let n = 1; n <= 9; n++) dump(n);
  line("\n-- last 3 data rows (latest months) --");
  for (let n = Math.max(1, ws.rowCount - 2); n <= ws.rowCount; n++) dump(n);
}

(async () => {
  line("discover-worldbank VERSION v1");
  try { inspectLatest(); } catch (e) { line("part1 error: " + e.message); }
  let url;
  try { url = await findLink(); } catch (e) { line("part2 error: " + e.message); }
  try { await dumpXlsx(url); } catch (e) { line("part3 error: " + e.message); }
  hr("END");
})();
