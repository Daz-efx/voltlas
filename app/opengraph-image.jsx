// app/opengraph-image.jsx — site-wide social preview card (1200x630).
// Next.js file convention: auto-injects og:image / twitter:image for the homepage
// and any page without a more specific opengraph-image.
import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Voltlas — global energy, fuel & commodity prices";

const C = { bg: "#171E2E", panel: "#1C2438", text: "#E8E4DA", dim: "rgba(232,228,218,0.62)", accent: "#F2A93B", teal: "#5BAE9B" };

export default function OgImage() {
  const tiles = ["#5BAE9B", "#7BB08A", "#A8B06E", "#D0A94F", "#F2A93B", "#E08A3C", "#C96A3D"];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.bg, padding: 72 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 22, height: 22, background: C.accent, borderRadius: 4 }} />
            <div style={{ fontSize: 44, fontWeight: 700, color: C.text, letterSpacing: 6 }}>VOLTLAS</div>
          </div>
          <div style={{ fontSize: 74, fontWeight: 700, color: C.text, lineHeight: 1.1, marginTop: 48, maxWidth: 980 }}>
            What the world pays for energy
          </div>
          <div style={{ fontSize: 32, color: C.dim, marginTop: 26, maxWidth: 900 }}>
            Electricity, fuels & commodities across 100+ countries — official sources only, updated weekly
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", gap: 10 }}>
            {tiles.map((c, i) => (
              <div key={i} style={{ width: 64, height: 34, background: c, borderRadius: 5, opacity: 0.92 }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 26, color: C.dim }}>free · no ads · open data</div>
            <div style={{ fontSize: 28, color: C.accent, fontWeight: 700 }}>voltlas.com</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
