// app/about/page.jsx
// Standalone, crawlable About / Methodology / Contact page.
// Strengthens E-E-A-T (clear ownership + sourcing + contact) and houses the
// data-reuse license. URL: /about

import Link from "next/link";

const SITE = "https://voltlas.com";
const YEAR = new Date().getFullYear();
// Change this to whatever alias you set up; point it at your inbox via your
// registrar's free email forwarding (e.g. Namecheap → hello@voltlas.com).
const CONTACT_EMAIL = "hello@voltlas.com";
const LICENSE = "https://creativecommons.org/licenses/by/4.0/";

export const metadata = {
  title: "About Voltlas — sources, methodology & contact",
  description:
    "What Voltlas is, where its energy, fuel and commodity prices come from, and how to get in touch or report an error. An independent, ad-free project built on free official data sources.",
  alternates: { canonical: "/about" },
  openGraph: { type: "website", title: "About Voltlas · sources, methodology & contact", description: "An independent, ad-free energy-price tracker built on free official sources. Sourcing, methodology, and contact.", url: "/about" },
  twitter: { card: "summary_large_image", title: "About Voltlas", description: "Sources, methodology, and how to reach us." },
};

const C = { bg: "#171E2E", panel: "#1C2438", text: "#E8E4DA", dim: "rgba(232,228,218,0.62)", accent: "#F2A93B", line: "rgba(232,228,218,0.14)" };

const SOURCES = [
  ["U.S. Energy Information Administration (EIA)", "US electricity, natural gas, energy-commodity spot prices, and weekly retail road-fuel prices. Public domain."],
  ["Eurostat", "Household and business electricity and natural gas prices across the EU, taxes included."],
  ["EC Weekly Oil Bulletin", "Consumer petrol and diesel prices, taxes included, for the 27 EU member states."],
  ["Statistics Canada", "Monthly average retail gasoline and diesel prices for Canada and major cities (table 18-10-0001). StatCan Open Licence."],
  ["Comisi\u00f3n Reguladora de Energ\u00eda (CRE)", "Mexico's official station-level pump prices for gasoline and diesel, aggregated to a national median. Mexican open-data licence."],
  ["World Bank \u201cPink Sheet\u201d", "Monthly metals, precious metals, and agricultural commodity prices (the Prospects Group commodity data)."],
];

export default function AboutPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Voltlas",
        url: SITE,
        description: "An independent, ad-free tracker of global energy, fuel and commodity prices built entirely on free official sources.",
        founder: { "@type": "Person", name: "Fela Odeyemi", jobTitle: "Power-sector engineer", address: { "@type": "PostalAddress", addressRegion: "California", addressLocality: "San Francisco Bay Area", addressCountry: "US" } },
        contactPoint: { "@type": "ContactPoint", email: CONTACT_EMAIL, contactType: "feedback" },
      },
      {
        "@type": "AboutPage",
        name: "About Voltlas",
        url: `${SITE}/about`,
        isPartOf: { "@type": "WebSite", name: "Voltlas", url: SITE },
        license: LICENSE,
      },
    ],
  };

  const H2 = ({ children }) => (
    <h2 style={{ font: "800 22px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em", margin: "34px 0 10px" }}>{children}</h2>
  );
  const link = { color: C.accent, textDecoration: "none", borderBottom: `1px solid ${C.line}` };

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Archivo',system-ui,sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;800&family=IBM+Plex+Mono:wght@400;600&family=Archivo:wght@400;500;600&display=swap');`}</style>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 64px" }}>
        <Link href="/" style={{ font: "600 11px 'IBM Plex Mono',monospace", color: C.accent, textDecoration: "none", letterSpacing: ".08em" }}>← VOLTLAS</Link>

        <div style={{ font: "600 11px 'IBM Plex Mono',monospace", letterSpacing: ".18em", color: C.accent, textTransform: "uppercase", margin: "26px 0 6px" }}>About</div>
        <h1 style={{ font: "800 46px/1 'Saira Condensed',sans-serif", margin: 0, textTransform: "uppercase" }}>About Voltlas</h1>
        <p style={{ color: C.dim, fontSize: 15.5, lineHeight: 1.65, marginTop: 14 }}>
          Voltlas tracks the price of energy — and the fuels and materials that power it — across the world, in one clean, free place. Every figure is pulled from an official source that permits public republication, converted to US dollars, and labeled with its origin and date. It covers retail electricity and natural gas, petrol and diesel at the pump, and benchmark commodities, with coverage strongest across Europe and North America.
        </p>

        <H2>How it works</H2>
        <p style={{ color: C.dim, fontSize: 15, lineHeight: 1.7 }}>
          Prices are all-taxes-included end-user figures wherever the source provides them, stored in their native form and converted to USD at recent reference exchange rates. Automated connectors re-pull every source on a weekly schedule, so the numbers stay current without manual work. Each price carries its source and the period it represents — and where no free official source exists, the country or commodity is simply left out rather than estimated. The goal is a figure you can trust and trace, not the widest possible coverage.
        </p>

        <H2>Independent &amp; ad-free</H2>
        <p style={{ color: C.dim, fontSize: 15, lineHeight: 1.7 }}>
          Voltlas is an independent project — founded, built, and maintained by Fela Odeyemi, Ph.D, a power-sector engineer based in the San Francisco Bay Area. There are no ads, no paid placements, and no licensed or proprietary data feeds — just public official data, presented plainly. That independence is the point: the value here is trustworthy numbers from sources you can verify yourself.
        </p>

        <H2>Where the data comes from</H2>
        <div style={{ marginTop: 4 }}>
          {SOURCES.map(([name, desc]) => (
            <div key={name} style={{ padding: "12px 0", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ font: "600 14px 'Archivo'", color: C.text }}>{name}</div>
              <div style={{ fontSize: 13.5, color: C.dim, lineHeight: 1.6, marginTop: 3 }}>{desc}</div>
            </div>
          ))}
        </div>

        <H2>Using the data</H2>
        <p style={{ color: C.dim, fontSize: 15, lineHeight: 1.7 }}>
          The underlying figures come from public official sources; Voltlas compiles and presents them. You're welcome to reuse the compiled data under a{" "}
          <a href={LICENSE} style={link} target="_blank" rel="noopener noreferrer">Creative Commons Attribution 4.0</a>{" "}
          license — reuse it freely, just credit Voltlas and link back. Please also check each original source's own terms where relevant.
        </p>

        <H2>Contact &amp; corrections</H2>
        <p style={{ color: C.dim, fontSize: 15, lineHeight: 1.7 }}>
          Spotted a number that looks wrong, a source that's gone stale, or have a suggestion? That feedback is genuinely useful and helps keep the data honest. Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}?subject=Voltlas%20feedback`} style={{ ...link, font: "600 15px 'IBM Plex Mono',monospace" }}>{CONTACT_EMAIL}</a>{" "}
          — for corrections, it helps to include the country or commodity and what you'd expect to see.
        </p>

        <section style={{ marginTop: 36, paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
          <Link href="/" style={{ color: C.accent, textDecoration: "none" }}>← Back to the full Voltlas dashboard</Link>
          <div style={{ marginTop: 8 }}>© {YEAR} Voltlas · built on free official sources.</div>
        </section>
      </div>
    </main>
  );
}
