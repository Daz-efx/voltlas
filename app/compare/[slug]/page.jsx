// app/compare/[slug]/page.jsx
// Curated country-vs-country comparison pages, built from public/data/latest.json.
// URLs look like /compare/germany-vs-france.

import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COMPARISONS } from "../config";

export const dynamicParams = false;

const SITE = "https://voltlas.com";
const YEAR = new Date().getFullYear();

function loadData() {
  const file = path.join(process.cwd(), "public", "data", "latest.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const usd = (v) => `$${Number(v).toFixed(3)}`;
const usd2 = (v) => `$${Number(v).toFixed(2)}`;
const pairSlug = (a, b) => `${slugify(a)}-vs-${slugify(b)}`;

function findPair(slug, data) {
  const parts = slug.split("-vs-");
  if (parts.length !== 2) return null;
  const A = data.DATA.find((c) => slugify(c.geo) === parts[0]) || null;
  const B = data.DATA.find((c) => slugify(c.geo) === parts[1]) || null;
  return A && B ? { A, B } : null;
}

// Merge petrol/diesel (USD/L) from FUEL_DATA onto a country record.
function withFuel(country, data) {
  const f = (data.FUEL_DATA || []).find((x) => x.geo === country.geo);
  return { ...country, petrol: f?.petrol ?? null, diesel: f?.diesel ?? null };
}

const METRICS = [
  { label: "Electricity · household", key: "elecRes", unit: "kWh" },
  { label: "Electricity · business", key: "elecBiz", unit: "kWh" },
  { label: "Natural gas · household", key: "gasRes", unit: "kWh" },
  { label: "Petrol · Euro-95", key: "petrol", unit: "L", fuel: true },
  { label: "Diesel", key: "diesel", unit: "L", fuel: true },
];

function compareMetric(A, B, key) {
  if (A[key] == null || B[key] == null) return null;
  const a = A[key], b = B[key];
  const cheaper = a <= b ? A : B, pricier = a <= b ? B : A;
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const diff = hi > 0 ? Math.round(((hi - lo) / hi) * 100) : 0;
  return { a, b, cheaper, pricier, diff, same: a === b };
}

export function generateStaticParams() {
  return COMPARISONS.map(([a, b]) => ({ slug: pairSlug(a, b) }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const pair = findPair(slug, loadData());
  if (!pair) return { title: "Comparison not found" };
  const { A, B } = pair;
  const e = compareMetric(A, B, "elecRes");
  const verdict = e
    ? e.same
      ? ` Household electricity costs about the same in both (${usd(e.a)}/kWh).`
      : ` Household electricity is ~${e.diff}% cheaper in ${e.cheaper.geo} (${usd(e.cheaper.elecRes)}/kWh).`
    : "";
  const title = `${A.geo} vs ${B.geo}: electricity, gas & fuel prices (${YEAR})`;
  const description = `Compare electricity, natural gas, and pump prices (petrol and diesel) in ${A.geo} and ${B.geo}, in USD, taxes included, from official sources.${verdict}`;
  const url = `/compare/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", title: `${title} · Voltlas`, description, url },
    twitter: { card: "summary_large_image", title: `${title} · Voltlas`, description },
  };
}

const C = { bg: "#171E2E", panel: "#1C2438", text: "#E8E4DA", dim: "rgba(232,228,218,0.6)", accent: "#F2A93B", green: "#6FCF97", line: "rgba(232,228,218,0.14)" };

export default async function ComparePage({ params }) {
  const { slug } = await params;
  const data = loadData();
  const pair = findPair(slug, data);
  if (!pair) notFound();
  const A = withFuel(pair.A, data);
  const B = withFuel(pair.B, data);

  const rows = METRICS.map((m) => ({ ...m, cmp: compareMetric(A, B, m.key) })).filter((r) => r.cmp);
  const hasFuel = rows.some((r) => r.fuel);
  const elec = compareMetric(A, B, "elecRes");
  const others = COMPARISONS.filter(([a, b]) => pairSlug(a, b) !== slug && (a === A.geo || b === A.geo || a === B.geo || b === B.geo)).slice(0, 6);

  const faq = elec && !elec.same
    ? {
        q: `Is electricity cheaper in ${A.geo} or ${B.geo}?`,
        a: `Household electricity is cheaper in ${elec.cheaper.geo} at ${usd(elec.cheaper.elecRes)} per kWh, versus ${usd(elec.pricier.elecRes)} per kWh in ${elec.pricier.geo} — about ${elec.diff}% less, taxes included.`,
      }
    : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Voltlas", item: SITE },
        { "@type": "ListItem", position: 2, name: `${A.geo} vs ${B.geo}`, item: `${SITE}/compare/${slug}` },
      ] },
      ...(faq ? [{ "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: faq.q, acceptedAnswer: { "@type": "Answer", text: faq.a } }] }] : []),
    ],
  };

  const Cell = ({ row, side }) => {
    const v = side === "A" ? row.cmp.a : row.cmp.b;
    const country = side === "A" ? A : B;
    const isCheaper = !row.cmp.same && row.cmp.cheaper === country;
    const unit = row.unit || "kWh";
    const txt = row.fuel ? usd2(v) : usd(v);
    return (
      <span style={{ font: "600 15px 'IBM Plex Mono',monospace", color: isCheaper ? C.green : C.text }}>
        {txt}<span style={{ fontSize: 10, color: C.dim }}>/{unit}</span>{isCheaper && <span style={{ color: C.green, fontSize: 11 }}> ✓</span>}
      </span>
    );
  };

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Archivo',system-ui,sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;800&family=IBM+Plex+Mono:wght@400;600&family=Archivo:wght@400;500;600&display=swap');`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 64px" }}>
        <Link href="/" style={{ font: "600 11px 'IBM Plex Mono',monospace", color: C.accent, textDecoration: "none", letterSpacing: ".08em" }}>← VOLTLAS</Link>

        <div style={{ font: "600 11px 'IBM Plex Mono',monospace", letterSpacing: ".18em", color: C.accent, textTransform: "uppercase", margin: "26px 0 6px" }}>Comparison · {YEAR}</div>
        <h1 style={{ font: "800 42px/1.04 'Saira Condensed',sans-serif", margin: 0, textTransform: "uppercase" }}>{A.geo} vs {B.geo}</h1>
        <p style={{ color: C.dim, fontSize: 15, maxWidth: 620, marginTop: 12 }}>
          Electricity, natural gas, and pump prices (petrol and diesel) in {A.geo} and {B.geo}, in US dollars, taxes included, from free official sources.
          {elec && !elec.same && <> Household electricity is about <strong style={{ color: C.green }}>{elec.diff}% cheaper in {elec.cheaper.geo}</strong>.</>}
        </p>

        <div style={{ marginTop: 26, border: `1px solid ${C.line}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${C.line}`, background: "rgba(255,255,255,0.02)", font: "600 11px 'Archivo'", letterSpacing: ".08em", textTransform: "uppercase", color: C.dim }}>
            <span>Metric</span><span style={{ textAlign: "right" }}>{A.geo}</span><span style={{ textAlign: "right" }}>{B.geo}</span>
          </div>
          {rows.map((row, i) => (
            <div key={row.key} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 12, padding: "12px 16px", alignItems: "center", borderBottom: i === rows.length - 1 ? "none" : `1px solid ${C.line}` }}>
              <span style={{ fontSize: 13, color: C.dim }}>{row.label}</span>
              <span style={{ textAlign: "right" }}><Cell row={row} side="A" /></span>
              <span style={{ textAlign: "right" }}><Cell row={row} side="B" /></span>
            </div>
          ))}
        </div>
        <p style={{ font: "400 11px 'IBM Plex Mono',monospace", color: C.dim, marginTop: 8 }}>✓ marks the cheaper of the two. Energy sources: {A.source} ({A.geo}), {B.source} ({B.geo}){hasFuel ? "; pump prices via EC Oil Bulletin (EU) and EIA (US)" : ""}.</p>

        {faq && (
          <section style={{ marginTop: 30 }}>
            <h2 style={{ font: "800 20px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em" }}>{faq.q}</h2>
            <p style={{ fontSize: 14, color: C.text, marginTop: 8, lineHeight: 1.6 }}>{faq.a}</p>
          </section>
        )}

        <section style={{ marginTop: 30 }}>
          <h2 style={{ font: "800 18px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em" }}>Full country profiles</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 10 }}>
            <Link href={`/country/${slugify(A.geo)}`} style={{ font: "500 13px 'Archivo'", color: C.accent, textDecoration: "none", borderBottom: `1px solid ${C.line}`, paddingBottom: 2 }}>{A.geo} energy prices</Link>
            <Link href={`/country/${slugify(B.geo)}`} style={{ font: "500 13px 'Archivo'", color: C.accent, textDecoration: "none", borderBottom: `1px solid ${C.line}`, paddingBottom: 2 }}>{B.geo} energy prices</Link>
          </div>
        </section>

        {others.length > 0 && (
          <section style={{ marginTop: 26 }}>
            <h2 style={{ font: "800 18px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em" }}>More comparisons</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 10 }}>
              {others.map(([a, b]) => (
                <Link key={pairSlug(a, b)} href={`/compare/${pairSlug(a, b)}`} style={{ font: "500 13px 'Archivo'", color: C.accent, textDecoration: "none", borderBottom: `1px solid ${C.line}`, paddingBottom: 2 }}>{a} vs {b}</Link>
              ))}
            </div>
          </section>
        )}

        <section style={{ marginTop: 30, paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
          <strong style={{ color: C.text }}>Methodology.</strong> Prices are all-taxes-included end-user retail prices, drawn from free official sources and converted to USD at recent reference rates. Electricity and gas are per kWh; petrol and diesel are pump prices per litre (EC Weekly Oil Bulletin for the EU, EIA for the US). Figures update weekly; each reflects its source's latest published period. A lower price is marked ✓.
          <div style={{ marginTop: 12 }}><Link href="/" style={{ color: C.accent, textDecoration: "none" }}>← Back to the full Voltlas dashboard</Link></div>
        </section>
      </div>
    </main>
  );
}
