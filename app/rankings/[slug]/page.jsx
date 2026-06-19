// app/rankings/[slug]/page.jsx
// Programmatic, statically-generated ranking pages built from public/data/latest.json.
// URLs look like /rankings/cheapest-electricity-in-europe.

import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RANKINGS } from "../config";

export const dynamicParams = false;

const SITE = "https://voltlas.com";
const YEAR = new Date().getFullYear();
const GAL = 3.78541;

function loadData() {
  const file = path.join(process.cwd(), "public", "data", "latest.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const usd = (v) => `$${Number(v).toFixed(3)}`;
const usd2 = (v) => `$${Number(v).toFixed(2)}`;
const cfgFor = (slug) => RANKINGS.find((r) => r.slug === slug) || null;

function rowsFor(cfg, data) {
  if (cfg.source === "country") {
    let arr = (data.DATA || []).filter((c) => c[cfg.metric] != null);
    if (cfg.scope === "europe") arr = arr.filter((c) => c.region === "Europe");
    arr = arr.slice().sort((a, b) => (cfg.order === "asc" ? a[cfg.metric] - b[cfg.metric] : b[cfg.metric] - a[cfg.metric]));
    return arr.map((c) => ({ name: c.geo, value: c[cfg.metric], slug: slugify(c.geo), source: c.source, period: c.period }));
  }
  if (cfg.source === "us-elec-state") {
    const us = (data.SUBNATIONAL || {})["United States"] || [];
    return us.filter((s) => s.elecRes != null).slice().sort((a, b) => (cfg.order === "asc" ? a.elecRes - b.elecRes : b.elecRes - a.elecRes)).map((s) => ({ name: s.name, value: s.elecRes }));
  }
  if (cfg.source === "us-fuel-state") {
    const us = (data.FUEL_SUBNATIONAL || {})["United States"] || [];
    return us.filter((s) => s.petrol != null).slice().sort((a, b) => (cfg.order === "asc" ? a.petrol - b.petrol : b.petrol - a.petrol)).map((s) => ({ name: s.name, value: s.petrol }));
  }
  return [];
}

const fmtValue = (cfg, v) => (cfg.kind === "fuel" ? `${usd2(v * GAL)}/gal` : `${usd(v)}/kWh`);
const fmtSub = (cfg, v) => (cfg.kind === "fuel" ? `${usd2(v)}/L` : null);

export function generateStaticParams() {
  return RANKINGS.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const cfg = cfgFor(slug);
  if (!cfg) return { title: "Ranking not found" };
  const rows = rowsFor(cfg, loadData());
  const top = rows[0];
  const lead = top ? ` ${cfg.order === "asc" ? "Cheapest" : "Highest"}: ${top.name} at ${fmtValue(cfg, top.value)}.` : "";
  const description = `${cfg.lede}${lead} Full ranking of ${rows.length}, updated ${YEAR}.`;
  const url = `/rankings/${slug}`;
  const title = `${cfg.title} (${YEAR})`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", title: `${title} · Voltlas`, description, url },
    twitter: { card: "summary_large_image", title: `${title} · Voltlas`, description },
  };
}

const C = { bg: "#171E2E", panel: "#1C2438", text: "#E8E4DA", dim: "rgba(232,228,218,0.6)", accent: "#F2A93B", line: "rgba(232,228,218,0.14)" };

export default async function RankingPage({ params }) {
  const { slug } = await params;
  const cfg = cfgFor(slug);
  if (!cfg) notFound();
  const data = loadData();
  const rows = rowsFor(cfg, data);
  const others = RANKINGS.filter((r) => r.slug !== slug);
  const period = rows.find((r) => r.period)?.period || `${YEAR}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Voltlas", item: SITE },
        { "@type": "ListItem", position: 2, name: cfg.title, item: `${SITE}/rankings/${slug}` },
      ] },
      { "@type": "ItemList", name: cfg.title, numberOfItems: rows.length,
        itemListElement: rows.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: r.name, ...(r.slug ? { url: `${SITE}/country/${r.slug}` } : {}) })) },
    ],
  };

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Archivo',system-ui,sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;800&family=IBM+Plex+Mono:wght@400;600&family=Archivo:wght@400;500;600&display=swap');`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 64px" }}>
        <Link href="/" style={{ font: "600 11px 'IBM Plex Mono',monospace", color: C.accent, textDecoration: "none", letterSpacing: ".08em" }}>← VOLTLAS</Link>

        <div style={{ font: "600 11px 'IBM Plex Mono',monospace", letterSpacing: ".18em", color: C.accent, textTransform: "uppercase", margin: "26px 0 6px" }}>Ranking · {YEAR}</div>
        <h1 style={{ font: "800 44px/1.02 'Saira Condensed',sans-serif", margin: 0, textTransform: "uppercase" }}>{cfg.h1}</h1>
        <p style={{ color: C.dim, fontSize: 15, maxWidth: 620, marginTop: 12 }}>{cfg.lede} Ranking {rows.length} entries; latest period {period}.</p>

        <ol style={{ listStyle: "none", padding: 0, margin: "26px 0 0", border: `1px solid ${C.line}` }}>
          {rows.map((r, i) => (
            <li key={r.name} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: i === rows.length - 1 ? "none" : `1px solid ${C.line}`, background: i % 2 ? "transparent" : "rgba(255,255,255,0.015)" }}>
              <span style={{ font: "700 14px 'IBM Plex Mono',monospace", color: C.dim }}>{i + 1}</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>
                {r.slug ? <Link href={`/country/${r.slug}`} style={{ color: C.text, textDecoration: "none" }}>{r.name}</Link> : r.name}
              </span>
              <span style={{ textAlign: "right" }}>
                <span style={{ font: "600 15px 'IBM Plex Mono',monospace", color: C.accent }}>{fmtValue(cfg, r.value)}</span>
                {fmtSub(cfg, r.value) && <span style={{ display: "block", font: "400 10px 'IBM Plex Mono',monospace", color: C.dim }}>{fmtSub(cfg, r.value)}</span>}
              </span>
            </li>
          ))}
        </ol>

        <section style={{ marginTop: 30 }}>
          <h2 style={{ font: "800 18px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em" }}>More rankings</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 10 }}>
            {others.map((o) => (
              <Link key={o.slug} href={`/rankings/${o.slug}`} style={{ font: "500 13px 'Archivo',sans-serif", color: C.accent, textDecoration: "none", borderBottom: `1px solid ${C.line}`, paddingBottom: 2 }}>{o.h1}</Link>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 30, paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
          <strong style={{ color: C.text }}>Methodology.</strong> Prices are all-taxes-included, drawn from free official sources (EIA for the US; Eurostat for the EU) and converted to USD at recent reference rates. Electricity and gas are end-user retail prices per kWh; gasoline is retail per gallon and per litre. Figures update on Voltlas weekly; this ranking reflects the latest published period for each entry.
          <div style={{ marginTop: 12 }}><Link href="/" style={{ color: C.accent, textDecoration: "none" }}>← Back to the full Voltlas dashboard</Link></div>
        </section>
      </div>
    </main>
  );
}
