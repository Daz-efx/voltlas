// scripts/update-canada.mjs
// Canadian retail pump prices (taxes incl.) from Statistics Canada table
// 18-10-0001 "Monthly average retail prices for gasoline and fuel oil, by
// geography", via the free full-table CSV download (no key). cents/litre (CAD).
//
//   regular unleaded gasoline at self service -> petrol
//   diesel fuel at self service                -> diesel
// for Canada + the table's cities, taking each geography's most recent month
// that actually has a value. Converts cents/L -> USD/L with the CAD rate in
// latest.json (seeded if absent; the FX connector refines it from ECB).
//
// Owns the "Canada" row of FUEL_DATA (source "Statistics Canada") + its city
// sub-national list; everything else is preserved.
//
//   node scripts/update-canada.mjs          (writes latest.json)
//   node scripts/update-canada.mjs --dry     (prints, writes nothing)

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const WDS = "https://www150.statcan.gc.ca/t1/wds/rest";
const PRODUCT = 18100001;
const SOURCE = "Statistics Canada";
const DATA_FILE = path.join(process.cwd(), "public", "data", "latest.json");
const CAD_SEED = { usd: 0.73, sym: "C$" };
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const round3 = (v) => Math.round(v * 1000) / 1000;
const centsToUsdL = (cents, cadUsd) => round3((Number(cents) / 100) * cadUsd);
const fmtPer = (p) => { const m = String(p).match(/(\d{4})-(\d{2})/); return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : String(p); };
const cityName = (geo) => String(geo).split(",")[0].trim();

// --- dependency-free zip + csv (unit-tested) ----------------------------

export function unzipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip (no end-of-central-directory)");
  const cdCount = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < cdCount; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const lhOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    const lnameLen = buf.readUInt16LE(lhOff + 26), lextraLen = buf.readUInt16LE(lhOff + 28);
    const ds = lhOff + 30 + lnameLen + lextraLen;
    const comp = buf.subarray(ds, ds + compSize);
    out.push({ name, data: method === 0 ? comp : zlib.inflateRawSync(comp) });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// Parse one CSV line into fields, honoring quotes and "" escapes.
export function parseCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// From StatCan CSV text -> { geo: { petrol:{ref,val}, diesel:{ref,val} } },
// keeping each geo/fuel's most recent non-empty month.
export function extractLatest(csvText) {
  csvText = csvText.replace(/^\uFEFF/, ""); // strip UTF-8 byte-order mark
  const lines = csvText.split(/\r?\n/);
  const header = parseCsvLine(lines[0]).map((h) => h.replace(/^\uFEFF/, "").trim());
  const ci = (re) => header.findIndex((h) => re.test(h));
  const ri = ci(/ref.?date/i), gi = ci(/^geo$/i), fi = ci(/type of fuel|fuel/i), vi = ci(/^value$/i);
  if (ri < 0 || gi < 0 || fi < 0 || vi < 0) throw new Error(`CSV columns not found (ref=${ri} geo=${gi} fuel=${fi} val=${vi})`);
  const out = {};
  for (let k = 1; k < lines.length; k++) {
    if (!lines[k]) continue;
    const r = parseCsvLine(lines[k]);
    const ref = r[ri], geo = r[gi], fuel = String(r[fi] || ""), vs = r[vi];
    if (!geo || !ref || vs == null || vs === "") continue;
    const val = Number(vs);
    if (!isFinite(val) || val <= 0) continue;
    let key = null;
    if (/regular/i.test(fuel) && /gasoline/i.test(fuel) && /self.?service/i.test(fuel)) key = "petrol";
    else if (/diesel/i.test(fuel) && /self.?service/i.test(fuel)) key = "diesel";
    if (!key) continue;
    out[geo] = out[geo] || {};
    const cur = out[geo][key];
    if (!cur || String(ref) > String(cur.ref)) out[geo][key] = { ref, val };
  }
  return out;
}

// --- live fetch + main ---------------------------------------------------

