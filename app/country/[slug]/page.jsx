// app/country/[slug]/page.jsx
// One statically-generated, SEO-optimized page per country, built from
// public/data/latest.json. URLs look like /country/germany.

import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RANKINGS } from "../../rankings/config";
import { COMPARISONS } from "../../compare/config";
import FuelHistoryChart from "./FuelHistoryChart";

export const dynamicParams = false; // only the countries we build; everything else 404s

const SITE = "https://voltlas.com";
const YEAR = new Date().getFullYear();
const LICENSE = "https://creativecommons.org/licenses/by/4.0/";

function loadData() {
  const file = path.join(process.cwd(), "public", "data", "latest.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function loadFuelHistory() {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "fuel-history.json"), "utf8")); }
  catch { return { series: {} }; }
}
function loadEnergyHistory() {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "energy-history.json"), "utf8")); }
  catch { return { series: {} }; }
}
function loadPowerMix() {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "power-mix.json"), "utf8")); }
  catch { return { series: {} }; }
}
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const usd = (v) => `$${Number(v).toFixed(3)}`;
const usd2 = (v) => `$${Number(v).toFixed(2)}`;

function find(slug) {
  const data = loadData();
  const country = data.DATA.find((c) => slugify(c.geo) === slug) || null;
  const fuelHist = country ? (loadFuelHistory().series || {})[country.geo] || null : null;
  const energyHist = country ? (loadEnergyHistory().series || {})[country.geo] || null : null;
  const powerMix = country ? (loadPowerMix().series || {})[country.geo] || null : null;
  return { data, country, fuelHist, energyHist, powerMix };
}

