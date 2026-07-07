// app/commodity/[slug]/opengraph-image.jsx — per-commodity social card with live price.
import { ImageResponse } from "next/og";
import fs from "node:fs";
import path from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Commodity price — Voltlas";

const C = { bg: "#171E2E", text: "#E8E4DA", dim: "rgba(232,228,218,0.62)", accent: "#F2A93B", green: "#7BB08A", red: "#C96A3D", line: "rgba(232,228,218,0.14)" };
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function load(slug) {
  try {
    const file = path.join(process.cwd(), "public", "data", "latest.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return (data.COMMODITIES || []).find((c) => slugify(c.name) === slug) || null;
  } catch {
    return null;
  }
}

export default async function OgImage({ params }) {
  const { slug } = await params;
  const row = load(slug);
  const price = row && row.price != null ? `$${Number(row.price).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : null;
  const chg = row && row.chg != null ? Number(row.chg) : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.bg, padding: 64 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 18, height: 18, background: C.accent, borderRadius: 4 }} />
            <div style={{ fontSize: 32, fontWeight: 700, color: C.dim, letterSpacing: 5 }}>VOLTLAS</div>
          </div>
          <div style={{ fontSize: 82, fontWeight: 700, color: C.text, marginTop: 34, lineHeight: 1.05 }}>
            {row ? `${row.name} price` : "Commodity price"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {price && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 24, borderTop: `2px solid ${C.line}`, paddingTop: 24 }}>
              <div style={{ fontSize: 96, fontWeight: 700, color: C.accent, lineHeight: 1 }}>{price}</div>
              {row.unit && <div style={{ fontSize: 36, color: C.dim, paddingBottom: 8 }}>per {String(row.unit).replace(/^\//, "")}</div>}
              {chg != null && (
                <div style={{ fontSize: 38, fontWeight: 700, color: chg >= 0 ? C.green : C.red, paddingBottom: 6 }}>
                  {`${chg >= 0 ? "▲" : "▼"} ${Math.abs(chg).toFixed(1)}% m/m`}
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontSize: 24, color: C.dim }}>{row && row.source ? `source: ${row.source} · 25-yr history on the site` : "official sources · updated weekly"}</div>
            <div style={{ fontSize: 26, color: C.accent, fontWeight: 700 }}>voltlas.com</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
