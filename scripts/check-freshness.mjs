// scripts/check-freshness.mjs
// Post-connectors guard: reads public/data/latest.json and FAILS the run
// (exit 1) if any data source is older than its allowed age. Run as its own
// workflow step AFTER the connectors so a silently-swallowed fetch failure
// (|| echo "... keeping prior ...") finally surfaces as a red X + email.
//
// WHY THIS EXISTS: the World Bank commodities feed died for ~6 weeks in
// mid-2026 while every scheduled run reported green, because each connector
// step ends in `|| echo`. This checker converts "someone eventually notices
// stale numbers" into "GitHub emails you the morning it breaks."
//
// Run locally to preview (never fails locally unless --strict passed):
//   node scripts/check-freshness.mjs           (report only, exit 0)
//   node scripts/check-freshness.mjs --strict   (exit 1 if stale — CI mode)

import fs from "node:fs";
import path from "node:path";

const STRICT = process.argv.includes("--strict");
const latestPath = path.join(process.cwd(), "public", "data", "latest.json");

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// ---- date parsers for the three period formats in latest.json ----

// "7 Aug 2026" or "3 Aug 2026"  (day-level)
function parseDMY(s) {
  const m = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/.exec(String(s).trim());
  if (!m) return null;
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (mon == null) return null;
  return new Date(Date.UTC(+m[3], mon, +m[1]));
}

// "July 2026" or "Jul 2026"  (month-level → treat as END of that month,
// so we don't flag a fresh monthly release as ~30 days old on day one)
function parseMonthYear(s) {
  const m = /^([A-Za-z]{3,})\s+(\d{4})$/.exec(String(s).trim());
  if (!m) return null;
  const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (mon == null) return null;
  return new Date(Date.UTC(+m[2], mon + 1, 0)); // last day of that month
}

// "H2 2025" / "H1 2026"  (half-year → END of the half, same reasoning)
function parseHalfYear(s) {
  const m = /^H([12])\s+(\d{4})$/.exec(String(s).trim());
  if (!m) return null;
  const endMonth = m[1] === "1" ? 6 : 12; // H1 ends Jun 30, H2 ends Dec 31
  return new Date(Date.UTC(+m[2], endMonth, 0));
}

// Try each parser; return the first that matches.
function parseAny(s) {
  return parseDMY(s) || parseMonthYear(s) || parseHalfYear(s) || null;
}

function ageDays(date, now) {
  return Math.floor((now - date) / 86400_000);
}

// ---- checks: label, how to pull the date, max allowed age ----

function main() {
  const data = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  const now = new Date();

  // Pull the freshest period per commodity source (a source is "current"
  // if ANY of its rows is current — they all share a release date anyway).
  function freshestCommodityPeriod(source) {
    const rows = (data.COMMODITIES || []).filter((c) => c.source === source);
    let best = null;
    for (const r of rows) {
      const d = parseAny(r.period);
      if (d && (!best || d > best)) best = d;
    }
    return { date: best, sample: rows[0]?.period ?? null, count: rows.length };
  }

  // Freshest Eurostat/EIA period from the DATA (electricity/gas) rows.
  function freshestDataPeriod(source) {
    const rows = (data.DATA || []).filter((r) => r.source === source);
    let best = null;
    for (const r of rows) {
      const d = parseAny(r.period);
      if (d && (!best || d > best)) best = d;
    }
    return { date: best, sample: rows[0]?.period ?? null, count: rows.length };
  }

  const checks = [
    {
      label: "FX rates (ECB, daily)",
      maxAgeDays: 5,
      get: () => ({ date: parseAny(data.FX_DATE), sample: data.FX_DATE, count: data.FX ? Object.keys(data.FX).length : 0 }),
    },
    {
      label: "Commodities — World Bank (monthly)",
      maxAgeDays: 50,
      get: () => freshestCommodityPeriod("World Bank"),
    },
    {
      label: "Commodities — EIA energy (monthly)",
      maxAgeDays: 50,
      get: () => freshestCommodityPeriod("EIA"),
    },
    {
      label: "Electricity/gas — Eurostat (semi-annual)",
      maxAgeDays: 260,
      get: () => freshestDataPeriod("Eurostat"),
    },
  ];

  console.log(`Freshness check @ ${now.toISOString().slice(0, 10)} (${STRICT ? "strict/CI" : "report-only"})\n`);

  const problems = [];
  for (const c of checks) {
    let res;
    try { res = c.get(); } catch (e) { res = { date: null, sample: `ERROR: ${e.message}`, count: 0 }; }

    if (res.count === 0) {
      console.log(`  ⚠ ${c.label}: NO ROWS FOUND (source missing entirely)`);
      problems.push(`${c.label}: source produced no rows`);
      continue;
    }
    if (!res.date) {
      console.log(`  ⚠ ${c.label}: could not parse period "${res.sample}"`);
      problems.push(`${c.label}: unparseable period "${res.sample}"`);
      continue;
    }
    const age = ageDays(res.date, now);
    const stale = age > c.maxAgeDays;
    const mark = stale ? "✗ STALE" : "✓";
    console.log(`  ${mark} ${c.label}: "${res.sample}" — ${age}d old (limit ${c.maxAgeDays}d, ${res.count} rows)`);
    if (stale) problems.push(`${c.label}: ${age}d old (period "${res.sample}", limit ${c.maxAgeDays}d)`);
  }

  console.log("");
  if (problems.length === 0) {
    console.log("All sources fresh.");
    return;
  }

  console.log(`STALE SOURCES (${problems.length}):`);
  for (const p of problems) console.log(`  - ${p}`);

  if (STRICT) {
    console.error(`\n::error::${problems.length} data source(s) stale — see freshness report above.`);
    process.exit(1);
  } else {
    console.log("\n(report-only mode — pass --strict in CI to fail the run)");
  }
}

main();
