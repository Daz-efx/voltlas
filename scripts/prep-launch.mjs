// scripts/prep-launch.mjs — one-time launch tidy: keep only real data public.
// Removes the six countries that are still sample, and clears the (sample)
// transport-fuel data so it can't leak into country pages. Safe to re-run.
import fs from "node:fs";
import path from "node:path";
const f = path.join(process.cwd(), "public", "data", "latest.json");
const d = JSON.parse(fs.readFileSync(f, "utf8"));
const SAMPLE = ["United Kingdom", "Canada", "Mexico", "Australia", "New Zealand", "Brazil"];
const before = d.DATA.length;
d.DATA = d.DATA.filter((c) => !SAMPLE.includes(c.geo));
d.FUEL_DATA = [];
d.FUEL_SUBNATIONAL = {};
fs.writeFileSync(f, JSON.stringify(d, null, 2) + "\n");
console.log(`✓ Removed ${before - d.DATA.length} sample countries and cleared sample fuel data. ${d.DATA.length} real countries remain.`);
