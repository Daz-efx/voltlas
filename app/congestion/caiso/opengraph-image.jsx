// app/congestion/caiso/opengraph-image.jsx
// OG card for /congestion/caiso. Static design — deliberately does NOT
// fetch live data, so it renders instantly and never breaks on an OASIS hiccup.

import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'CAISO Congestion Monitor — live intertie shadow prices and transmission outages';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const C = {
  ink: '#0A0D10',
  panel: '#12171C',
  line: '#1E262C',
  text: '#E7ECEF',
  muted: '#7C8790',
  amber: '#FFB020',
  teal: '#2DD4BF',
  red: '#FF5A5F',
};

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: C.ink,
          padding: 60,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <div style={{ fontSize: 34, fontWeight: 700, color: C.text, letterSpacing: 1 }}>VOLTLAS</div>
            <div
              style={{
                fontSize: 18,
                color: C.muted,
                border: `1px solid ${C.line}`,
                padding: '4px 12px',
                borderRadius: 4,
                letterSpacing: 2,
              }}
            >
              CAISO
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: 12, background: C.teal }} />
            <div style={{ fontSize: 20, color: C.muted }}>LIVE · OASIS DATA</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 70 }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>
            Congestion Monitor
          </div>
          <div style={{ fontSize: 28, color: C.muted, marginTop: 18, lineHeight: 1.4 }}>
            Live constraint shadow prices, binding intertie limits,
          </div>
          <div style={{ fontSize: 28, color: C.muted, lineHeight: 1.4 }}>
            and transmission outage curtailments
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 56, gap: 12 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: C.panel,
              border: `1px solid ${C.line}`,
              borderLeft: `4px solid ${C.red}`,
              borderRadius: 6,
              padding: '14px 24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 12, height: 12, borderRadius: 12, background: C.red }} />
              <div style={{ fontSize: 24, color: C.text }}>AMR-SND 138 · RTM · binding</div>
            </div>
            <div style={{ fontSize: 26, color: C.red, fontWeight: 700 }}>$193.15/MWh</div>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: C.panel,
              border: `1px solid ${C.line}`,
              borderLeft: `4px solid ${C.amber}`,
              borderRadius: 6,
              padding: '14px 24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 12, height: 12, borderRadius: 12, background: C.amber }} />
              <div style={{ fontSize: 24, color: C.text }}>MALIN500 · DAM · binding</div>
            </div>
            <div style={{ fontSize: 26, color: C.amber, fontWeight: 700 }}>-$2.09/MWh</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
          <div style={{ fontSize: 20, color: C.muted }}>voltlas.com/congestion/caiso</div>
          <div style={{ fontSize: 20, color: C.muted }}>Free · No login · Official sources</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
