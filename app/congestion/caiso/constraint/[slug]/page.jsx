// app/congestion/caiso/constraint/[slug]/page.jsx
// Per-constraint page, generated from data/caiso/constraint-registry.json.
//
// BUILD-TIME vs RUNTIME:
//   - The SET of pages is fixed at build time (generateStaticParams reads the
//     registry from disk). A newly-observed constraint gets a page on the next
//     code deploy, not the next pipeline run. That's deliberate: making the
//     registry trigger deploys would put us back at ~96 builds/day.
//   - The NUMBERS are live: <LiveValues> fetches current JSON client-side,
//     same source as the dashboard.

import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import LiveValues from './LiveValues';

const SITE = 'https://voltlas.com';

const C = {
  ink: '#0A0D10', panel: '#12171C', panel2: '#161C22', line: '#1E262C',
  text: '#E7ECEF', muted: '#7C8790', amber: '#FFB020', amberDim: '#5A4620',
  teal: '#2DD4BF', tealDim: '#1C4A45', red: '#FF5A5F',
};
const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace" };
const grotesk = { fontFamily: "'Space Grotesk', system-ui, sans-serif" };

const CLASS_LABEL = {
  branch: 'Transmission line',
  transformer: 'Transformer',
  nomogram: 'Operating nomogram',
  outage: 'Outage-driven constraint',
  intertie: 'Intertie scheduling constraint',
};

