// app/country/[slug]/FuelHistoryChart.jsx
"use client";
import { useState, useRef } from "react";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Handles weekly ISO dates (YYYY-MM-DD) and monthly codes (YYYYMmm).
const fmtCode = (code) => {
  const s = String(code);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}`;
  m = /^(\d{4})M(\d{2})$/.exec(s);
  if (m) return `${MON[+m[2] - 1]} ${m[1]}`;
  return s;
};
const fmtNum = (v) => Number(v).toLocaleString("en-US", { minimumFractionDigits: Math.abs(v) < 100 ? 2 : 0, maximumFractionDigits: 2 });
const C = { text: "#E8E4DA", dim: "rgba(232,228,218,0.62)", faint: "rgba(232,228,218,0.40)", accent: "#F2A93B", panel: "#1C2438", line: "rgba(232,228,218,0.14)", bg: "#171E2E" };

export default function FuelHistoryChart({ points, color = C.accent }) {
  const [hi, setHi] = useState(null);
  const ref = useRef(null);

  const W = 760, Hh = 230, padL = 6, padR = 6, padT = 18, padB = 24;
  const n = points.length;
  const vals = points.map((p) => p[1]);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const X = (i) => padL + (i / (n - 1)) * (W - padL - padR);
  const Y = (v) => padT + (1 - (v - min) / span) * (Hh - padT - padB);
  const line = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(" ");
  const area = `${line} L${X(n - 1).toFixed(1)} ${(Hh - padB).toFixed(1)} L${X(0).toFixed(1)} ${(Hh - padB).toFixed(1)} Z`;
  const maxI = vals.indexOf(max), minI = vals.indexOf(min), lastI = n - 1;

  const years = points.map((p) => parseInt(String(p[0]).slice(0, 4), 10));
  const firstByYear = {};
  years.forEach((y, i) => { if (firstByYear[y] === undefined) firstByYear[y] = i; });
  const uniq = Object.keys(firstByYear).map(Number).sort((a, b) => a - b);
  const step = Math.max(1, Math.ceil(uniq.length / 7));
  const ticks = [];
  for (let k = 0; k < uniq.length; k += step) ticks.push({ i: firstByYear[uniq[k]], label: String(uniq[k]) });

  const onMove = (clientX) => {
    const rect = ref.current && ref.current.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    setHi(Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))));
  };

  let tip = null;
  if (hi != null) {
    const px = X(hi), py = Y(points[hi][1]);
    const tw = 132, th = 40;
    const tx = Math.min(W - tw - 2, Math.max(2, px - tw / 2));
    const ty = py - th - 12 < padT ? py + 12 : py - th - 12;
    tip = { px, py, tx, ty, tw, th, label: fmtCode(points[hi][0]), val: fmtNum(points[hi][1]) };
  }

  return (
    <div
      ref={ref}
      style={{ position: "relative", touchAction: "pan-y", cursor: "crosshair" }}
      onMouseMove={(e) => onMove(e.clientX)}
      onMouseLeave={() => setHi(null)}
      onTouchStart={(e) => onMove(e.touches[0].clientX)}
      onTouchMove={(e) => onMove(e.touches[0].clientX)}
      onTouchEnd={() => setHi(null)}
    >
      <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" style={{ display: "block" }} role="img" aria-label="Fuel price history chart — hover or drag to read values">
        <line x1={padL} y1={Hh - padB} x2={W - padR} y2={Hh - padB} stroke={C.line} strokeWidth="1" />
        {ticks.map((t) => (
          <g key={t.i}>
            <line x1={X(t.i)} y1={padT} x2={X(t.i)} y2={Hh - padB} stroke={C.line} strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
            <text x={X(t.i)} y={Hh - padB + 15} fill={C.faint} fontSize="11" fontFamily="'IBM Plex Mono',monospace" textAnchor="middle">{t.label}</text>
          </g>
        ))}
        <path d={area} fill={color} opacity="0.10" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {hi == null && (
          <g>
            <circle cx={X(maxI)} cy={Y(max)} r="3" fill={C.text} />
            <text x={Math.min(W - 40, Math.max(28, X(maxI)))} y={Y(max) - 7} fill={C.dim} fontSize="10.5" fontFamily="'IBM Plex Mono',monospace" textAnchor="middle">{fmtNum(max)}</text>
            <circle cx={X(minI)} cy={Y(min)} r="3" fill={C.text} />
            <text x={Math.min(W - 40, Math.max(28, X(minI)))} y={Y(min) + 15} fill={C.dim} fontSize="10.5" fontFamily="'IBM Plex Mono',monospace" textAnchor="middle">{fmtNum(min)}</text>
            <circle cx={X(lastI)} cy={Y(points[lastI][1])} r="3.5" fill={color} />
          </g>
        )}

        {tip && (
          <g>
            <line x1={tip.px} y1={padT} x2={tip.px} y2={Hh - padB} stroke={color} strokeWidth="1" opacity="0.55" />
            <circle cx={tip.px} cy={tip.py} r="4.5" fill={color} stroke={C.bg} strokeWidth="1.5" />
            <rect x={tip.tx} y={tip.ty} width={tip.tw} height={tip.th} rx="6" fill={C.panel} stroke={C.line} />
            <text x={tip.tx + tip.tw / 2} y={tip.ty + 16} fill={C.faint} fontSize="11" fontFamily="'IBM Plex Mono',monospace" textAnchor="middle">{tip.label}</text>
            <text x={tip.tx + tip.tw / 2} y={tip.ty + 32} fill={C.text} fontSize="15" fontWeight="700" fontFamily="'Saira Condensed',sans-serif" textAnchor="middle">${tip.val}/L</text>
          </g>
        )}
      </svg>
    </div>
  );
}
