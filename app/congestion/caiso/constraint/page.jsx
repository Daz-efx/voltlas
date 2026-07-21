// app/congestion/caiso/constraint/page.jsx
// Index of every tracked constraint. Exists so crawlers (and people) have a
// single path to all per-constraint pages, rather than relying on the
// dashboard's client-rendered list.

import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';

const SITE = 'https://voltlas.com';

const C = {
  ink: '#0A0D10', panel: '#12171C', panel2: '#161C22', line: '#1E262C',
  text: '#E7ECEF', muted: '#7C8790', amber: '#FFB020', teal: '#2DD4BF', red: '#FF5A5F',
};
const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace" };
const grotesk = { fontFamily: "'Space Grotesk', system-ui, sans-serif" };

function readRegistry() {
  try {
    const p = path.join(process.cwd(), 'data', 'caiso', 'constraint-registry.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { constraints: {}, counts: {} };
  }
}

export const metadata = {
  title: 'CAISO Transmission Constraints — Shadow Price Index | Voltlas',
  description:
    'Every CAISO congestion constraint tracked by Voltlas: internal transmission lines, transformers, nomograms, and intertie scheduling limits, with peak shadow prices and binding history.',
  alternates: { canonical: `${SITE}/congestion/caiso/constraint` },
};

function Section({ title, note, items }) {
  if (!items.length) return null;
  return (
    <>
      <h2 style={{ ...grotesk, fontSize: 16, margin: '28px 0 6px' }}>{title}</h2>
      {note && <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{note}</div>}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden' }}>
        {items.map((c, i) => (
          <Link key={c.slug} href={`/congestion/caiso/constraint/${c.slug}`} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
              background: i % 2 ? C.panel2 : C.panel,
              borderBottom: i === items.length - 1 ? 'none' : `1px solid ${C.line}`,
            }}>
              <span style={{ flex: 1, fontSize: 13, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </span>
              <span style={{ ...mono, fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>
                {c.stats?.binding_intervals ?? 0} binding
              </span>
              <span style={{
                ...mono, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 90, textAlign: 'right',
                color: Math.abs(c.stats?.peak_signed ?? 0) > 50 ? C.red : C.amber,
              }}>
                ${(c.stats?.peak_signed ?? 0).toFixed(2)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function ConstraintIndex() {
  const reg = readRegistry();
  const all = Object.values(reg.constraints ?? {});
  const byPeak = (a, b) => (b.stats?.alltime_peak_abs ?? 0) - (a.stats?.alltime_peak_abs ?? 0);

  const internal = all.filter((c) => c.feed === 'internal').sort(byPeak);
  const intertie = all.filter((c) => c.feed === 'intertie').sort(byPeak);

  return (
    <div style={{ background: C.ink, color: C.text, minHeight: '100vh', padding: 24, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        <nav style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
          <Link href="/congestion/caiso" style={{ color: C.muted, textDecoration: 'none' }}>Congestion Monitor</Link>
          {' / '}<span style={{ color: C.text }}>Constraints</span>
        </nav>

        <h1 style={{ ...grotesk, fontSize: 26, margin: '0 0 10px' }}>CAISO transmission constraints</h1>
        <p style={{ fontSize: 15, lineHeight: 1.7, color: C.muted, maxWidth: 760, margin: '0 0 4px' }}>
          Every congestion constraint Voltlas has observed in the CAISO market, ranked by the
          largest shadow price recorded. Internal constraints are lines, transformers, and
          operating nomograms inside the CAISO footprint; interties are the scheduling limits on
          paths to neighbouring grids. Each page shows live day-ahead and real-time values
          alongside observed binding history.
        </p>
        <div style={{ ...mono, fontSize: 11, color: C.muted, marginBottom: 4 }}>
          {reg.counts?.total ?? all.length} constraints tracked
          {reg.generated_at ? ` · registry updated ${reg.generated_at.slice(0, 10)}` : ''}
        </div>

        <Section
          title="Internal grid constraints"
          note="Transmission lines, transformers, operating nomograms, and outage-driven limits inside CAISO."
          items={internal}
        />
        <Section
          title="Intertie scheduling constraints"
          note="Limits on the paths connecting CAISO to neighbouring balancing authorities."
          items={intertie}
        />

        <div style={{ marginTop: 32, paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: 12 }}>
          <Link href="/congestion/caiso" style={{ color: C.teal, textDecoration: 'none' }}>
            ← Back to the CAISO Congestion Monitor
          </Link>
        </div>
      </div>
    </div>
  );
}