function readRegistry() {
  try {
    const p = path.join(process.cwd(), 'data', 'caiso', 'constraint-registry.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { constraints: {} };
  }
}

export function generateStaticParams() {
  const reg = readRegistry();
  return Object.keys(reg.constraints ?? {}).map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const reg = readRegistry();
  const c = reg.constraints?.[slug];
  if (!c) return { title: 'Constraint not found | Voltlas' };

  const kind = CLASS_LABEL[c.class] ?? 'Constraint';
  const desc =
    `Live CAISO shadow prices and congestion history for ${c.name} — ` +
    `${kind.toLowerCase()}${c.kv ? ` at ${c.kv} kV` : ''}. ` +
    `Peak observed $${Math.abs(c.stats?.peak_signed ?? 0).toFixed(2)}/MWh across ` +
    `${c.stats?.binding_intervals ?? 0} binding intervals. Day-ahead and real-time, from CAISO OASIS.`;

  return {
    title: `${c.name} — CAISO Congestion & Shadow Prices | Voltlas`,
    description: desc,
    alternates: { canonical: `${SITE}/congestion/caiso/constraint/${slug}` },
    openGraph: {
      title: `${c.name} — CAISO shadow prices`,
      description: desc,
      url: `${SITE}/congestion/caiso/constraint/${slug}`,
      siteName: 'Voltlas',
      type: 'website',
    },
  };
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 5, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{label}</div>
      <div style={{ ...mono, fontSize: 19, fontWeight: 600, color: C.text }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default async function ConstraintPage({ params }) {
  const { slug } = await params;
  const reg = readRegistry();
  const c = reg.constraints?.[slug];

  if (!c) {
    return (
      <div style={{ background: C.ink, color: C.text, minHeight: '100vh', padding: 40 }}>
        <p>Constraint not found.</p>
        <Link href="/congestion/caiso" style={{ color: C.teal }}>Back to the congestion monitor</Link>
      </div>
    );
  }

  const s = c.stats ?? {};
  const kind = CLASS_LABEL[c.class] ?? 'Constraint';
  const peakSign = (s.peak_signed ?? 0) < 0 ? '−' : '';
  const peakAbs = Math.abs(s.peak_signed ?? 0).toFixed(2);
  const seenDays = c.first_seen
    ? Math.max(1, Math.round((new Date(c.last_seen) - new Date(c.first_seen)) / 86400_000))
    : null;

  // Related constraints: same feed, nearest voltage, excluding self
  const related = Object.values(reg.constraints ?? {})
    .filter((o) => o.slug !== c.slug && o.feed === c.feed)
    .sort((a, b) => {
      if (c.kv && a.kv && b.kv) return Math.abs(a.kv - c.kv) - Math.abs(b.kv - c.kv);
      return (b.stats?.alltime_peak_abs ?? 0) - (a.stats?.alltime_peak_abs ?? 0);
    })
    .slice(0, 6);

  return (
    <div style={{ background: C.ink, color: C.text, minHeight: '100vh', padding: 24, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        <nav style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
          <Link href="/congestion/caiso" style={{ color: C.muted, textDecoration: 'none' }}>Congestion Monitor</Link>
          {' / '}
          <Link href="/congestion/caiso/constraint" style={{ color: C.muted, textDecoration: 'none' }}>Constraints</Link>
          {' / '}
          <span style={{ color: C.text }}>{c.name}</span>
        </nav>

        <header style={{ paddingBottom: 18, marginBottom: 20, borderBottom: `1px solid ${C.line}` }}>
          <h1 style={{ ...grotesk, fontSize: 26, margin: '0 0 10px', lineHeight: 1.25 }}>{c.name}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 3, background: C.panel2, border: `1px solid ${C.line}`, color: C.muted }}>
              {kind}{c.kv ? ` · ${c.kv} kV` : ''}
            </span>
            <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 3, background: C.panel2, border: `1px solid ${C.line}`, color: C.muted }}>
              {c.feed === 'internal' ? 'Internal grid' : 'Intertie'}
            </span>
            {(c.markets ?? []).map((m) => (
              <span key={m} style={{ ...mono, fontSize: 11, padding: '3px 9px', borderRadius: 3, background: C.panel2, border: `1px solid ${C.line}`, color: C.muted }}>{m}</span>
            ))}
          </div>
          <div style={{ ...mono, fontSize: 10.5, color: C.muted, marginTop: 10, wordBreak: 'break-all' }}>
            CAISO ID: {c.constraint_id}
          </div>
        </header>

        {/* Live values (client-fetched) */}
        <LiveValues slug={c.slug} constraintId={c.constraint_id} feed={c.feed} />

        {/* Observed statistics */}
        <h2 style={{ ...grotesk, fontSize: 16, margin: '28px 0 12px' }}>Observed congestion</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          <Stat
            label="Peak shadow price"
            value={`${peakSign}$${peakAbs}`}
            sub={s.peak_at ? `on ${s.peak_at.slice(0, 10)} at ${s.peak_at.slice(11, 16)} UTC` : 'per MWh'}
          />
          <Stat
            label="Binding intervals"
            value={s.binding_intervals ?? 0}
            sub={
              s.binding_pct != null
                ? `${s.binding_pct}% of intervals recorded`
                : 'recorded in retained history'
            }
          />
          <Stat
            label="Tracked since"
            value={c.first_seen ? c.first_seen.slice(0, 10) : '—'}
            sub={seenDays ? `${seenDays} day${seenDays === 1 ? '' : 's'} of observation` : null}
          />
        </div>

        {/* Generated prose — this is what search engines read */}
        <h2 style={{ ...grotesk, fontSize: 16, margin: '28px 0 12px' }}>About this constraint</h2>
        <div style={{ fontSize: 15, lineHeight: 1.75, color: C.muted, maxWidth: 760 }}>
          <p style={{ margin: '0 0 14px' }}>
            <span style={{ color: C.text }}>{c.name}</span> is {kind === 'Transmission line' ? 'a transmission line' : `an ${kind.toLowerCase()}`}
            {c.kv ? ` operating at ${c.kv} kV` : ''} that appears as a congestion constraint in the
            California ISO market. When power flow reaches this element&apos;s operating limit, CAISO&apos;s
            market optimization assigns it a shadow price — the cost to the system of that limit
            binding — which in turn drives locational price separation around it.
          </p>
          <p style={{ margin: '0 0 14px' }}>
            {s.binding_intervals > 0 ? (
              <>
                Across the market intervals retained in this dataset, it has bound{' '}
                <span style={{ color: C.text }}>{s.binding_intervals} time{s.binding_intervals === 1 ? '' : 's'}</span>,
                with the largest shadow price observed at{' '}
                <span style={{ color: C.text }}>{peakSign}${peakAbs}/MWh</span>
                {s.peak_at ? ` on ${s.peak_at.slice(0, 10)}` : ''}.
                {' '}Prices are shown with the sign CAISO publishes; magnitude is the severity signal.
              </>
            ) : (
              <>
                It has not registered a binding interval in the currently retained history window,
                which means it has been present in CAISO&apos;s constraint set without limiting
                dispatch. Values update as the market clears.
              </>
            )}
          </p>
          {c.oms_ref && (
            <p style={{ margin: '0 0 14px' }}>
              This constraint is tagged by CAISO with outage reference{' '}
              <span style={{ ...mono, color: C.text }}>{c.oms_ref}</span>, meaning it exists because
              of a specific transmission outage rather than as a permanent network limit.
            </p>
          )}
          <p style={{ margin: 0 }}>
            Data comes from CAISO OASIS ({c.feed === 'internal' ? 'PRC_NOMOGRAM' : 'PRC_CNSTR'}) for
            both the day-ahead and real-time markets, refreshed automatically. This page is
            informational only and is not trading, financial, or operational advice.
          </p>
        </div>

        {/* Internal linking */}
        {related.length > 0 && (
          <>
            <h2 style={{ ...grotesk, fontSize: 16, margin: '28px 0 12px' }}>
              Related {c.feed === 'internal' ? 'internal constraints' : 'interties'}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {related.map((r) => (
                <Link key={r.slug} href={`/congestion/caiso/constraint/${r.slug}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 5, padding: '11px 13px' }}>
                    <div style={{ fontSize: 12.5, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ ...mono, fontSize: 10.5, color: C.muted, marginTop: 4 }}>
                      peak ${Math.abs(r.stats?.peak_signed ?? 0).toFixed(2)} · {r.stats?.binding_intervals ?? 0} binding
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: 32, paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: 12 }}>
          <Link href="/congestion/caiso" style={{ color: C.teal, textDecoration: 'none' }}>
            ← Back to the CAISO Congestion Monitor
          </Link>
        </div>
      </div>
    </div>
  );
}
