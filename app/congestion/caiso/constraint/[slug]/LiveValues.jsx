'use client';

// app/congestion/caiso/constraint/[slug]/LiveValues.jsx
// Fetches the current snapshot client-side so per-constraint pages show live
// numbers even though the page shell is statically generated at deploy time.

import { useEffect, useState } from 'react';

const DATA_BASE = 'https://raw.githubusercontent.com/Daz-efx/voltlas/main/data/caiso';

const C = {
  panel: '#12171C', panel2: '#161C22', line: '#1E262C',
  text: '#E7ECEF', muted: '#7C8790', amber: '#FFB020', amberDim: '#5A4620',
  teal: '#2DD4BF', tealDim: '#1C4A45', red: '#FF5A5F',
};
const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace" };
const grotesk = { fontFamily: "'Space Grotesk', system-ui, sans-serif" };

function priceColor(price, binding) {
  if (!binding) return C.teal;
  return Math.abs(price ?? 0) > 50 ? C.red : C.amber;
}

export default function LiveValues({ constraintId, feed }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | missing | error

  useEffect(() => {
    let alive = true;
    const file = feed === 'internal' ? 'nomogram-current.json' : 'constraints-current.json';
    async function load() {
      try {
        const json = await fetch(`${DATA_BASE}/${file}`).then((r) => r.json());
        if (!alive) return;
        const entry = json?.constraints?.[constraintId];
        if (!entry) { setState('missing'); setData({ updated_at: json?.updated_at }); return; }
        setData({ ...entry, updated_at: json?.updated_at });
        setState('ok');
      } catch {
        if (alive) setState('error');
      }
    }
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [constraintId, feed]);

  const fmtTime = (ts) => (ts ? `${ts.replace('T', ' ').slice(0, 16)} UTC` : '');

  return (
    <section>
      <h2 style={{ ...grotesk, fontSize: 16, margin: '0 0 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span>Current shadow price</span>
        {data?.updated_at && (
          <span style={{ ...mono, fontSize: 10.5, color: C.muted, fontWeight: 400 }}>
            updated {fmtTime(data.updated_at)}
          </span>
        )}
      </h2>

      {state === 'loading' && (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 5, padding: 16, color: C.muted, fontSize: 13 }}>
          Loading live market data…
        </div>
      )}

      {state === 'error' && (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 5, padding: 16, color: C.muted, fontSize: 13 }}>
          Live data is temporarily unavailable. Historical figures below are unaffected.
        </div>
      )}

      {state === 'missing' && (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 5, padding: 16, color: C.muted, fontSize: 13 }}>
          This constraint is not in CAISO&apos;s current published set — it has not appeared in the
          latest market run. Historical figures below reflect when it was last active.
        </div>
      )}

      {state === 'ok' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {Object.entries(data.markets ?? {}).map(([mkt, row]) => (
            <div key={mkt} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 5, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 10.5, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{mkt} · now</span>
                <span style={{
                  fontSize: 9.5, padding: '2px 7px', borderRadius: 3, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  background: row.binding ? C.amberDim : C.tealDim,
                  color: row.binding ? C.amber : C.teal,
                }}>{row.binding ? 'Binding' : 'Not binding'}</span>
              </div>
              <div style={{ ...mono, fontSize: 24, fontWeight: 600, color: priceColor(row.shadow_price, row.binding) }}>
                ${row.shadow_price.toFixed(2)}
              </div>
              {row.peak && (
                <div style={{ ...mono, fontSize: 10.5, color: C.muted, marginTop: 5 }}>
                  today&apos;s peak ${row.peak.shadow_price.toFixed(2)}
                  {row.peak.interval_start ? ` @ ${row.peak.interval_start.slice(11, 16)}Z` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
