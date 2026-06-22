// app/data/page.jsx
// Public "open data" page: documents the JSON the site already generates,
// with schema, a usage example, cadence, and the CC BY 4.0 reuse terms.
// A backlink magnet and a Google Dataset Search entry point. URL: /data

import Link from "next/link";

const SITE = "https://voltlas.com";
const LICENSE = "https://creativecommons.org/licenses/by/4.0/";
const LATEST = `${SITE}/data/latest.json`;
const HISTORY = `${SITE}/data/commodity-history.json`;
const C = { bg: "#171E2E", panel: "#1C2438", text: "#E8E4DA", dim: "rgba(232,228,218,0.62)", faint: "rgba(232,228,218,0.40)", accent: "#F2A93B", line: "rgba(232,228,218,0.14)" };

export const metadata = {
  title: "Open data — free energy, fuel & commodity prices (JSON) | Voltlas",
  description:
    "Voltlas publishes its global energy, fuel and commodity prices as free, openly licensed JSON — refreshed weekly from official sources, no API key required, reusable under CC BY 4.0.",
  alternates: { canonical: "/data" },
  openGraph: { type: "website", title: "Voltlas open data — free price JSON", description: "Free, officially-sourced energy, fuel and commodity price data as JSON. CC BY 4.0, no key required.", url: "/data" },
  twitter: { card: "summary_large_image", title: "Voltlas open data", description: "Free price JSON, refreshed weekly. CC BY 4.0." },
};

const FIELDS_COMMODITIES = [
  ["name", "Commodity name, e.g. \u201cGold\u201d, \u201cBrent crude oil\u201d"],
  ["cat", "Category: energy, base, precious, or ag"],
  ["price", "Latest price, in USD per the stated unit"],
  ["unit", "Pricing unit, e.g. $/troy oz, $/mt, $/bbl"],
  ["chg", "Percent change versus the prior period"],
  ["source", "Originating official source (EIA, World Bank)"],
  ["period", "The period the price represents"],
];
const FIELDS_HISTORY = [
  ["series", "Object keyed by commodity name"],
  ["series[name].unit", "Pricing unit for that commodity"],
  ["series[name].points", "Array of [\u201cYYYYMmm\u201d, value] monthly pairs, oldest first"],
];

const EXAMPLE = `const res = await fetch("${LATEST}");
const data = await res.json();

// Latest gold price
const gold = data.COMMODITIES.find(c => c.name === "Gold");
console.log(gold.price, gold.unit);   // 4587.21  "$/troy oz"

// 25 years of monthly history
const h = await (await fetch("${HISTORY}")).json();
console.log(h.series["Gold"].points.slice(-3));
// [ ["2026M03", 4712.5], ["2026M04", 4500.1], ["2026M05", 4587.21] ]`;

