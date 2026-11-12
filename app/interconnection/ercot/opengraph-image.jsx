// app/interconnection/ercot/opengraph-image.jsx
// OG card for /interconnection/ercot. Matches the CAISO card's layout. Rendered
// at build time (Node runtime) from public/data/queue/projects_ercot.json, so
// the fuel totals are the real active-queue figures as of the last deploy.

import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'ERCOT interconnection queue by county — Texas storage, solar, wind and gas requests';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const C = {
  ink: '#0A0D10', panel: '#12171C', line: '#1E262C', text: '#E7ECEF',
  muted: '#7C8790', amber: '#FFB020', teal: '#2DD4BF', red: '#FF5A5F',
};
const FUEL_COLOR = { Storage: '#2DD4BF', Solar: '#FFB020', Wind: '#7AA2F7', Gas: '#FF5A5F', Other: '#7C8790' };

function fuelOf(genType = '') {
  const t = genType.toLowerCase();
  if (t.includes('battery') || t.includes('storage')) return 'Storage';
  if (t.startsWith('solar')) return 'Solar';
  if (t.startsWith('wind')) return 'Wind';
  if (t.startsWith('gas')) return 'Gas';
  return 'Other';
}

function fuelTotals() {
  try {
    const p = path.join(process.cwd(), 'public', 'data', 'queue', 'projects_ercot.json');
    const projects = JSON.parse(fs.readFileSync(p, 'utf8'));
    const t = {};
    let total = 0;
    for (const pr of projects) {
      if (pr.bucket !== 'active') continue;
      const f = fuelOf(pr.gen_type);
      t[f] = (t[f] ?? 0) + pr.mw;
      total += pr.mw;
    }
    const top = Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 2);
    return { top, total };
  } catch {
    return { top: [], total: 0 };
  }
}

const gw = (mw) => `${(mw / 1000).toFixed(1)} GW`;

function Row({ fuel, mw, total }) {
  const color = FUEL_COLOR[fuel] ?? C.muted;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.panel, border: `1px solid ${C.line}`, borderLeft: `4px solid ${color}`, borderRadius: 6, padding: '14px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 12, height: 12, borderRadius: 12, background: color }} />
        <div style={{ fontSize: 24, color: C.text }}>
          {`${fuel} · ${Math.round((100 * mw) / total)}% of active requests`}
        </div>
      </div>
      <div style={{ fontSize: 26, color, fontWeight: 700 }}>{gw(mw)}</div>
    </div>
  );
}

export default function OgImage() {
  const { top, total } = fuelTotals();
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: C.ink, padding: 60, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <div style={{ fontSize: 34, fontWeight: 700, color: C.text, letterSpacing: 1 }}>VOLTLAS</div>
            <div style={{ fontSize: 18, color: C.muted, border: `1px solid ${C.line}`, padding: '4px 12px', borderRadius: 4, letterSpacing: 2 }}>ERCOT</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: 12, background: C.teal }} />
            <div style={{ fontSize: 20, color: C.muted }}>WEEKLY · ERCOT GIS REPORT</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 48 }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>Interconnection Queue</div>
          <div style={{ fontSize: 28, color: C.muted, marginTop: 18, lineHeight: 1.4 }}>Where new generation wants to connect to the Texas grid,</div>
          <div style={{ fontSize: 28, color: C.muted, lineHeight: 1.4 }}>by county and fuel</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40, gap: 12 }}>
          {top.map(([fuel, mw]) => <Row key={fuel} fuel={fuel} mw={mw} total={total} />)}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
          <div style={{ fontSize: 20, color: C.muted }}>voltlas.com/interconnection/ercot</div>
          <div style={{ fontSize: 20, color: C.muted }}>Free · No login · Official sources</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
