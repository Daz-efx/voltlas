// app/congestion/ercot/opengraph-image.jsx
// OG card for /congestion/ercot. Matches the CAISO card's layout. Rendered at
// build time (Node runtime) from public/data/queue/ercot_county_basis.json, so
// the two sample rows are the real top counties as of the last deploy.

import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'ERCOT congestion by county — where Texas power is export-constrained';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const C = {
  ink: '#0A0D10', panel: '#12171C', line: '#1E262C', text: '#E7ECEF',
  muted: '#7C8790', amber: '#FFB020', teal: '#2DD4BF', red: '#FF5A5F',
};

function topCounties() {
  try {
    const p = path.join(process.cwd(), 'public', 'data', 'queue', 'ercot_county_basis.json');
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    return (d.counties ?? [])
      .filter((c) => c.n_nodes >= 3 && c.share_hours_below_neg5 != null)
      .sort((a, b) => b.share_hours_below_neg5 - a.share_hours_below_neg5)
      .slice(0, 2);
  } catch {
    return [];
  }
}

const usd = (x) => `${x >= 0 ? '+' : '-'}$${Math.abs(x).toFixed(2)}/MWh`;

function Row({ c, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.panel, border: `1px solid ${C.line}`, borderLeft: `4px solid ${color}`, borderRadius: 6, padding: '14px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 12, height: 12, borderRadius: 12, background: color }} />
        <div style={{ fontSize: 24, color: C.text }}>
          {`${c.county} County · ${Math.round(c.share_hours_below_neg5 * 100)}% of hours below -$5`}
        </div>
      </div>
      <div style={{ fontSize: 26, color, fontWeight: 700 }}>{usd(c.county_median_hourly)}</div>
    </div>
  );
}

export default function OgImage() {
  const rows = topCounties();
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
            <div style={{ fontSize: 20, color: C.muted }}>WEEKLY · ERCOT MARKET DATA</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 48 }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>Congestion by County</div>
          <div style={{ fontSize: 28, color: C.muted, marginTop: 18, lineHeight: 1.4 }}>Where Texas generation is stuck behind the grid:</div>
          <div style={{ fontSize: 28, color: C.muted, lineHeight: 1.4 }}>day-ahead nodal price basis versus the hub</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 40, gap: 12 }}>
          {rows[0] ? <Row c={rows[0]} color={C.teal} /> : null}
          {rows[1] ? <Row c={rows[1]} color={C.amber} /> : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
          <div style={{ fontSize: 20, color: C.muted }}>voltlas.com/congestion/ercot</div>
          <div style={{ fontSize: 20, color: C.muted }}>Free · No login · Official sources</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