async function main() {
  const dry = process.argv.includes("--dry");
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  data.FX = data.FX || {};
  if (!data.FX.CAD) { data.FX.CAD = { ...CAD_SEED }; console.log("seeded FX.CAD (FX connector will refine from ECB)"); }
  const cadUsd = data.FX.CAD.usd;
  data.FUEL_DATA = data.FUEL_DATA || [];
  data.FUEL_SUBNATIONAL = data.FUEL_SUBNATIONAL || {};

  console.log("requesting full-table CSV link…");
  const metaRes = await fetch(`${WDS}/getFullTableDownloadCSV/${PRODUCT}/en`);
  if (!metaRes.ok) throw new Error(`CSV-link HTTP ${metaRes.status}`);
  const meta = await metaRes.json();
  const zipUrl = meta && meta.object;
  if (!zipUrl) throw new Error("no CSV zip URL in response");
  console.log("downloading", zipUrl);

  const zres = await fetch(zipUrl);
  if (!zres.ok) throw new Error(`zip HTTP ${zres.status}`);
  const buf = Buffer.from(await zres.arrayBuffer());
  const entries = unzipEntries(buf);
  const csvEntry = entries.find((e) => /(^|\/)\d+\.csv$/i.test(e.name) && !/metadata/i.test(e.name)) || entries.find((e) => /\.csv$/i.test(e.name) && !/metadata/i.test(e.name));
  if (!csvEntry) throw new Error(`no data CSV in zip (entries: ${entries.map((e) => e.name).join(", ")})`);
  console.log(`parsing ${csvEntry.name} (${(csvEntry.data.length / 1e6).toFixed(1)} MB)…`);

  const rows = extractLatest(csvEntry.data.toString("utf8"));
  const geos = Object.keys(rows);
  console.log(`geographies with data: ${geos.length}`);

  const canada = rows["Canada"];
  if (!canada || (!canada.petrol && !canada.diesel)) {
    throw new Error(`no national Canada value; geos seen: ${geos.slice(0, 8).join(" | ")}`);
  }
  const period = fmtPer((canada.petrol || canada.diesel).ref);
  const natRow = {
    geo: "Canada", region: "N. America",
    petrol: canada.petrol ? centsToUsdL(canada.petrol.val, cadUsd) : null,
    diesel: canada.diesel ? centsToUsdL(canada.diesel.val, cadUsd) : null,
    source: SOURCE, period,
  };
  data.FUEL_DATA = [...data.FUEL_DATA.filter((r) => r.geo !== "Canada"), natRow];

  const subs = [];
  for (const [geo, v] of Object.entries(rows)) {
    if (geo === "Canada") continue;
    if (!v.petrol && !v.diesel) continue;
    subs.push({
      name: cityName(geo),
      petrol: v.petrol ? centsToUsdL(v.petrol.val, cadUsd) : null,
      diesel: v.diesel ? centsToUsdL(v.diesel.val, cadUsd) : null,
    });
  }
  subs.sort((a, b) => (b.petrol ?? 0) - (a.petrol ?? 0));
  if (subs.length) data.FUEL_SUBNATIONAL["Canada"] = subs;

  console.log(`\nCanada (${period}): petrol ${natRow.petrol != null ? "$" + natRow.petrol + "/L" : "n/a"}, diesel ${natRow.diesel != null ? "$" + natRow.diesel + "/L" : "n/a"}  ·  ${subs.length} cities`);
  for (const s of subs.slice(0, 6)) console.log(`  ${s.name.padEnd(14)} petrol ${s.petrol != null ? "$" + s.petrol : "—"}  diesel ${s.diesel != null ? "$" + s.diesel : "—"}`);

  if (dry) { console.log("\n--dry: nothing written."); return; }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`\n\u2713 wrote latest.json — Canada national + ${subs.length} cities (CAD\u2192USD @ ${cadUsd}).`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("\u2717 " + e.message); process.exit(1); });
}
