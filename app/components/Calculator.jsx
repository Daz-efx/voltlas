"use client";
import { useState, useEffect, useMemo } from "react";

const C = { bg: "#171E2E", panel: "#1C2438", text: "#E8E4DA", dim: "rgba(232,228,218,0.6)", accent: "#F2A93B", green: "#6FCF97", line: "rgba(232,228,218,0.14)" };
const usd2 = (v) => `$${v.toFixed(2)}`;
const usd0 = (v) => `$${Math.round(v).toLocaleString()}`;
const PRESETS = [
  { label: "Small home", kwh: 300 },
  { label: "Average", kwh: 900 },
  { label: "Large home", kwh: 1500 },
];

export default function Calculator({ countries }) {
  const [country, setCountry] = useState("United States");
  const [kwh, setKwh] = useState(900);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("country");
      if (q) { const m = countries.find((c) => c.slug === q); if (m) setCountry(m.geo); }
    } catch (e) {}
  }, [countries]);

  const sel = countries.find((c) => c.geo === country) || countries[0];
  const monthly = sel ? kwh * sel.elecRes : 0;
  const annual = monthly * 12;
  const local = sel && sel.ccy !== "USD" && sel.fxUsd ? { v: monthly / sel.fxUsd, sym: sel.fxSym } : null;

  const ranked = useMemo(
    () => countries.map((c) => ({ ...c, cost: kwh * c.elecRes })).sort((a, b) => a.cost - b.cost),
    [countries, kwh]
  );
  const cheapest = ranked[0], priciest = ranked[ranked.length - 1];

  const field = { background: C.bg, color: C.text, border: `1px solid ${C.line}`, padding: "10px 12px", font: "500 15px 'Archivo',sans-serif", borderRadius: 0 };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>
        <label style={{ display: "block" }}>
          <span style={{ font: "600 10px 'Archivo'", letterSpacing: ".1em", textTransform: "uppercase", color: C.dim }}>Country</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)} style={{ ...field, width: "100%", marginTop: 6 }}>
            {countries.slice().sort((a, b) => a.geo.localeCompare(b.geo)).map((c) => <option key={c.geo} value={c.geo}>{c.geo}</option>)}
          </select>
        </label>
        <label style={{ display: "block" }}>
          <span style={{ font: "600 10px 'Archivo'", letterSpacing: ".1em", textTransform: "uppercase", color: C.dim }}>Monthly usage (kWh)</span>
          <input type="number" min={0} value={kwh} onChange={(e) => setKwh(Math.max(0, Number(e.target.value) || 0))} style={{ ...field, width: "100%", marginTop: 6, fontFamily: "'IBM Plex Mono',monospace" }} />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => setKwh(p.kwh)} style={{ background: kwh === p.kwh ? C.accent : "transparent", color: kwh === p.kwh ? C.bg : C.dim, border: `1px solid ${kwh === p.kwh ? C.accent : C.line}`, padding: "6px 12px", font: "600 12px 'Archivo'", cursor: "pointer" }}>
            {p.label} · {p.kwh}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 22, padding: "22px 24px", background: C.panel, border: `1px solid ${C.line}` }}>
        <div style={{ font: "600 10px 'Archivo'", letterSpacing: ".12em", textTransform: "uppercase", color: C.dim }}>Estimated electricity bill · {sel?.geo}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 8, flexWrap: "wrap" }}>
          <div style={{ font: "700 46px 'IBM Plex Mono',monospace", color: C.accent, lineHeight: 1 }}>{usd2(monthly)}<span style={{ fontSize: 16, color: C.dim }}> /mo</span></div>
          <div style={{ font: "600 22px 'IBM Plex Mono',monospace", color: C.text }}>{usd0(annual)}<span style={{ fontSize: 13, color: C.dim }}> /yr</span></div>
        </div>
        {local && <div style={{ font: "400 13px 'IBM Plex Mono',monospace", color: C.dim, marginTop: 8 }}>≈ {local.sym}{local.v.toFixed(2)}/mo in local currency · at {usd2(sel.elecRes).replace("$", "$")}/kWh, taxes included</div>}
        {!local && <div style={{ font: "400 13px 'IBM Plex Mono',monospace", color: C.dim, marginTop: 8 }}>at {usd2(sel.elecRes)}/kWh, taxes included</div>}
      </div>

      <div style={{ marginTop: 22 }}>
        <h2 style={{ font: "800 20px 'Saira Condensed',sans-serif", textTransform: "uppercase", letterSpacing: ".04em" }}>The same {kwh.toLocaleString()} kWh around the world</h2>
        <p style={{ fontSize: 13, color: C.dim, margin: "6px 0 12px" }}>
          Cheapest: <strong style={{ color: C.green }}>{cheapest?.geo} {usd2(cheapest?.cost)}</strong> · most expensive: <strong style={{ color: C.accent }}>{priciest?.geo} {usd2(priciest?.cost)}</strong>.
        </p>
        <ol style={{ listStyle: "none", padding: 0, margin: 0, border: `1px solid ${C.line}`, maxHeight: 360, overflowY: "auto" }}>
          {ranked.map((c, i) => (
            <li key={c.geo} style={{ display: "grid", gridTemplateColumns: "36px 1fr auto", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: i === ranked.length - 1 ? "none" : `1px solid ${C.line}`, background: c.geo === country ? "rgba(242,169,59,0.10)" : i % 2 ? "transparent" : "rgba(255,255,255,0.015)" }}>
              <span style={{ font: "700 13px 'IBM Plex Mono'", color: C.dim }}>{i + 1}</span>
              <a href={`/country/${c.slug}`} style={{ fontSize: 14, fontWeight: c.geo === country ? 700 : 600, color: c.geo === country ? C.accent : C.text, textDecoration: "none" }}>{c.geo}</a>
              <span style={{ font: "600 14px 'IBM Plex Mono'", color: c.geo === country ? C.accent : C.text }}>{usd2(c.cost)}<span style={{ fontSize: 10, color: C.dim }}>/mo</span></span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
