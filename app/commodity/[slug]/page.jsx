// app/commodity/[slug]/page.jsx
// Per-commodity price + history page. Current price, range stats, an inline
// (JS-free) SVG history chart, related commodities, source/methodology, and
// Dataset structured data. Targets high-volume "<commodity> price" searches.

import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import HistoryChart from "./HistoryChart";

const SITE = "https://voltlas.com";
const LICENSE = "https://creativecommons.org/licenses/by/4.0/";
const C = { bg: "#171E2E", panel: "#1C2438", text: "#E8E4DA", dim: "rgba(232,228,218,0.62)", faint: "rgba(232,228,218,0.40)", accent: "#F2A93B", up: "#5BBF8A", down: "#E8765B", line: "rgba(232,228,218,0.14)" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const fmtCode = (code) => { const m = /^(\d{4})M(\d{2})$/.exec(String(code)); return m ? `${MON[+m[2] - 1]} ${m[1]}` : String(code); };
const fmtNum = (v) => Number(v).toLocaleString("en-US", { minimumFractionDigits: Math.abs(v) < 100 ? 2 : 0, maximumFractionDigits: 2 });
const perUnit = (u) => String(u || "").replace(/^\$\s*\/\s*/, "per ");
const CAT_LABEL = { base: "Base metals", precious: "Precious metals", ag: "Agriculture", energy: "Energy" };

function loadData() {
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "latest.json"), "utf8"));
  let hist = { series: {} };
  try { hist = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "commodity-history.json"), "utf8")); } catch {}
  return { data, hist };
}

function find(slug) {
  const { data, hist } = loadData();
  const list = data.COMMODITIES || [];
  const row = list.find((c) => slugify(c.name) === slug);
  if (!row) return null;
  // History is keyed by display name. Fall back to a slug match so a name drift
  // between the catalog and the history file (e.g. "Coal" vs "Coal — Australia")
  // still resolves instead of dropping to the no-history fallback.
  let series = hist.series ? hist.series[row.name] : null;
  if (!series && hist.series) {
    const hit = Object.entries(hist.series).find(([k]) => slugify(k) === slug);
    if (hit) series = hit[1];
  }
  const related = list.filter((c) => c.cat === row.cat && c.name !== row.name).slice(0, 6);
  const catLabel = (data.COMMODITY_CATS || []).find((c) => c.key === row.cat)?.label || CAT_LABEL[row.cat] || row.cat;
  return { row, series, related, catLabel, updated: hist.updated };
}

