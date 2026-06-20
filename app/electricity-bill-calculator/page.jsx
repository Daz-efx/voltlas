// app/electricity-bill-calculator/page.jsx
// Server wrapper: reads latest.json, passes country electricity prices to the
// interactive Calculator (client component), and handles SEO + structured data.

import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import Calculator from "../components/Calculator";

const SITE = "https://voltlas.com";
const YEAR = new Date().getFullYear();
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const metadata = {
  title: `Electricity bill calculator by country (${YEAR})`,
  description:
    "Estimate your monthly and yearly electricity bill from your kWh usage, in any country Voltlas tracks — using real, taxes-included prices from official sources. See how the same usage compares around the world.",
  alternates: { canonical: "/electricity-bill-calculator" },
  openGraph: { type: "website", title: `Electricity bill calculator · Voltlas`, description: "Estimate your electricity bill in any country from real, taxes-included prices, and compare the same usage worldwide.", url: "/electricity-bill-calculator" },
  twitter: { card: "summary_large_image", title: "Electricity bill calculator · Voltlas", description: "Estimate your electricity bill in any country from real official prices." },
};

const C = { bg: "#171E2E", text: "#E8E4DA", dim: "rgba(232,228,218,0.6)", accent: "#F2A93B", line: "rgba(232,228,218,0.14)" };

export default function Page() {
  const file = path.join(process.cwd(), "public", "data", "latest.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const countries = data.DATA.filter((c) => c.elecRes != null).map((c) => {
    const ccy = (data.COUNTRY_CCY && data.COUNTRY_CCY[c.geo]) || "USD";
    const fx = (data.FX && data.FX[ccy]) || null;
    return { geo: c.geo, slug: slugify(c.geo), elecRes: c.elecRes, region: c.region, ccy, fxUsd: fx ? fx.usd : null, fxSym: fx ? fx.sym : "" };
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebApplication", name: "Electricity bill calculator", applicationCategory: "FinanceApplication", operatingSystem: "Web", url: `${SITE}/electricity-bill-calculator`, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, description: "Estimate an electricity bill from kWh usage using real, taxes-included prices by country." },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Voltlas", item: SITE },
        { "@type": "ListItem", position: 2, name: "Electricity bill calculator", item: `${SITE}/electricity-bill-calculator` },
      ] },
    ],
  };

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Archivo',system-ui,sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;800&family=IBM+Plex+Mono:wght@400;600;700&family=Archivo:wght@400;500;600&display=swap');`}</style>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 64px" }}>
        <Link href="/" style={{ font: "600 11px 'IBM Plex Mono',monospace", color: C.accent, textDecoration: "none", letterSpacing: ".08em" }}>← VOLTLAS</Link>

        <div style={{ font: "600 11px 'IBM Plex Mono',monospace", letterSpacing: ".18em", color: C.accent, textTransform: "uppercase", margin: "26px 0 6px" }}>Free tool · {YEAR}</div>
        <h1 style={{ font: "800 44px/1.02 'Saira Condensed',sans-serif", margin: 0, textTransform: "uppercase" }}>Electricity bill calculator</h1>
        <p style={{ color: C.dim, fontSize: 15, maxWidth: 620, marginTop: 12 }}>
          Enter your monthly electricity use and a country to estimate your bill, using real household prices — taxes included, from free official sources. Then see what the same usage would cost everywhere else.
        </p>

        <Calculator countries={countries} />

        <section style={{ marginTop: 32, paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
          <strong style={{ color: C.text }}>How it works.</strong> Your bill is estimated as usage (kWh) × the country's average household electricity price, taxes included, converted to USD at recent reference rates. Real bills also include fixed standing charges and tariff tiers this doesn't model, so treat the figure as a like-for-like comparison rather than an exact invoice. Prices update weekly. <Link href="/rankings/electricity-prices-by-country" style={{ color: C.accent, textDecoration: "none" }}>See full electricity price rankings →</Link>
          <div style={{ marginTop: 12 }}><Link href="/" style={{ color: C.accent, textDecoration: "none" }}>← Back to the full Voltlas dashboard</Link></div>
        </section>
      </div>
    </main>
  );
}
