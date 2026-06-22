"use client";
import React, { useState, useMemo, useEffect } from "react";

// ════════════════════════════════════════════════════════════════
// VOLTLAS — the price of energy, the fuels and materials that power it.
// FREE-SOURCE ONLY. Every figure comes from a source that permits public
// republication. Prototype data is representative; in production each array
// is replaced by a fetch() of the generated /v1 JSON (see hosting guide).
// ════════════════════════════════════════════════════════════════

// ── National retail energy, USD per kWh. `note` flags non-average figures. ──
const UP = "#6FCF97", DOWN = "#EB6E5B";
const COOL = [44, 95, 90], WARM = [242, 169, 59]; // map gradient endpoints (RGB)

// ── Deterministic 12-point history for sparklines (seeded, ends near current). ──
function sparkSeries(seed, current, n = 12, vol = 0.06) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rand = () => { h = (Math.imul(h, 1103515245) + 12345) & 0x7fffffff; return h / 0x7fffffff; };
  const pts = []; let v = current * (1 - vol);
  for (let i = 0; i < n; i++) { v = v * (1 + (rand() - 0.45) * vol); pts.push(v); }
  const k = current / pts[n - 1];
  return pts.map((p) => p * k);
}
function Spark({ seed, value, color, w = 58, h = 20 }) {
  const s = sparkSeries(seed, value);
  const min = Math.min(...s), max = Math.max(...s), span = max - min || 1;
  const pts = s.map((v, i) => `${((i / (s.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`).join(" ");
  const up = s[s.length - 1] >= s[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color || (up ? UP : DOWN)} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}