export function generateStaticParams() {
  const { data } = loadData();
  return (data.COMMODITIES || []).map((c) => ({ slug: slugify(c.name) }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const f = find(slug);
  if (!f) return { title: "Commodity not found · Voltlas" };
  const { row } = f;
  const price = `$${fmtNum(row.price)} ${perUnit(row.unit)}`;
  const dir = row.chg > 0 ? "up" : row.chg < 0 ? "down" : "flat";
  const desc = `${row.name} price today: ${price} as of ${row.period} (${row.chg >= 0 ? "+" : ""}${row.chg}% month-on-month, ${dir}). Free 25-year price history and chart, sourced from ${row.source}.`;
  return {
    title: `${row.name} price today — live price & history | Voltlas`,
    description: desc,
    alternates: { canonical: `/commodity/${slug}` },
    openGraph: { type: "website", title: `${row.name} price today & history`, description: desc, url: `/commodity/${slug}` },
    twitter: { card: "summary_large_image", title: `${row.name} price`, description: desc },
  };
}

export default async function CommodityPage({ params }) {
  const { slug } = await params;
  const f = find(slug);
  if (!f) notFound();
  const { row, series, related, catLabel, updated } = f;

  const pts = series?.points || [];
  const n = pts.length;
  const latest = n ? pts[n - 1][1] : row.price;
  const ago = (k) => (n > k ? pts[n - 1 - k][1] : null);
  const pct = (from, to) => (from && from !== 0 ? Math.round(((to - from) / from) * 1000) / 10 : null);
  const y1 = pct(ago(12), latest), y5 = pct(ago(60), latest);
  const vals = pts.map((p) => p[1]);
  const hi = n ? Math.max(...vals) : null, lo = n ? Math.min(...vals) : null;
  const hiCode = n ? pts[vals.indexOf(hi)][0] : null, loCode = n ? pts[vals.indexOf(lo)][0] : null;
  const spanLabel = n ? `${String(pts[0][0]).slice(0, 4)}–${String(pts[n - 1][0]).slice(0, 4)}` : "";

  const chgColor = row.chg > 0 ? C.up : row.chg < 0 ? C.down : C.dim;
  const arrow = row.chg > 0 ? "▲" : row.chg < 0 ? "▼" : "■";
  const sign = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v}%`);
  const stColor = (v) => (v == null ? C.dim : v > 0 ? C.up : v < 0 ? C.down : C.dim);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Dataset",
        name: `${row.name} price (monthly)`,
        description: `Monthly ${row.name} price history in ${row.unit}, compiled by Voltlas from ${row.source}.`,
        url: `${SITE}/commodity/${slug}`,
        license: LICENSE,
        isAccessibleForFree: true,
        creator: { "@type": "Organization", name: "Voltlas", url: SITE },
        ...(n ? { temporalCoverage: `${String(pts[0][0]).replace("M", "-")}/${String(pts[n - 1][0]).replace("M", "-")}` } : {}),
        variableMeasured: `${row.name} price (${row.unit})`,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Voltlas", item: SITE },
          { "@type": "ListItem", position: 2, name: `${row.name} price`, item: `${SITE}/commodity/${slug}` },
        ],
      },
    ],
  };

  const Stat = ({ label, value, color }) => (
    <div style={{ flex: "1 1 90px", minWidth: 90 }}>
      <div style={{ font: "600 10.5px 'IBM Plex Mono',monospace", letterSpacing: ".08em", color: C.faint, textTransform: "uppercase" }}>{label}</div>
      <div style={{ font: "700 18px 'Saira Condensed',sans-serif", color: color || C.text, marginTop: 3 }}>{value}</div>
    </div>
  );

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Archivo',system-ui,sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;700;800&family=IBM+Plex+Mono:wght@400;600&family=Archivo:wght@400;500;600&display=swap');`}</style>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "36px 20px 64px" }}>
        <Link href="/" style={{ font: "600 11px 'IBM Plex Mono',monospace", color: C.accent, textDecoration: "none", letterSpacing: ".08em" }}>← VOLTLAS</Link>

        <div style={{ font: "600 11px 'IBM Plex Mono',monospace", letterSpacing: ".18em", color: C.accent, textTransform: "uppercase", margin: "24px 0 6px" }}>{catLabel}</div>
        <h1 style={{ font: "800 44px/1 'Saira Condensed',sans-serif", margin: 0, textTransform: "uppercase" }}>{row.name} price</h1>

        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginTop: 16 }}>
          <div style={{ font: "800 40px 'Saira Condensed',sans-serif", color: C.accent }}>${fmtNum(row.price)}</div>
          <div style={{ fontSize: 14, color: C.dim }}>{perUnit(row.unit)}</div>
          <div style={{ font: "700 16px 'Saira Condensed',sans-serif", color: chgColor }}>{arrow} {row.chg >= 0 ? "+" : ""}{row.chg}% <span style={{ color: C.faint, fontWeight: 400, fontSize: 12 }}>m/m</span></div>
        </div>
        <div style={{ fontSize: 12.5, color: C.faint, marginTop: 6, fontFamily: "'IBM Plex Mono',monospace" }}>As of {row.period} · source: {row.source}</div>

        {n > 0 ? (
          <>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 24, padding: "16px 0", borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
              <Stat label="1-yr change" value={sign(y1)} color={stColor(y1)} />
              <Stat label="5-yr change" value={sign(y5)} color={stColor(y5)} />
              <Stat label={`High (${spanLabel})`} value={`$${fmtNum(hi)}`} />
              <Stat label={`Low (${spanLabel})`} value={`$${fmtNum(lo)}`} />
            </div>

            <h2 style={{ font: "800 20px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em", margin: "30px 0 2px" }}>Price history</h2>
            <div style={{ fontSize: 12.5, color: C.faint, fontFamily: "'IBM Plex Mono',monospace" }}>Monthly, {fmtCode(pts[0][0])} – {fmtCode(pts[n - 1][0])} · {row.unit}</div>
            <HistoryChart points={pts} />
            <div style={{ fontSize: 12.5, color: C.faint, marginTop: 4 }}>High {fmtCode(hiCode)} · low {fmtCode(loCode)}. All-time within the charted window.</div>
          </>
        ) : (
          <div style={{ marginTop: 24, padding: "16px 18px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, color: C.dim, lineHeight: 1.6 }}>
            We track the live {row.name.toLowerCase()} price from {row.source}. A longer price history isn't available for this series.
          </div>
        )}

        {related.length > 0 && (
          <>
            <h2 style={{ font: "800 20px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em", margin: "34px 0 10px" }}>More {catLabel.toLowerCase()}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
              {related.map((r) => (
                <Link key={r.name} href={`/commodity/${slugify(r.name)}`} style={{ textDecoration: "none", color: "inherit", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 13px" }}>
                  <div style={{ font: "600 14px 'Archivo'", color: C.text }}>{r.name}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
                    <span style={{ font: "700 15px 'Saira Condensed',sans-serif", color: C.accent }}>${fmtNum(r.price)}</span>
                    <span style={{ fontSize: 12, color: r.chg > 0 ? C.up : r.chg < 0 ? C.down : C.dim }}>{r.chg >= 0 ? "+" : ""}{r.chg}%</span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        <h2 style={{ font: "800 20px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em", margin: "34px 0 8px" }}>About this price</h2>
        <p style={{ color: C.dim, fontSize: 14.5, lineHeight: 1.7 }}>
          The {row.name} price shown is the benchmark figure published by {row.source}, in {row.unit}{n ? `, with monthly history back to ${String(pts[0][0]).slice(0, 4)}` : ""}. Figures are end-of-period benchmark prices, not retail or futures quotes, and are updated as each source releases new data. Where a price is converted to US dollars, recent reference exchange rates are used.{" "}
          <Link href="/about" style={{ color: C.accent, textDecoration: "none", borderBottom: `1px solid ${C.line}` }}>Full methodology &amp; sources →</Link>
        </p>

        <section style={{ marginTop: 34, paddingTop: 16, borderTop: `1px solid ${C.line}`, fontSize: 12, color: C.faint, lineHeight: 1.7 }}>
          <Link href="/" style={{ color: C.accent, textDecoration: "none" }}>← Back to the full Voltlas dashboard</Link>
          <div style={{ marginTop: 8 }}>Data: {row.source}. Reuse under CC BY 4.0 with attribution to Voltlas.</div>
        </section>
      </div>
    </main>
  );
}
