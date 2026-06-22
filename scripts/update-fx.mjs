// scripts/update-fx.mjs
// Official daily FX reference rates from the European Central Bank (free, no key)
// -> refreshes FX[ccy].usd and FX_DATE in public/data/latest.json.
//
// The ECB publishes EUR-based reference rates each working day. We read the set
// of currencies already present in FX (so symbols and the country mapping are
// preserved) and update each one's USD value, deriving non-EUR currencies via
// the EUR cross rate. Any currency the ECB doesn't publish keeps its prior value.
//
// Run from project root:  node scripts/update-fx.mjs   (add --dry to preview)

import fs from "node:fs";
import path from "node:path";

const DATA_FILE = path.join(process.cwd(), "public", "data", "latest.json");
const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso) => { const [y, mo, d] = iso.split("-"); return `${+d} ${MON[+mo - 1]} ${y}`; };

export function parseEcb(xml) {
  const rates = { EUR: 1 };
  const re = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g;
  let m;
  while ((m = re.exec(xml))) rates[m[1]] = parseFloat(m[2]);
  const dm = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml);
  if (!rates.USD) throw new Error("ECB response missing USD rate");
  return { rates, date: dm ? dm[1] : null };
}

// Given EUR-based rates, set FX[ccy].usd = USD per 1 unit of ccy.
export function applyRates(FX, rates) {
  const usdPerEur = rates.USD; // 1 EUR = usdPerEur USD
  const updated = [], skipped = [];
  for (const ccy of Object.keys(FX)) {
    if (ccy === "USD") { FX[ccy].usd = 1; updated.push(ccy); continue; }
    const r = rates[ccy];
    if (r == null) { skipped.push(ccy); continue; }       // keep prior value
    FX[ccy].usd = Math.round((usdPerEur / r) * 1e4) / 1e4; // USD per 1 ccy
    updated.push(ccy);
  }
  return { updated, skipped };
}

async function main() {
  const dry = process.argv.includes("--dry");
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (!data.FX || !Object.keys(data.FX).length) throw new Error("no FX block in latest.json");

  const res = await fetch(ECB_URL);
  if (!res.ok) throw new Error(`ECB HTTP ${res.status}`);
  const { rates, date } = parseEcb(await res.text());

  const { updated, skipped } = applyRates(data.FX, rates);
  if (date) data.FX_DATE = fmtDate(date);
  console.log(`ECB ${date || "(no date)"} — updated ${updated.length}: ${updated.join(", ")}`);
  if (skipped.length) console.log(`  no ECB rate (kept prior) for: ${skipped.join(", ")}`);

  if (dry) { console.log("--dry: not writing."); return; }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n");
  console.log(`wrote latest.json — FX_DATE now ${data.FX_DATE}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("\u2717 " + e.message); process.exit(1); });
}
