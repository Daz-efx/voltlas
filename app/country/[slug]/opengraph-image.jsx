// app/country/[slug]/opengraph-image.jsx — per-country social card with real prices.
// Reads latest.json at build/request time (nodejs runtime; do NOT set runtime="edge").
import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Country energy prices — Voltlas";

const C = { bg: "#171E2E", text: "#E8E4DA", dim: "rgba(232,228,218,0.62)", accent: "#F2A93B", teal: "#5BAE9B", line: "rgba(232,228,218,0.14)" };
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function load(slug) {
  try {
    const file = path.join(process.cwd(), "public", "data", "latest.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const e = (data.DATA || []).find((c) => slugify(c.geo) === slug) || null;
    const f = (data.FUEL_DATA || []).find((c) => slugify(c.geo) === slug) || null;
    return { e, f, geo: (e || f || {}).geo || null };
  } catch {
    return { e: null, f: null, geo: null };
  }
}

export default async function OgImage({ params }) {
  const { slug } = await params;
  const { e, f, geo } = load(slug);

  const rows = [];
  if (e && e.elecRes != null) rows.push(["Electricity (household)", `$${e.elecRes.toFixed(2)}/kWh`, C.accent]);
  if (e && e.gasRes != null) rows.push(["Natural gas (household)", `$${e.gasRes.toFixed(2)}/kWh`, C.teal]);
  if (f && f.petrol != null) rows.push(["Gasoline", `$${f.petrol.toFixed(2)}/L`, C.accent]);
  if (f && f.petrol != null && f.petrolNet != null)
    rows.push(["Tax in the pump price", `${Math.round(((f.petrol - f.petrolNet) / f.petrol) * 100)}%`, C.teal]);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.bg, padding: 64 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 18, height: 18, background: C.accent, borderRadius: 4 }} />
            <div style={{ fontSize: 32, fontWeight: 700, color: C.dim, letterSpacing: 5 }}>VOLTLAS</div>
          </div>
          <div style={{ fontSize: 78, fontWeight: 700, color: C.text, marginTop: 30, lineHeight: 1.05 }}>
            {geo ? `${geo} energy prices` : "Country energy prices"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {rows.slice(0, 4).map(([label, val, col], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${C.line}`, paddingTop: 16 }}>
              <div style={{ fontSize: 34, color: C.dim }}>{label}</div>
              <div style={{ fontSize: 44, fontWeight: 700, color: col }}>{val}</div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <div style={{ fontSize: 24, color: C.dim }}>official sources · updated weekly</div>
            <div style={{ fontSize: 26, color: C.accent, fontWeight: 700 }}>voltlas.com</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