export function generateStaticParams() {
  return loadData().DATA.filter((c) => c.elecRes != null).map((c) => ({ slug: slugify(c.geo) }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const { country } = find(slug);
  if (!country) return { title: "Country not found" };
  const bits = [];
  if (country.elecRes != null) bits.push(`electricity ${usd(country.elecRes)}/kWh`);
  if (country.gasRes != null) bits.push(`gas ${usd(country.gasRes)}/kWh`);
  const title = `${country.geo} electricity & gas prices (${YEAR})`;
  const description = `Current household and business electricity and natural gas prices in ${country.geo}${bits.length ? ": " + bits.join(", ") : ""}. Taxes included, in USD, from ${country.source} — updated ${country.period}.`;
  const url = `/country/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", title: `${title} · Voltlas`, description, url },
    twitter: { card: "summary_large_image", title: `${title} · Voltlas`, description },
  };
}

const C = { bg: "#171E2E", panel: "#1C2438", text: "#E8E4DA", dim: "rgba(232,228,218,0.6)", accent: "#F2A93B", line: "rgba(232,228,218,0.14)" };

// Generation-mix slices, in stacking order, with display colors.
const FUEL_META = [
  ["coal", "Coal", "#6B6B6B"],
  ["oil", "Oil", "#8A6D3B"],
  ["gas", "Natural gas", "#D08A3E"],
  ["nuclear", "Nuclear", "#B07FD8"],
  ["hydro", "Hydro", "#4A90D9"],
  ["wind", "Wind", "#5FB6C9"],
  ["solar", "Solar", "#F2C14E"],
  ["bioenergy", "Bioenergy", "#6AA84F"],
  ["other", "Other renewables", "#8F9AA6"],
];

function Metric({ label, value, sub }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, padding: "16px 18px", background: C.panel }}>
      <div style={{ font: "600 10px/1 'Archivo',sans-serif", letterSpacing: ".12em", textTransform: "uppercase", color: C.dim }}>{label}</div>
      <div style={{ font: "600 26px 'IBM Plex Mono',monospace", color: C.accent, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ font: "400 11px 'IBM Plex Mono',monospace", color: C.dim, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default async function CountryPage({ params }) {
  const { slug } = await params;
  const { data, country, fuelHist, energyHist, powerMix } = find(slug);
  if (!country) notFound();

  const ccy = data.COUNTRY_CCY[country.geo] || "USD";
  const fx = data.FX[ccy];
  const local = (v) => (fx && ccy !== "USD" ? `${(v / fx.usd).toFixed(3)} ${fx.sym}` : null);
  const pli = data.PLI[country.geo];
  const ppp = pli && country.elecRes != null ? country.elecRes / (pli / 100) : null;
  const fuel = (data.FUEL_DATA || []).find((f) => f.geo === country.geo);
  const subs = (data.SUBNATIONAL && data.SUBNATIONAL[country.geo]) || null;
  const subMeta = (data.SUB_META && data.SUB_META[country.geo]) || null;
  const related =
    country.geo === "United States"
      ? ["us-electricity-prices-by-state", "us-gas-prices-by-state", "electricity-prices-by-country", "natural-gas-prices-by-country"]
      : country.region === "Europe"
      ? ["cheapest-electricity-in-europe", "most-expensive-electricity-in-europe", "natural-gas-prices-by-country", "electricity-prices-by-country"]
      : ["electricity-prices-by-country", "natural-gas-prices-by-country"];
  const compares = COMPARISONS.filter(([a, b]) => a === country.geo || b === country.geo).slice(0, 6);

  const url = `${SITE}/country/${slug}`;
  const measured = [
    country.elecRes != null && { "@type": "PropertyValue", name: "Residential electricity price", value: country.elecRes, unitText: "USD per kWh" },
    country.elecBiz != null && { "@type": "PropertyValue", name: "Business electricity price", value: country.elecBiz, unitText: "USD per kWh" },
    country.gasRes != null && { "@type": "PropertyValue", name: "Residential natural gas price", value: country.gasRes, unitText: "USD per kWh" },
    fuel && fuel.petrol != null && { "@type": "PropertyValue", name: "Petrol price", value: fuel.petrol, unitText: "USD per liter" },
    fuel && fuel.diesel != null && { "@type": "PropertyValue", name: "Diesel price", value: fuel.diesel, unitText: "USD per liter" },
  ].filter(Boolean);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Voltlas", item: SITE },
          { "@type": "ListItem", position: 2, name: country.geo, item: url },
        ],
      },
      {
        "@type": "Dataset",
        name: `${country.geo} electricity, gas and fuel prices`,
        description: `Retail electricity, natural gas and transport-fuel prices for ${country.geo}, in USD, from ${country.source}.`,
        url,
        license: LICENSE,
        isAccessibleForFree: true,
        creator: { "@type": "Organization", name: "Voltlas", url: SITE },
        sourceOrganization: { "@type": "Organization", name: country.source },
        temporalCoverage: String(country.period),
        variableMeasured: measured,
      },
    ],
  };

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Archivo',system-ui,sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;800&family=IBM+Plex+Mono:wght@400;600&family=Archivo:wght@400;500;600&display=swap');`}</style>
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "40px 20px 64px" }}>
        <Link href="/" style={{ font: "600 11px 'IBM Plex Mono',monospace", color: C.accent, textDecoration: "none", letterSpacing: ".08em" }}>← VOLTLAS</Link>

        <div style={{ font: "600 11px 'IBM Plex Mono',monospace", letterSpacing: ".18em", color: C.accent, textTransform: "uppercase", margin: "26px 0 6px" }}>{country.region} · energy prices</div>
        <h1 style={{ font: "800 48px/1 'Saira Condensed',sans-serif", margin: 0, textTransform: "uppercase" }}>{country.geo}</h1>
        <p style={{ color: C.dim, fontSize: 15, maxWidth: 620, marginTop: 12 }}>
          What households and businesses in {country.geo} pay for electricity and natural gas, in US dollars, from free official sources. Figures from {country.source}, latest period {country.period}.
        </p>

        {(() => {
          // Auto-generated summary: ranks this country against everything else in the
          // dataset. Unique visible text per page (SEO depth), zero new data sources.
          const ord = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
          const med = (arr) => { const a = [...arr].sort((x, y) => x - y), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
          const rankOf = (v, vals) => vals.filter((x) => x > v).length + 1;
          const nth = (r, word) => (r === 1 ? `the ${word}` : `the ${ord(r)} ${word}`);
          const parts = [];
          if (country.elecRes != null) {
            const vals = data.DATA.filter((c) => c.elecRes != null).map((c) => c.elecRes);
            const r = rankOf(country.elecRes, vals), m = med(vals);
            const pct = Math.round(Math.abs(country.elecRes / m - 1) * 100);
            const rel = pct < 3 ? "right around the median" : country.elecRes > m ? `about ${pct}% above the median of ${usd(m)}/kWh` : `about ${pct}% below the median of ${usd(m)}/kWh`;
            parts.push(`At ${usd(country.elecRes)} per kWh, household electricity in ${country.geo} is ${nth(r, "most expensive")} of the ${vals.length} countries Voltlas tracks — ${rel}.`);
          }
          if (country.gasRes != null) {
            const vals = data.DATA.filter((c) => c.gasRes != null).map((c) => c.gasRes);
            parts.push(`Household natural gas runs ${usd(country.gasRes)} per kWh, ${ord(rankOf(country.gasRes, vals))} of ${vals.length}.`);
          }
          if (fuel && fuel.petrol != null) {
            const vals = (data.FUEL_DATA || []).filter((c) => c.petrol != null).map((c) => c.petrol);
            const r = rankOf(fuel.petrol, vals);
            let s = `Filling up costs ${usd2(fuel.petrol)} per liter of gasoline (${usd2(fuel.petrol * 3.78541)}/gal), ${nth(r, "highest")} of ${vals.length}`;
            if (fuel.petrolNet != null) s += ` — and roughly ${Math.round(((fuel.petrol - fuel.petrolNet) / fuel.petrol) * 100)}% of that pump price is duties and VAT`;
            parts.push(s + ".");
          }
          if (powerMix && powerMix.ren != null && powerMix.ci != null) {
            parts.push(`Behind the meter, ${Math.round(powerMix.ren)}% of ${country.geo}'s electricity came from renewables in ${powerMix.year}, with grid carbon intensity around ${Math.round(powerMix.ci)} gCO₂ per kWh.`);
          }
          if (!parts.length) return null;
          return (
            <p style={{ fontSize: 14.5, lineHeight: 1.65, color: C.text, maxWidth: 680, marginTop: 14 }}>
              {parts.join(" ")}
            </p>
          );
        })()}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 1, background: C.line, border: `1px solid ${C.line}`, marginTop: 26 }}>
          {country.elecRes != null && <Metric label="Electricity · household" value={`${usd(country.elecRes)}/kWh`} sub={local(country.elecRes) ? `${local(country.elecRes)}/kWh local` : null} />}
          {country.elecBiz != null && <Metric label="Electricity · business" value={`${usd(country.elecBiz)}/kWh`} sub={local(country.elecBiz) ? `${local(country.elecBiz)}/kWh local` : null} />}
          {country.gasRes != null && <Metric label="Natural gas · household" value={`${usd(country.gasRes)}/kWh`} sub={local(country.gasRes) ? `${local(country.gasRes)}/kWh local` : null} />}
          {fuel && fuel.petrol != null && <Metric label="Petrol" value={`${usd2(fuel.petrol)}/L`} sub={`${usd2(fuel.petrol * 3.78541)}/gal`} />}
          {fuel && fuel.diesel != null && <Metric label="Diesel" value={`${usd2(fuel.diesel)}/L`} sub={`${usd2(fuel.diesel * 3.78541)}/gal`} />}
        </div>

        <Link href={`/electricity-bill-calculator?country=${slug}`} style={{ display: "inline-block", marginTop: 16, padding: "9px 16px", background: C.accent, color: C.bg, font: "700 12px 'Archivo',sans-serif", textTransform: "uppercase", letterSpacing: ".06em", textDecoration: "none" }}>Estimate your {country.geo} bill →</Link>

        {ppp != null && (
          <div style={{ marginTop: 18, padding: "14px 16px", background: "rgba(242,169,59,0.07)", border: "1px solid rgba(242,169,59,0.22)" }}>
            <div style={{ font: "600 10px 'Archivo',sans-serif", letterSpacing: ".1em", textTransform: "uppercase", color: C.accent }}>Adjusted for purchasing power</div>
            <p style={{ fontSize: 13, color: C.text, margin: "5px 0 0" }}>
              Household electricity costs about <strong>{usd(ppp)} per kWh in international dollars</strong> (nominal {usd(country.elecRes)}), reflecting local purchasing power rather than the market exchange rate. Illustrative.
            </p>
          </div>
        )}

        {powerMix && (() => {
          const slices = FUEL_META
            .map(([k, label, color]) => ({ k, label, color, v: (powerMix.mix && powerMix.mix[k]) || 0 }))
            .filter((s) => s.v > 0);
          if (!slices.length) return null;
          const total = slices.reduce((a, s) => a + s.v, 0) || 1;
          return (
            <section style={{ marginTop: 30 }}>
              <h2 style={{ font: "800 20px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 2px" }}>How {country.geo} makes its electricity</h2>
              <div style={{ fontSize: 12.5, color: C.dim, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 12 }}>
                Share of generation, {powerMix.year}{powerMix.ci != null ? ` · ${powerMix.ci} gCO₂/kWh` : ""}{powerMix.genTWh != null ? ` · ${powerMix.genTWh.toLocaleString()} TWh` : ""} · Ember
              </div>
              <div style={{ display: "flex", width: "100%", height: 30, borderRadius: 3, overflow: "hidden", border: `1px solid ${C.line}` }}>
                {slices.map((s) => (
                  <div key={s.k} title={`${s.label} ${s.v}%`} style={{ width: `${(s.v / total) * 100}%`, background: s.color }} />
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "6px 14px", marginTop: 12 }}>
                {slices.map((s) => (
                  <div key={s.k} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                    <span style={{ width: 11, height: 11, background: s.color, borderRadius: 2, flexShrink: 0 }} />
                    <span style={{ color: C.dim }}>{s.label}</span>
                    <span style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, color: C.text }}>{s.v}%</span>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {energyHist && (() => {
          const MINPTS = 4;
          const charts = [
            { label: "Electricity · household", pts: energyHist.elecRes || [], color: C.accent },
            { label: "Electricity · business", pts: energyHist.elecBiz || [], color: "#9B8CFF" },
            { label: "Natural gas · household", pts: energyHist.gasRes || [], color: "#5FC9A6" },
          ].filter((c) => c.pts.length >= MINPTS);
          if (!charts.length) return null;
          return (
            <section style={{ marginTop: 30 }}>
              <h2 style={{ font: "800 20px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 2px" }}>Energy price history</h2>
              <div style={{ fontSize: 12.5, color: C.dim, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 6 }}>USD per kWh, all taxes included · Eurostat</div>
              {charts.map((c) => (
                <div key={c.label}>
                  <div style={{ font: "600 12px 'IBM Plex Mono',monospace", color: C.dim, textTransform: "uppercase", letterSpacing: ".06em", margin: "14px 0 2px" }}>{c.label}</div>
                  <FuelHistoryChart points={c.pts} color={c.color} unit="/kWh" />
                </div>
              ))}
            </section>
          );
        })()}

        {fuel && (fuel.petrolNet != null || fuel.dieselNet != null) && (() => {
          const mono = "'IBM Plex Mono',monospace";
          const splits = [
            fuel.petrol != null && fuel.petrolNet != null && { label: "Gasoline", retail: fuel.petrol, net: fuel.petrolNet },
            fuel.diesel != null && fuel.dieselNet != null && { label: "Diesel", retail: fuel.diesel, net: fuel.dieselNet },
          ].filter(Boolean);
          if (!splits.length) return null;
          return (
            <section style={{ marginTop: 30 }}>
              <h2 style={{ font: "800 20px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 2px" }}>What's tax at the pump</h2>
              <div style={{ fontSize: 12.5, color: C.dim, fontFamily: mono, marginBottom: 14 }}>{`Pre-tax price vs duties & VAT${fuel.period ? ` · ${fuel.period}` : ""} · EC Oil Bulletin`}</div>
              {splits.map((s) => {
                const tax = Math.round((s.retail - s.net) * 1000) / 1000;
                const pct = Math.round((tax / s.retail) * 100);
                const netPct = (s.net / s.retail) * 100;
                return (
                  <div key={s.label} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13, marginBottom: 5 }}>
                      <span style={{ fontWeight: 600 }}>{s.label}</span>
                      <span style={{ fontFamily: mono, color: C.dim }}><strong style={{ color: C.text }}>{pct}% tax</strong>{` · $${tax.toFixed(2)} of $${s.retail.toFixed(2)}/L`}</span>
                    </div>
                    <div style={{ display: "flex", height: 22, borderRadius: 3, overflow: "hidden", border: `1px solid ${C.line}` }}>
                      <div title={`Pre-tax $${s.net.toFixed(2)}/L`} style={{ width: `${netPct}%`, background: "#5BAE9B" }} />
                      <div title={`Tax $${tax.toFixed(2)}/L`} style={{ width: `${100 - netPct}%`, background: C.accent }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: C.dim, fontFamily: mono }}>
                <span><span style={{ display: "inline-block", width: 9, height: 9, background: "#5BAE9B", marginRight: 5, borderRadius: 2, verticalAlign: "middle" }} />pre-tax</span>
                <span><span style={{ display: "inline-block", width: 9, height: 9, background: C.accent, marginRight: 5, borderRadius: 2, verticalAlign: "middle" }} />tax (duties + VAT)</span>
              </div>
            </section>
          );
        })()}

        {fuelHist && (() => {
          const MINPTS = 6;
          const pe = fuelHist.petrol || [];
          const di = fuelHist.diesel || [];
          const showPe = pe.length >= MINPTS, showDi = di.length >= MINPTS;
          if (!showPe && !showDi) return null;
          return (
            <section style={{ marginTop: 30 }}>
              <h2 style={{ font: "800 20px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em", margin: "0 0 2px" }}>Pump-price history</h2>
              <div style={{ fontSize: 12.5, color: C.dim, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 6 }}>USD per liter{fuel && fuel.source ? ` \u00b7 ${fuel.source}` : ""}</div>
              {showPe && (
                <>
                  <div style={{ font: "600 12px 'IBM Plex Mono',monospace", color: C.dim, textTransform: "uppercase", letterSpacing: ".06em", margin: "12px 0 2px" }}>Gasoline</div>
                  <FuelHistoryChart points={pe} />
                </>
              )}
              {showDi && (
                <>
                  <div style={{ font: "600 12px 'IBM Plex Mono',monospace", color: C.dim, textTransform: "uppercase", letterSpacing: ".06em", margin: "16px 0 2px" }}>Diesel</div>
                  <FuelHistoryChart points={di} color="#7FB0E8" />
                </>
              )}
            </section>
          );
        })()}

        {subs && (
          <section style={{ marginTop: 30 }}>
            <h2 style={{ font: "800 22px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em" }}>By {subMeta ? subMeta.unit : "region"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "2px 24px", marginTop: 8 }}>
              {subs.filter((s) => s.elecRes != null).map((s) => (
                <div key={s.name} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
                  <span>{s.name}</span><span style={{ fontFamily: "'IBM Plex Mono',monospace", color: C.accent }}>{usd(s.elecRes)}/kWh</span>
                </div>
              ))}
            </div>
            {subMeta && subMeta.note && <p style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>※ {subMeta.note}</p>}
          </section>
        )}

        {related.length > 0 && (
          <section style={{ marginTop: 30 }}>
            <h2 style={{ font: "800 18px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em" }}>Related rankings</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 10 }}>
              {related.map((s) => { const r = RANKINGS.find((x) => x.slug === s); return r ? (
                <Link key={s} href={`/rankings/${s}`} style={{ font: "500 13px 'Archivo',sans-serif", color: C.accent, textDecoration: "none", borderBottom: `1px solid ${C.line}`, paddingBottom: 2 }}>{r.h1}</Link>
              ) : null; })}
            </div>
          </section>
        )}

        {compares.length > 0 && (
          <section style={{ marginTop: 26 }}>
            <h2 style={{ font: "800 18px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em" }}>Compare {country.geo}</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 10 }}>
              {compares.map(([a, b]) => (
                <Link key={`${a}-${b}`} href={`/compare/${slugify(a)}-vs-${slugify(b)}`} style={{ font: "500 13px 'Archivo',sans-serif", color: C.accent, textDecoration: "none", borderBottom: `1px solid ${C.line}`, paddingBottom: 2 }}>{a} vs {b}</Link>
              ))}
            </div>
          </section>
        )}

        <section style={{ marginTop: 34, paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: 12, color: C.dim, lineHeight: 1.7 }}>
          <strong style={{ color: C.text }}>Methodology.</strong> Prices are all-taxes-included, sourced from {country.source} and converted to USD at recent reference rates. Electricity and gas are end-user retail prices per kWh. {country.note ? `Note: ${country.note}.` : ""} Voltlas aggregates only freely republishable official data; coverage and update frequency vary by country.
          <div style={{ marginTop: 12 }}><Link href="/" style={{ color: C.accent, textDecoration: "none" }}>← Back to the full Voltlas dashboard</Link></div>
        </section>
      </div>
    </main>
  );
}