export default function DataPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Dataset",
        name: "Voltlas — current energy, fuel & commodity prices",
        description: "Latest household and business electricity, residential gas, pump prices (petrol & diesel), and benchmark commodity prices worldwide, in USD. Compiled from official sources.",
        url: `${SITE}/data`,
        license: LICENSE,
        isAccessibleForFree: true,
        creator: { "@type": "Organization", name: "Voltlas", url: SITE },
        distribution: [{ "@type": "DataDownload", encodingFormat: "application/json", contentUrl: LATEST }],
      },
      {
        "@type": "Dataset",
        name: "Voltlas — monthly commodity price history",
        description: "Up to 25 years of monthly price history for metals, precious metals, agricultural commodities and energy benchmarks, in USD.",
        url: `${SITE}/data`,
        license: LICENSE,
        isAccessibleForFree: true,
        creator: { "@type": "Organization", name: "Voltlas", url: SITE },
        distribution: [{ "@type": "DataDownload", encodingFormat: "application/json", contentUrl: HISTORY }],
      },
    ],
  };

  const H2 = ({ children }) => (
    <h2 style={{ font: "800 22px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em", margin: "36px 0 12px" }}>{children}</h2>
  );
  const mono = "'IBM Plex Mono',monospace";
  const urlLink = { color: C.accent, textDecoration: "none", font: `600 13.5px ${mono}`, wordBreak: "break-all" };

  const Card = ({ title, url, children }) => (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", marginBottom: 14 }}>
      <div style={{ font: "700 16px 'Archivo'", color: C.text }}>{title}</div>
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...urlLink, display: "inline-block", margin: "6px 0 10px" }}>{url}</a>
      <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6 }}>{children}</div>
    </div>
  );

  const Fields = ({ rows }) => (
    <div style={{ marginTop: 6 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: `1px solid ${C.line}`, alignItems: "baseline" }}>
          <code style={{ font: `600 12.5px ${mono}`, color: C.accent, minWidth: 150, flexShrink: 0 }}>{k}</code>
          <span style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.5 }}>{v}</span>
        </div>
      ))}
    </div>
  );

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Archivo',system-ui,sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;800&family=IBM+Plex+Mono:wght@400;600&family=Archivo:wght@400;500;600&display=swap');`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 64px" }}>
        <Link href="/" style={{ font: `600 11px ${mono}`, color: C.accent, textDecoration: "none", letterSpacing: ".08em" }}>← VOLTLAS</Link>

        <div style={{ font: `600 11px ${mono}`, letterSpacing: ".18em", color: C.accent, textTransform: "uppercase", margin: "26px 0 6px" }}>Open data</div>
        <h1 style={{ font: "800 46px/1 'Saira Condensed',sans-serif", margin: 0, textTransform: "uppercase" }}>Voltlas data</h1>
        <p style={{ color: C.dim, fontSize: 15.5, lineHeight: 1.65, marginTop: 14 }}>
          Every price on Voltlas is free and openly reusable. The same data the site runs on is published as plain JSON — refreshed weekly from official sources, with no API key, no sign-up, and no rate limits. Use it under a Creative Commons Attribution licence; just credit Voltlas and link back.
        </p>

        <H2>The datasets</H2>
        <Card title="Current prices" url={LATEST}>
          A full snapshot in one file. Key arrays: <code style={{ color: C.text, font: `600 12.5px ${mono}` }}>COMMODITIES</code> (energy, metals, precious, agriculture), <code style={{ color: C.text, font: `600 12.5px ${mono}` }}>DATA</code> (electricity &amp; gas by country, USD/kWh), <code style={{ color: C.text, font: `600 12.5px ${mono}` }}>FUEL_DATA</code> (petrol &amp; diesel by country, USD/litre), and <code style={{ color: C.text, font: `600 12.5px ${mono}` }}>FX</code> (the reference rates used for USD conversion, with <code style={{ color: C.text, font: `600 12.5px ${mono}` }}>FX_DATE</code>).
        </Card>
        <Card title="Commodity price history" url={HISTORY}>
          Up to 25 years of monthly history per commodity — metals, precious metals, agriculture and energy — ready to chart.
        </Card>

        <H2>Field reference</H2>
        <div style={{ font: `600 12px ${mono}`, color: C.faint, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>COMMODITIES[]</div>
        <Fields rows={FIELDS_COMMODITIES} />
        <div style={{ font: `600 12px ${mono}`, color: C.faint, textTransform: "uppercase", letterSpacing: ".06em", margin: "20px 0 2px" }}>commodity-history.json</div>
        <Fields rows={FIELDS_HISTORY} />

        <H2>Quick start</H2>
        <pre style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "14px 16px", overflowX: "auto", font: `400 12.5px/1.6 ${mono}`, color: C.text }}>{EXAMPLE}</pre>

        <H2>Licence &amp; attribution</H2>
        <p style={{ color: C.dim, fontSize: 15, lineHeight: 1.7 }}>
          The compiled data is offered under{" "}
          <a href={LICENSE} target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "none", borderBottom: `1px solid ${C.line}` }}>Creative Commons Attribution 4.0</a>. You're free to use it commercially or non-commercially, as long as you credit Voltlas. A simple attribution works:
        </p>
        <pre style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 16px", overflowX: "auto", font: `400 12.5px ${mono}`, color: C.text }}>{`Data: Voltlas (https://voltlas.com), CC BY 4.0`}</pre>
        <p style={{ color: C.dim, fontSize: 14.5, lineHeight: 1.7, marginTop: 12 }}>
          Each price also carries its own originating source (EIA, Eurostat, EC Oil Bulletin, World Bank); please honour those upstream sources' terms where relevant. Full sourcing is on the{" "}
          <Link href="/about" style={{ color: C.accent, textDecoration: "none", borderBottom: `1px solid ${C.line}` }}>methodology page</Link>.
        </p>

        <section style={{ marginTop: 36, paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: 12, color: C.faint, lineHeight: 1.7 }}>
          <Link href="/" style={{ color: C.accent, textDecoration: "none" }}>← Back to the full Voltlas dashboard</Link>
          <div style={{ marginTop: 8 }}>Questions about the data? <a href="mailto:hello@voltlas.com" style={{ color: C.accent, textDecoration: "none" }}>hello@voltlas.com</a></div>
        </section>
      </div>
    </main>
  );
}