function hexFromRamp(t) {
  const c = COOL.map((a, i) => Math.round(a + (WARM[i] - a) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const GRID = "minmax(108px, 1fr) 1.4fr 62px 124px"; // name | rail | spark | price

// Best-effort: is the visitor in the US? (timezone first, locale as backup.)
function viewerIsUS() {
  if (typeof window === "undefined") return false;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const US_TZ = new Set(["America/New_York","America/Detroit","America/Chicago","America/Denver","America/Boise","America/Phoenix","America/Los_Angeles","America/Anchorage","America/Juneau","America/Sitka","America/Nome","America/Adak","Pacific/Honolulu","America/Menominee","America/Indiana/Indianapolis","America/Kentucky/Louisville"]);
    if (US_TZ.has(tz)) return true;
    const lang = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    return /[-_]US$/i.test(lang);
  } catch (e) { return false; }
}

// ── Homepage navigation into the programmatic pages (discovery + internal linking). ──
const NAV_QUICK = [
  ["/rankings/electricity-prices-by-country", "Electricity by country"],
  ["/rankings/cheapest-electricity-in-europe", "Cheapest in Europe"],
  ["/rankings/cheapest-petrol-in-europe", "Cheapest petrol"],
  ["/compare/germany-vs-france", "Compare countries"],
  ["/electricity-bill-calculator", "Bill calculator"],
];
const NAV_GROUPS = [
  ["Rankings", [
    ["/rankings/electricity-prices-by-country", "Electricity prices by country"],
    ["/rankings/cheapest-electricity-in-europe", "Cheapest electricity in Europe"],
    ["/rankings/most-expensive-electricity-in-europe", "Most expensive electricity in Europe"],
    ["/rankings/natural-gas-prices-by-country", "Natural gas prices by country"],
    ["/rankings/us-electricity-prices-by-state", "US electricity by state"],
  ]],
  ["Fuel rankings", [
    ["/rankings/cheapest-petrol-in-europe", "Cheapest petrol in Europe"],
    ["/rankings/most-expensive-petrol-in-europe", "Most expensive petrol in Europe"],
    ["/rankings/cheapest-diesel-in-europe", "Cheapest diesel in Europe"],
    ["/rankings/petrol-prices-by-country", "Petrol prices by country"],
    ["/rankings/diesel-prices-by-country", "Diesel prices by country"],
  ]],
  ["Compare & tools", [
    ["/compare/germany-vs-france", "Germany vs France"],
    ["/compare/united-states-vs-germany", "United States vs Germany"],
    ["/compare/netherlands-vs-poland", "Netherlands vs Poland"],
    ["/compare/spain-vs-portugal", "Spain vs Portugal"],
    ["/electricity-bill-calculator", "Electricity bill calculator"],
    ["/about", "About, sources & contact"],
    ["/data", "Open data (free JSON)"],
  ]],
];

export default function Dashboard({ DATA, REGIONS, SOURCE_CADENCE, PLI, SUB_META, SUBNATIONAL, FX, FX_DATE, COUNTRY_CCY, FUEL_DATA, FUEL_CADENCE, FUEL_SUB_META, FUEL_SUBNATIONAL, COMMODITY_CATS, COMMODITIES }) {
  const [view, setView] = useState("energy"); // energy | fuels | commodities | map
  const [fuel, setFuel] = useState("electricity");
  const [sector, setSector] = useState("res");
  const [tfuel, setTfuel] = useState("petrol");
  const [fUnit, setFUnit] = useState("L");
  useEffect(() => { if (viewerIsUS()) setFUnit("gal"); }, []);
  const [region, setRegion] = useState("All");
  const [sortDesc, setSortDesc] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [tip, setTip] = useState(null); // custom FX tooltip: { text, x, y }
  useEffect(() => {
    if (!tip) return;
    const close = () => setTip(null);
    document.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [tip]);
  const [detail, setDetail] = useState(null); // geo string or null
  const [showMethod, setShowMethod] = useState(false);

  const field = fuel === "gas" ? "gasRes" : sector === "res" ? "elecRes" : "elecBiz";
  const tField = tfuel === "diesel" ? "diesel" : "petrol";
  const accent = view === "commodities" ? "#E8C36B" : view === "fuels" ? "#5BAE9B" : "#F2A93B";
  const accentDim = view === "fuels" ? "rgba(91,174,155,0.16)" : fuel === "gas" ? "rgba(91,216,224,0.14)" : "rgba(242,169,59,0.14)";
  const q = query.trim().toLowerCase();
  const matchQ = (name) => !q || name.toLowerCase().includes(q);

  // ── Energy view ──
  const subRowsFor = (geo) => (SUBNATIONAL[geo] || []).filter((s) => s[field] != null).sort((a, b) => (sortDesc ? b[field] - a[field] : a[field] - b[field]));
  const rows = useMemo(() => {
    const r = DATA.filter((d) => d[field] != null && (region === "All" || d.region === region) && matchQ(d.geo));
    r.sort((a, b) => (sortDesc ? b[field] - a[field] : a[field] - b[field]));
    return r;
  }, [field, region, sortDesc, q]);
  const stats = useMemo(() => {
    if (!rows.length) return null;
    const vals = rows.map((d) => d[field]);
    return { min: Math.min(...vals), max: Math.max(...vals), avg: vals.reduce((s, v) => s + v, 0) / vals.length, n: vals.length };
  }, [rows, field]);
  const railBounds = useMemo(() => {
    const nat = DATA.filter((d) => d[field] != null).map((d) => d[field]);
    const sub = Object.values(SUBNATIONAL).flat().filter((s) => s[field] != null).map((s) => s[field]);
    const all = [...nat, ...sub];
    return { lo: Math.min(...all), hi: Math.max(...all) };
  }, [field]);

  // ── Fuels view ──
  const tSubRowsFor = (geo) => (FUEL_SUBNATIONAL[geo] || []).filter((s) => s[tField] != null).sort((a, b) => (sortDesc ? b[tField] - a[tField] : a[tField] - b[tField]));
  const tRows = useMemo(() => {
    const r = FUEL_DATA.filter((d) => d[tField] != null && (region === "All" || d.region === region) && matchQ(d.geo));
    r.sort((a, b) => (sortDesc ? b[tField] - a[tField] : a[tField] - b[tField]));
    return r;
  }, [tField, region, sortDesc, q]);
  const tStats = useMemo(() => {
    if (!tRows.length) return null;
    const vals = tRows.map((d) => d[tField]);
    return { min: Math.min(...vals), max: Math.max(...vals), avg: vals.reduce((s, v) => s + v, 0) / vals.length, n: vals.length };
  }, [tRows, tField]);
  const tRailBounds = useMemo(() => {
    const nat = FUEL_DATA.filter((d) => d[tField] != null).map((d) => d[tField]);
    const sub = Object.values(FUEL_SUBNATIONAL).flat().filter((s) => s[tField] != null).map((s) => s[tField]);
    return { lo: Math.min(...nat, ...sub), hi: Math.max(...nat, ...sub) };
  }, [tField]);

  const clampPos = (v, b) => Math.max(0, Math.min(100, ((v - b.lo) / (b.hi - b.lo)) * 100));
  const pos = (v) => clampPos(v, railBounds);
  const tPos = (v) => clampPos(v, tRailBounds);
  const fmt = (v) => `$${v.toFixed(3)}`;
  const fmtFuel = (v) => `$${v.toFixed(2)}`;
  const fmtCommodity = (v) => (v >= 100 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : v.toFixed(2));
  const commoditySlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const GAL = 3.78541;
  const fuLabel = fUnit === "gal" ? "gal" : "L";
  const altLabel = fUnit === "gal" ? "L" : "gal";
  const toU = (v) => (fUnit === "gal" ? v * GAL : v);
  const altU = (v) => (fUnit === "gal" ? v : v * GAL);

  const ccyOf = (geo) => COUNTRY_CCY[geo] || "USD";
  const toLocal = (usdVal, ccy) => usdVal / FX[ccy].usd;
  const fmtLocal = (v, ccy) => {
    const sym = FX[ccy].sym, dec = v >= 10 ? 1 : v >= 1 ? 2 : 3, num = v.toFixed(dec);
    return sym === "$" || sym === "€" || sym === "£" ? `${sym}${num}` : `${num} ${sym}`;
  };
  const fxTip = (usdVal, geo) => {
    const ccy = ccyOf(geo);
    if (ccy === "USD") return `${fmt(usdVal)} — quoted natively in USD, no conversion`;
    return `${fmtLocal(toLocal(usdVal, ccy), ccy)} local  ·  1 ${ccy} = $${FX[ccy].usd}  ·  ${FX_DATE}`;
  };
  const fxTipFuel = (usdPerL, geo) => {
    const ccy = ccyOf(geo), disp = toU(usdPerL);
    if (ccy === "USD") return `${fmtFuel(disp)}/${fuLabel} — quoted natively in USD, no conversion`;
    return `${fmtLocal(toLocal(disp, ccy), ccy)}/${fuLabel} local  ·  1 ${ccy} = $${FX[ccy].usd}  ·  ${FX_DATE}`;
  };
  const pppOf = (usdVal, geo) => (PLI[geo] ? usdVal / (PLI[geo] / 100) : null);
  const tipProps = (text) => ({
    onMouseEnter: (e) => setTip({ text, x: e.clientX, y: e.clientY }),
    onMouseMove: (e) => setTip({ text, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTip(null),
    onClick: (e) => { e.stopPropagation(); setTip((t) => (t && t.text === text ? null : { text, x: e.clientX, y: e.clientY })); },
  });

  const toggleExpand = (geo) => setExpanded((prev) => { const n = new Set(prev); n.has(geo) ? n.delete(geo) : n.add(geo); return n; });
  const countriesWithSub = rows.filter((d) => subRowsFor(d.geo).length > 0).map((d) => d.geo);
  const allExpanded = countriesWithSub.length > 0 && countriesWithSub.every((g) => expanded.has(g));
  const tCountriesWithSub = tRows.filter((d) => tSubRowsFor(d.geo).length > 0).map((d) => d.geo);
  const tAllExpanded = tCountriesWithSub.length > 0 && tCountriesWithSub.every((g) => expanded.has(g));

  const Rail = ({ pct, aria, dim }) => (
    <div style={{ position: "relative", height: 18 }} aria-label={aria}>
      <div style={{ position: "absolute", top: 8, left: 0, right: 0, height: 2, background: "rgba(232,228,218,0.12)" }} />
      <div style={{ position: "absolute", top: 8, left: 0, height: 2, width: `${pct}%`, background: accentDim, transition: "width .4s" }} />
      <div style={{ position: "absolute", top: dim ? 5 : 3, left: `calc(${pct}% - ${dim ? 4 : 6}px)`, width: dim ? 8 : 12, height: dim ? 8 : 12, background: dim ? "transparent" : accent, border: dim ? `2px solid ${accent}` : "none", transform: "rotate(45deg)", transition: "left .4s", boxShadow: dim ? "none" : `0 0 10px ${accentDim}` }} />
    </div>
  );

  const searchBox = (
    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search country…" aria-label="Search country"
      style={{ background: "#171E2E", color: "#E8E4DA", border: "1px solid rgba(232,228,218,0.22)", padding: "7px 10px", font: "500 12px 'Archivo'", minWidth: 130 }} />
  );

  // ── Country detail (the per-country landing-page content) ──
  const detailData = useMemo(() => {
    if (!detail) return null;
    const e = DATA.find((d) => d.geo === detail);
    const f = FUEL_DATA.find((d) => d.geo === detail);
    const metrics = [
      e && e.elecRes != null && { label: "Electricity · household", v: e.elecRes, unit: "/kWh", key: `${detail}-er`, big: true },
      e && e.elecBiz != null && { label: "Electricity · business", v: e.elecBiz, unit: "/kWh", key: `${detail}-eb` },
      e && e.gasRes != null && { label: "Natural gas · household", v: e.gasRes, unit: "/kWh", key: `${detail}-gr` },
      f && f.petrol != null && { label: "Petrol", v: toU(f.petrol), unit: "/" + fuLabel, key: `${detail}-pe` },
      f && f.diesel != null && { label: "Diesel", v: toU(f.diesel), unit: "/" + fuLabel, key: `${detail}-di` },
    ].filter(Boolean);
    return { e, f, metrics };
  }, [detail, fUnit]);

  return (
    <div style={{ minHeight: "100vh", background: "#171E2E", color: "#E8E4DA", fontFamily: "'Archivo', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@600;800&family=IBM+Plex+Mono:wght@400;600&family=Archivo:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .row:hover { background: rgba(232,228,218,0.045) !important; }
        .subrow:hover { background: rgba(232,228,218,0.03) !important; }
        .seg { border: 1px solid rgba(232,228,218,0.22); background: transparent; color: #E8E4DA; padding: 7px 14px; font: 600 12px 'Archivo'; letter-spacing: .06em; text-transform: uppercase; cursor: pointer; }
        .seg:focus-visible, .exp:focus-visible, .tile:focus-visible, .cname:focus-visible { outline: 2px solid #F2A93B; outline-offset: 2px; }
        .tab { border: none; background: transparent; color: rgba(232,228,218,0.5); cursor: pointer; font: 800 15px 'Saira Condensed'; letter-spacing: .08em; text-transform: uppercase; padding: 8px 0; border-bottom: 2px solid transparent; }
        .tab:focus-visible { outline: 2px solid #F2A93B; outline-offset: 3px; }
        .exp { border: none; background: transparent; color: inherit; cursor: pointer; padding: 0; font: 600 10px 'IBM Plex Mono'; letter-spacing: .06em; text-align: left; }
        .cname { border: none; background: transparent; color: #E8E4DA; cursor: pointer; padding: 0; font: 600 14px 'Archivo'; text-align: left; }
        .cname:hover { color: #F2A93B; }
        .navlink:hover { color: #FFFFFF !important; }
        .tile { border: 1px solid rgba(0,0,0,0.25); cursor: pointer; color: #14110A; text-align: left; padding: 8px 9px; }
        .tile:hover { outline: 2px solid #E8E4DA; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "30px 20px 64px" }}>
        {/* Tabs + methodology link */}
        <div style={{ display: "flex", gap: 24, alignItems: "center", borderBottom: "1px solid rgba(232,228,218,0.16)", marginBottom: 24 }}>
          {[["energy", "Retail energy"], ["fuels", "Transport fuels"], ["commodities", "Commodities"], ["map", "Map"]].map(([k, label]) => (
            <button key={k} className="tab" onClick={() => setView(k)} style={{ color: view === k ? "#E8E4DA" : "rgba(232,228,218,0.5)", borderBottomColor: view === k ? accent : "transparent" }}>{label}</button>
          ))}
          <button className="tab" onClick={() => setShowMethod(true)} style={{ marginLeft: "auto", fontSize: 12, color: "rgba(232,228,218,0.5)" }}>Methodology</button>
        </div>

        {/* Header */}
        <div style={{ borderBottom: "1px solid rgba(232,228,218,0.16)", paddingBottom: 20, marginBottom: 22 }}>
          <div style={{ font: "600 11px 'IBM Plex Mono'", letterSpacing: ".22em", color: accent, textTransform: "uppercase", marginBottom: 6 }}>
            ⚡ Voltlas · the price of energy — and the fuels &amp; materials that power it
          </div>
          <h1 style={{ font: "800 46px/1 'Saira Condensed'", margin: 0, textTransform: "uppercase", letterSpacing: ".01em" }}>
            {view === "commodities" ? "What the world pays for raw materials" : view === "fuels" ? "What the world pays at the pump" : view === "map" ? "The price of power, mapped" : `What the world pays for ${fuel === "gas" ? "natural gas" : "electricity"}`}
          </h1>
          <p style={{ margin: "10px 0 0", color: "rgba(232,228,218,0.62)", fontSize: 14, maxWidth: 650 }}>
            {view === "commodities" ? "Global benchmark prices in USD: energy spot prices — crude oil (WTI, Brent) and natural gas (Henry Hub) — from the EIA, plus metals, precious metals and agricultural commodities from the World Bank. Click any commodity for its full price history. Live intraday exchange quotes are licensed and excluded."
              : view === "fuels" ? "Retail petrol and diesel at the pump, taxes included — 27 EU countries from the EC Weekly Oil Bulletin and the United States from the EIA, refreshed weekly. Toggle $/litre and $/US gallon; click the US for its state-by-state breakdown."
              : view === "map" ? "Residential electricity price by country, shaded low to high. Click any tile for the country's full energy, fuel and commodity-context profile."
              : `End-user prices in USD per kWh${fuel === "gas" ? "-equivalent" : ""}, taxes included. Tap or hover a price for the FX rate; click a country for its full profile; expand for state/province detail.`}
          </p>
          <div style={{ marginTop: 10, display: "inline-block", font: "600 10px 'IBM Plex Mono'", letterSpacing: ".12em", color: "#171E2E", background: "#E8E4DA", padding: "3px 8px", textTransform: "uppercase" }}>Live · free official sources</div>
        </div>

        {/* Quick navigation into the rankings / compare / calculator pages */}
        <nav aria-label="Explore Voltlas pages" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 14px", marginBottom: 26 }}>
          <span style={{ font: "600 10px 'IBM Plex Mono'", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(232,228,218,0.4)" }}>Explore →</span>
          {NAV_QUICK.map(([href, label]) => (
            <a key={href} href={href} className="navlink" style={{ color: "#F2A93B", textDecoration: "none", font: "500 13px 'Archivo'", borderBottom: "1px solid rgba(232,228,218,0.16)", paddingBottom: 2 }}>{label}</a>
          ))}
        </nav>

        {/* ENERGY */}
        {view === "energy" && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20, alignItems: "center" }}>
              <div style={{ display: "flex" }}>
                {["electricity", "gas"].map((f) => (
                  <button key={f} className="seg" onClick={() => setFuel(f)} style={{ background: fuel === f ? accent : "transparent", color: fuel === f ? "#171E2E" : "#E8E4DA", borderColor: fuel === f ? accent : "rgba(232,228,218,0.22)" }}>{f === "gas" ? "Natural gas" : "Electricity"}</button>
                ))}
              </div>
              {fuel === "electricity" && (
                <div style={{ display: "flex" }}>
                  {[["res", "Household"], ["biz", "Business"]].map(([k, label]) => (
                    <button key={k} className="seg" onClick={() => setSector(k)} style={{ opacity: sector === k ? 1 : 0.55, borderColor: sector === k ? "#E8E4DA" : "rgba(232,228,218,0.22)" }}>{label}</button>
                  ))}
                </div>
              )}
              <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Filter by region" style={{ background: "#171E2E", color: "#E8E4DA", border: "1px solid rgba(232,228,218,0.22)", padding: "7px 10px", font: "600 12px 'Archivo'" }}>
                {REGIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
              {searchBox}
              {countriesWithSub.length > 0 && (
                <button className="seg" onClick={() => setExpanded(allExpanded ? new Set() : new Set(countriesWithSub))}>{allExpanded ? "Collapse all" : "Expand all states"}</button>
              )}
              <button className="seg" onClick={() => setSortDesc(!sortDesc)} style={{ marginLeft: "auto" }}>{sortDesc ? "▼ High → low" : "▲ Low → high"}</button>
            </div>

            {stats && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 1, background: "rgba(232,228,218,0.16)", border: "1px solid rgba(232,228,218,0.16)", marginBottom: 26 }}>
                {[["Countries shown", stats.n], ["Average", fmt(stats.avg)], ["Lowest", fmt(stats.min)], ["Highest", fmt(stats.max)]].map(([k, v]) => (
                  <div key={k} style={{ background: "#171E2E", padding: "12px 14px" }}>
                    <div style={{ font: "600 10px 'Archivo'", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(232,228,218,0.5)" }}>{k}</div>
                    <div style={{ font: "600 22px 'IBM Plex Mono'", color: accent, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 14, font: "400 10px 'IBM Plex Mono'", color: "rgba(232,228,218,0.45)", padding: "0 0 6px", borderBottom: "1px solid rgba(232,228,218,0.16)" }}>
              <span>COUNTRY</span><span>GLOBAL RANGE {fmt(railBounds.lo)}–{fmt(railBounds.hi)}</span><span>12-MO</span><span style={{ textAlign: "right" }}>USD/kWh</span>
            </div>

            {rows.map((d, i) => {
              const subs = subRowsFor(d.geo);
              const isOpen = expanded.has(d.geo);
              const meta = SUB_META[d.geo];
              return (
                <React.Fragment key={d.geo}>
                  <div className="row" style={{ display: "grid", gridTemplateColumns: GRID, gap: 14, alignItems: "center", padding: "10px 4px", borderBottom: "1px solid rgba(232,228,218,0.08)" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button className="cname" onClick={() => setDetail(d.geo)}>{d.geo}</button>
                        {d.note && <span {...tipProps(d.note)} style={{ cursor: "help", color: accent, font: "600 10px 'IBM Plex Mono'", borderBottom: `1px dotted ${accent}` }}>※</span>}
                      </div>
                      {subs.length > 0 ? (
                        <button className="exp" onClick={() => toggleExpand(d.geo)} aria-expanded={isOpen} style={{ color: accent, marginTop: 2 }}>{isOpen ? "▾" : "▸"} {subs.length} {meta.unit}</button>
                      ) : (
                        <div style={{ font: "400 10px 'IBM Plex Mono'", color: "rgba(232,228,218,0.42)" }}>{d.region}</div>
                      )}
                    </div>
                    <Rail pct={pos(d[field])} aria={`${d.geo}: ${fmt(d[field])} per kWh`} dim={false} />
                    <Spark seed={d.geo + field} value={d[field]} />
                    <div style={{ textAlign: "right" }}>
                      <div {...tipProps(fxTip(d[field], d.geo))} style={{ font: "600 15px 'IBM Plex Mono'", cursor: "help", color: i === 0 && sortDesc ? accent : "#E8E4DA", borderBottom: ccyOf(d.geo) !== "USD" ? "1px dotted rgba(232,228,218,0.3)" : "none", display: "inline-block" }}>{fmt(d[field])}</div>
                      <div style={{ font: "400 9px 'IBM Plex Mono'", color: "rgba(232,228,218,0.42)" }}>{d.source} · {d.period}</div>
                    </div>
                  </div>
                  {isOpen && subs.map((s) => (
                    <div key={s.name} className="subrow" style={{ display: "grid", gridTemplateColumns: GRID, gap: 14, alignItems: "center", padding: "7px 4px", borderBottom: "1px solid rgba(232,228,218,0.05)", background: "rgba(232,228,218,0.018)" }}>
                      <div style={{ paddingLeft: 14, borderLeft: `2px solid ${accentDim}`, marginLeft: 2, fontWeight: 500, fontSize: 13, color: "rgba(232,228,218,0.85)" }}>{s.name}</div>
                      <Rail pct={pos(s[field])} aria={`${d.geo} — ${s.name}: ${fmt(s[field])} per kWh`} dim={true} />
                      <Spark seed={d.geo + s.name + field} value={s[field]} w={50} h={16} />
                      <div style={{ textAlign: "right" }}>
                        <div {...tipProps(fxTip(s[field], d.geo))} style={{ font: "600 13px 'IBM Plex Mono'", cursor: "help", color: "rgba(232,228,218,0.85)", borderBottom: ccyOf(d.geo) !== "USD" ? "1px dotted rgba(232,228,218,0.25)" : "none", display: "inline-block" }}>{fmt(s[field])}</div>
                        <div style={{ font: "400 9px 'IBM Plex Mono'", color: "rgba(232,228,218,0.38)" }}>{meta.source}</div>
                      </div>
                    </div>
                  ))}
                  {isOpen && meta && meta.note && (
                    <div style={{ font: "400 10px 'IBM Plex Mono'", color: "rgba(232,228,218,0.38)", padding: "5px 4px 9px 20px", borderBottom: "1px solid rgba(232,228,218,0.05)" }}>※ {meta.note}</div>
                  )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && <p style={{ color: "rgba(232,228,218,0.5)", padding: "20px 4px", font: "400 13px 'Archivo'" }}>No countries match “{query}”.</p>}
          </>
        )}

        {/* FUELS */}
        {view === "fuels" && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20, alignItems: "center" }}>
              <div style={{ display: "flex" }}>
                {[["petrol", "Petrol"], ["diesel", "Diesel"]].map(([k, label]) => (
                  <button key={k} className="seg" onClick={() => setTfuel(k)} style={{ background: tfuel === k ? accent : "transparent", color: tfuel === k ? "#171E2E" : "#E8E4DA", borderColor: tfuel === k ? accent : "rgba(232,228,218,0.22)" }}>{label}</button>
                ))}
              </div>
              <div style={{ display: "flex" }}>
                {[["L", "$/L"], ["gal", "$/gal"]].map(([k, label]) => (
                  <button key={k} className="seg" onClick={() => setFUnit(k)} style={{ opacity: fUnit === k ? 1 : 0.55, borderColor: fUnit === k ? "#E8E4DA" : "rgba(232,228,218,0.22)" }}>{label}</button>
                ))}
              </div>
              <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Filter by region" style={{ background: "#171E2E", color: "#E8E4DA", border: "1px solid rgba(232,228,218,0.22)", padding: "7px 10px", font: "600 12px 'Archivo'" }}>
                {REGIONS.map((r) => <option key={r}>{r}</option>)}
              </select>
              {searchBox}
              {tCountriesWithSub.length > 0 && (
                <button className="seg" onClick={() => setExpanded(tAllExpanded ? new Set() : new Set(tCountriesWithSub))}>{tAllExpanded ? "Collapse all" : "Expand all states"}</button>
              )}
              <button className="seg" onClick={() => setSortDesc(!sortDesc)} style={{ marginLeft: "auto" }}>{sortDesc ? "▼ High → low" : "▲ Low → high"}</button>
            </div>

            {tStats && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 1, background: "rgba(232,228,218,0.16)", border: "1px solid rgba(232,228,218,0.16)", marginBottom: 26 }}>
                {[["Countries shown", tStats.n], ["Average", `${fmtFuel(toU(tStats.avg))}/${fuLabel}`], ["Lowest", `${fmtFuel(toU(tStats.min))}/${fuLabel}`], ["Highest", `${fmtFuel(toU(tStats.max))}/${fuLabel}`]].map(([k, v]) => (
                  <div key={k} style={{ background: "#171E2E", padding: "12px 14px" }}>
                    <div style={{ font: "600 10px 'Archivo'", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(232,228,218,0.5)" }}>{k}</div>
                    <div style={{ font: "600 22px 'IBM Plex Mono'", color: accent, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 14, font: "400 10px 'IBM Plex Mono'", color: "rgba(232,228,218,0.45)", padding: "0 0 6px", borderBottom: "1px solid rgba(232,228,218,0.16)" }}>
              <span>COUNTRY</span><span>GLOBAL RANGE {fmtFuel(toU(tRailBounds.lo))}–{fmtFuel(toU(tRailBounds.hi))}</span><span>12-MO</span><span style={{ textAlign: "right" }}>USD/{fuLabel}</span>
            </div>

            {tRows.map((d, i) => {
              const subs = tSubRowsFor(d.geo);
              const isOpen = expanded.has(d.geo);
              const meta = FUEL_SUB_META[d.geo];
              return (
                <React.Fragment key={d.geo}>
                  <div className="row" style={{ display: "grid", gridTemplateColumns: GRID, gap: 14, alignItems: "center", padding: "10px 4px", borderBottom: "1px solid rgba(232,228,218,0.08)" }}>
                    <div>
                      <button className="cname" onClick={() => setDetail(d.geo)}>{d.geo}</button>
                      {subs.length > 0 ? (
                        <button className="exp" onClick={() => toggleExpand(d.geo)} aria-expanded={isOpen} style={{ color: accent, marginTop: 2, display: "block" }}>{isOpen ? "▾" : "▸"} {subs.length} {meta.unit}</button>
                      ) : (
                        <div style={{ font: "400 10px 'IBM Plex Mono'", color: "rgba(232,228,218,0.42)" }}>{d.region}</div>
                      )}
                    </div>
                    <Rail pct={tPos(d[tField])} aria={`${d.geo}: ${fmtFuel(d[tField])} per litre`} dim={false} />
                    <Spark seed={d.geo + tField} value={d[tField]} />
                    <div style={{ textAlign: "right" }}>
                      <div {...tipProps(fxTipFuel(d[tField], d.geo))} style={{ font: "600 15px 'IBM Plex Mono'", cursor: "help", color: i === 0 && sortDesc ? accent : "#E8E4DA", borderBottom: ccyOf(d.geo) !== "USD" ? "1px dotted rgba(232,228,218,0.3)" : "none", display: "inline-block" }}>{fmtFuel(toU(d[tField]))}<span style={{ fontSize: 10, color: "rgba(232,228,218,0.5)" }}>/{fuLabel}</span></div>
                      {d.geo === "United States" && <div style={{ font: "400 10px 'IBM Plex Mono'", color: accent }}>{fmtFuel(altU(d[tField]))}/{altLabel}</div>}
                      <div style={{ font: "400 9px 'IBM Plex Mono'", color: "rgba(232,228,218,0.42)" }}>{d.source} · {d.period}</div>
                    </div>
                  </div>
                  {isOpen && subs.map((s) => (
                    <div key={s.name} className="subrow" style={{ display: "grid", gridTemplateColumns: GRID, gap: 14, alignItems: "center", padding: "7px 4px", borderBottom: "1px solid rgba(232,228,218,0.05)", background: "rgba(232,228,218,0.018)" }}>
                      <div style={{ paddingLeft: 14, borderLeft: `2px solid ${accentDim}`, marginLeft: 2, fontWeight: 500, fontSize: 13, color: "rgba(232,228,218,0.85)" }}>{s.name}</div>
                      <Rail pct={tPos(s[tField])} aria={`${d.geo} — ${s.name}: ${fmtFuel(s[tField])} per litre`} dim={true} />
                      <Spark seed={d.geo + s.name + tField} value={s[tField]} w={50} h={16} />
                      <div style={{ textAlign: "right" }}>
                        <div {...tipProps(fxTipFuel(s[tField], d.geo))} style={{ font: "600 13px 'IBM Plex Mono'", cursor: "help", color: "rgba(232,228,218,0.85)", borderBottom: ccyOf(d.geo) !== "USD" ? "1px dotted rgba(232,228,218,0.25)" : "none", display: "inline-block" }}>{fmtFuel(toU(s[tField]))}<span style={{ fontSize: 9, color: "rgba(232,228,218,0.45)" }}>/{fuLabel}</span></div>
                        {d.geo === "United States" && <div style={{ font: "400 9px 'IBM Plex Mono'", color: "rgba(232,228,218,0.5)" }}>{fmtFuel(altU(s[tField]))}/{altLabel}</div>}
                        <div style={{ font: "400 9px 'IBM Plex Mono'", color: "rgba(232,228,218,0.38)" }}>{meta.source}</div>
                      </div>
                    </div>
                  ))}
                </React.Fragment>
              );
            })}
            {tRows.length === 0 && <p style={{ color: "rgba(232,228,218,0.5)", padding: "20px 4px", font: "400 13px 'Archivo'" }}>No countries match “{query}”.</p>}
          </>
        )}

        {/* COMMODITIES */}
        {view === "commodities" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 58px 92px 150px", gap: 14, font: "400 10px 'IBM Plex Mono'", color: "rgba(232,228,218,0.45)", padding: "0 0 6px", borderBottom: "1px solid rgba(232,228,218,0.16)" }}>
              <span>COMMODITY</span><span>12-MO</span><span style={{ textAlign: "right" }}>Δ</span><span style={{ textAlign: "right" }}>PRICE · SOURCE</span>
            </div>
            {COMMODITY_CATS.map((cat) => {
              const items = COMMODITIES.filter((c) => c.cat === cat.key);
              if (!items.length) return null;
              return (
                <div key={cat.key} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "18px 0 4px", paddingLeft: 8, borderLeft: `3px solid ${cat.accent}` }}>
                    <span style={{ font: "800 16px 'Saira Condensed'", letterSpacing: ".06em", textTransform: "uppercase", color: cat.accent }}>{cat.label}</span>
                    <span style={{ font: "400 10px 'IBM Plex Mono'", color: "rgba(232,228,218,0.42)" }}>{cat.cadence}</span>
                  </div>
                  {items.map((c) => (
                    <div key={c.name} className="row" style={{ display: "grid", gridTemplateColumns: "1fr 58px 92px 150px", gap: 14, alignItems: "center", padding: "10px 4px 10px 11px", borderBottom: "1px solid rgba(232,228,218,0.08)" }}>
                      <a href={`/commodity/${commoditySlug(c.name)}`} style={{ fontWeight: 600, fontSize: 14, color: "inherit", textDecoration: "none", borderBottom: "1px solid rgba(232,228,218,0.18)" }}>{c.name}</a>
                      <Spark seed={c.name} value={c.price} color={c.chg >= 0 ? UP : DOWN} />
                      <div style={{ textAlign: "right", font: "600 13px 'IBM Plex Mono'", color: c.chg >= 0 ? UP : DOWN }}>{c.chg >= 0 ? "▲" : "▼"} {c.chg >= 0 ? "+" : ""}{c.chg.toFixed(1)}%</div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ font: "600 15px 'IBM Plex Mono'" }}>${fmtCommodity(c.price)} <span style={{ fontSize: 10, color: "rgba(232,228,218,0.5)" }}>{c.unit}</span></div>
                        <div style={{ font: "400 9px 'IBM Plex Mono'", color: "rgba(232,228,218,0.42)" }}>{c.source} · {c.period}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        )}

        {/* MAP */}
        {view === "map" && (() => {
          const mapData = DATA.filter((d) => d.elecRes != null);
          const vals = mapData.map((d) => d.elecRes);
          const lo = Math.min(...vals), hi = Math.max(...vals);
          const sorted = [...mapData].sort((a, b) => b.elecRes - a.elecRes);
          return (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <span style={{ font: "400 11px 'IBM Plex Mono'", color: "rgba(232,228,218,0.5)" }}>Residential electricity, USD/kWh</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                  <span style={{ font: "400 10px 'IBM Plex Mono'", color: "rgba(232,228,218,0.5)" }}>{fmt(lo)}</span>
                  <div style={{ width: 120, height: 10, background: `linear-gradient(90deg, ${hexFromRamp(0)}, ${hexFromRamp(0.5)}, ${hexFromRamp(1)})` }} />
                  <span style={{ font: "400 10px 'IBM Plex Mono'", color: "rgba(232,228,218,0.5)" }}>{fmt(hi)}</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))", gap: 6 }}>
                {sorted.map((d) => {
                  const t = (d.elecRes - lo) / (hi - lo || 1);
                  return (
                    <button key={d.geo} className="tile" onClick={() => setDetail(d.geo)} style={{ background: hexFromRamp(t) }}>
                      <div style={{ font: "700 11px 'IBM Plex Mono'", letterSpacing: ".05em" }}>{d.code}</div>
                      <div style={{ font: "600 12px 'Archivo'", lineHeight: 1.15, margin: "2px 0 3px" }}>{d.geo}</div>
                      <div style={{ font: "700 13px 'IBM Plex Mono'" }}>{fmt(d.elecRes)}</div>
                    </button>
                  );
                })}
              </div>
              <p style={{ marginTop: 18, font: "400 11px 'Archivo'", color: "rgba(232,228,218,0.45)", maxWidth: 660, lineHeight: 1.6 }}>
                This prototype uses a colour-coded tile cartogram so it stays self-contained. In production this becomes a true geographic choropleth (d3-geo + world-atlas boundaries, plus a US-states layer) — a build-time asset, not a data change. Tiles are shaded by residential electricity; click any for the country's full profile.
              </p>
            </>
          );
        })()}

        {/* ── Explore: links to rankings, comparisons, tools (discovery + SEO) ── */}
        <section style={{ marginTop: 44, paddingTop: 24, borderTop: "1px solid rgba(232,228,218,0.16)" }}>
          <div style={{ font: "800 18px 'Saira Condensed'", letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 14 }}>Explore Voltlas</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "20px 28px" }}>
            {NAV_GROUPS.map(([group, links]) => (
              <div key={group}>
                <div style={{ font: "600 10px 'IBM Plex Mono'", letterSpacing: ".14em", textTransform: "uppercase", color: "rgba(232,228,218,0.5)", marginBottom: 8 }}>{group}</div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 7 }}>
                  {links.map(([href, label]) => (
                    <li key={href}><a href={href} className="navlink" style={{ color: "#F2A93B", textDecoration: "none", font: "500 13px 'Archivo'" }}>{label}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Country detail overlay (the per-country landing page) ── */}
      {detail && detailData && (
        <div onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, background: "rgba(8,11,18,0.72)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 16px", overflowY: "auto", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#1C2438", border: "1px solid rgba(232,228,218,0.18)", maxWidth: 620, width: "100%", padding: "26px 26px 30px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid rgba(232,228,218,0.14)", paddingBottom: 14, marginBottom: 16 }}>
              <div>
                <div style={{ font: "600 10px 'IBM Plex Mono'", letterSpacing: ".18em", color: "#F2A93B", textTransform: "uppercase" }}>{detailData.e ? detailData.e.region : ""} · {detailData.e ? detailData.e.code : ""}</div>
                <h2 style={{ font: "800 30px/1 'Saira Condensed'", margin: "4px 0 0", textTransform: "uppercase" }}>{detail}</h2>
              </div>
              <button onClick={() => setDetail(null)} aria-label="Close" style={{ background: "transparent", border: "1px solid rgba(232,228,218,0.3)", color: "#E8E4DA", cursor: "pointer", padding: "4px 10px", font: "600 14px 'Archivo'" }}>✕</button>
            </div>

            {detailData.metrics.map((m) => (
              <div key={m.key} style={{ display: "grid", gridTemplateColumns: "1fr 70px 110px", gap: 12, alignItems: "center", padding: "9px 0", borderBottom: "1px solid rgba(232,228,218,0.07)" }}>
                <div style={{ fontSize: 13, color: "rgba(232,228,218,0.88)" }}>{m.label}</div>
                <Spark seed={detail + m.key} value={m.v} w={64} h={20} color={m.big ? "#F2A93B" : "rgba(232,228,218,0.6)"} />
                <div style={{ textAlign: "right", font: "600 15px 'IBM Plex Mono'" }}>{(m.unit === "/L" || m.unit === "/gal") ? fmtFuel(m.v) : fmt(m.v)}<span style={{ fontSize: 9, color: "rgba(232,228,218,0.45)" }}>{m.unit}</span></div>
              </div>
            ))}

            {detailData.e && pppOf(detailData.e.elecRes, detail) != null && (
              <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(242,169,59,0.07)", border: "1px solid rgba(242,169,59,0.2)" }}>
                <div style={{ font: "600 10px 'Archivo'", letterSpacing: ".1em", textTransform: "uppercase", color: "#F2A93B" }}>Adjusted for purchasing power</div>
                <div style={{ fontSize: 13, color: "rgba(232,228,218,0.8)", marginTop: 4 }}>Household electricity at <strong>{fmt(pppOf(detailData.e.elecRes, detail))} international $/kWh</strong> (nominal {fmt(detailData.e.elecRes)}), using a price-level index of {PLI[detail]} vs US = 100. This reflects local affordability, not just the market exchange rate. <em>Illustrative.</em></div>
              </div>
            )}

            {SUBNATIONAL[detail] && (
              <div style={{ marginTop: 18 }}>
                <div style={{ font: "800 13px 'Saira Condensed'", letterSpacing: ".06em", textTransform: "uppercase", color: "rgba(232,228,218,0.7)", marginBottom: 6 }}>By {SUB_META[detail].unit} · household electricity</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "2px 16px" }}>
                  {SUBNATIONAL[detail].filter((s) => s.elecRes != null).map((s) => (
                    <div key={s.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "rgba(232,228,218,0.78)" }}>
                      <span>{s.name}</span><span style={{ fontFamily: "'IBM Plex Mono'" }}>{fmt(s.elecRes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 18, font: "400 11px 'Archivo'", color: "rgba(232,228,218,0.5)", lineHeight: 1.6 }}>
              Sources: {detailData.e ? `${detailData.e.source} (${SOURCE_CADENCE[detailData.e.source]})` : ""}{detailData.f ? `, ${detailData.f.source} for fuels` : ""}. All figures converted from local currency at {FX_DATE}.{detailData.e && detailData.e.note ? ` Note: ${detailData.e.note}.` : ""}
              <div style={{ marginTop: 6, opacity: 0.7 }}>In production this is a dedicated page at <code>/country/{detail.toLowerCase().replace(/ /g, "-")}</code> — the SEO landing page for "{detail} energy prices".</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Methodology / About overlay ── */}
      {showMethod && (
        <div onClick={() => setShowMethod(false)} style={{ position: "fixed", inset: 0, background: "rgba(8,11,18,0.72)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 16px", overflowY: "auto", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#1C2438", border: "1px solid rgba(232,228,218,0.18)", maxWidth: 640, width: "100%", padding: "26px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ font: "800 26px 'Saira Condensed'", margin: 0, textTransform: "uppercase" }}>Methodology</h2>
              <button onClick={() => setShowMethod(false)} aria-label="Close" style={{ background: "transparent", border: "1px solid rgba(232,228,218,0.3)", color: "#E8E4DA", cursor: "pointer", padding: "4px 10px", font: "600 14px 'Archivo'" }}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: "rgba(232,228,218,0.78)", lineHeight: 1.7 }}>
              <p style={{ marginTop: 0 }}><strong>Free sources only.</strong> Every figure comes from a source that permits public republication: the EIA (US electricity, natural gas and energy-commodity spot prices — public domain) and Eurostat (EU household and business electricity and gas), with EU road-fuel prices from the EC Weekly Oil Bulletin. More official sources are being wired in as coverage expands. No licensed feeds are displayed.</p>
              <p><strong>What each number is.</strong> Retail energy is taxes-included, stored in local currency and converted to USD at display time. Some figures aren't consumption-weighted averages — the US value is EIA's revenue-per-kWh proxy, and several European figures are regulated tariffs; these are flagged with ※.</p>
              <p><strong>Cadence &amp; freshness.</strong> US electricity refreshes monthly and energy-commodity spot prices daily (both EIA); Eurostat publishes semi-annually. The site re-runs every connector weekly and self-updates. Every figure carries its source and period.</p>
              <p><strong>Coverage gaps are shown, not filled.</strong> Coverage is strongest across Europe and North America. Where no free source exists, the country is absent rather than estimated. Sub-national drill-down appears only where a free source publishes it (US, all 50 states).</p>
              <p style={{ marginBottom: 0 }}><strong>Currency &amp; PPP.</strong> Tap or hover any price for the exact FX rate and date. Country profiles also show a purchasing-power-adjusted figure (illustrative), which reflects local affordability rather than the market exchange rate.</p>
            </div>
          </div>
        </div>
      )}
      {tip && (
        <div style={{ position: "fixed", left: Math.max(8, Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 400) - 248)), top: Math.min(tip.y + 16, (typeof window !== "undefined" ? window.innerHeight : 800) - 70), maxWidth: 232, zIndex: 9999, pointerEvents: "none", background: "#0F1421", color: "#E8E4DA", border: "1px solid rgba(232,228,218,0.22)", borderRadius: 8, padding: "8px 11px", font: "500 12px/1.5 'IBM Plex Mono', monospace", boxShadow: "0 8px 28px rgba(0,0,0,0.45)" }}>{tip.text}</div>
      )}
    </div>
  );
}
