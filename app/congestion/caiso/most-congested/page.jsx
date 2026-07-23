// app/congestion/caiso/most-congested/page.jsx
// Leaderboard: which CAISO constraints congest most often, and which hit the
// hardest. Built at deploy time from data/caiso/constraint-registry.json.
//
// PURPOSE (two jobs):
//   1. Targets a real query with clear intent — "most congested transmission
//      lines in California" — that no free tool answers well.
//   2. Acts as an internal-linking hub: every row links to a per-constraint
//      page, giving those ~50 pages a crawl path from a single indexable page.
//
// HONESTY CONSTRAINTS baked in below:
//   - Rankings reflect what Voltlas has OBSERVED since the registry started,
//     not all-time CAISO history. The observation window is stated on-page.
//   - Internal history retains BINDING ROWS ONLY (volume guard) while intertie
//     history retains all rows, so binding COUNTS are comparable within a feed
//     but not across feeds. Feeds are therefore ranked separately, never merged.
//   - No percentages are shown for internal constraints (denominator unknown).

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

const CLASS_LABEL = {
  branch: 'Line',
  transformer: 'Transformer',
  nomogram: 'Nomogram',
  outage: 'Outage-driven',
  intertie: 'Intertie',
};

function readRegistry() {
  try {
    const p = path.join(process.cwd(), 'data', 'caiso', 'constraint-registry.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { constraints: {} };
  }
}

export const metadata = {
  title: 'Most Congested Transmission Constraints in CAISO | Voltlas',
  description:
    'Which California transmission lines, transformers, and nomograms congest most often, and which reach the highest shadow prices. Ranked from CAISO OASIS market data, updated weekly.',
  alternates: { canonical: `${SITE}/congestion/caiso/most-congested` },
  openGraph: {
    title: 'Most Congested Transmission Constraints in CAISO',
    description:
      'Ranked by how often each constraint binds and how severe it gets, from official CAISO market results.',
    url: `${SITE}/congestion/caiso/most-congested`,
    siteName: 'Voltlas',
    type: 'website',
  },
};

function RankTable({ items, metric, caption }) {
  if (!items.length) return null;
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden', marginTop: 12 }}>
      {items.map((c, i) => {
        const value = metric === 'frequency'
          ? `${c.stats?.binding_intervals ?? 0}`
          : `$${(c.stats?.peak_signed ?? 0).toFixed(2)}`;
        const valueColor = metric === 'frequency'
          ? C.text
          : Math.abs(c.stats?.peak_signed ?? 0) > 50 ? C.red : C.amber;
        return (
          <Link key={c.slug} href={`/congestion/caiso/constraint/${c.slug}`} style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
              background: i % 2 ? C.panel2 : C.panel,
              borderBottom: i === items.length - 1 ? 'none' : `1px solid ${C.line}`,
            }}>
              <span style={{ ...mono, fontSize: 11, color: C.muted, width: 22, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </span>
                <span style={{ fontSize: 10.5, color: C.muted }}>
                  {CLASS_LABEL[c.class] ?? c.class ?? 'Constraint'}
                  {c.kv ? ` · ${c.kv} kV` : ''}
                  {metric === 'frequency' && c.stats?.peak_signed != null
                    ? ` · peak $${c.stats.peak_signed.toFixed(2)}`
                    : ''}
                  {metric === 'severity' && c.stats?.binding_intervals != null
                    ? ` · ${c.stats.binding_intervals} binding intervals`
                    : ''}
                </span>
              </span>
              <span style={{ ...mono, fontSize: 13, fontWeight: 600, color: valueColor, whiteSpace: 'nowrap' }}>
                {value}
              </span>
            </div>
          </Link>
        );
      })}
      {caption && <div style={{ fontSize: 10.5, color: C.muted, padding: '8px 14px', background: C.panel2, borderTop: `1px solid ${C.line}` }}>{caption}</div>}
    </div>
  );
}

export default function MostCongestedPage() {
  const reg = readRegistry();
  const all = Object.values(reg.constraints ?? {});

  const internal = all.filter((c) => c.feed === 'internal');
  const intertie = all.filter((c) => c.feed === 'intertie');

  const byFrequency = (arr) => [...arr]
    .filter((c) => (c.stats?.binding_intervals ?? 0) > 0)
    .sort((a, b) =>
      (b.stats?.binding_intervals ?? 0) - (a.stats?.binding_intervals ?? 0) ||
      (b.stats?.alltime_peak_abs ?? 0) - (a.stats?.alltime_peak_abs ?? 0)
    );
  const bySeverity = (arr) => [...arr]
    .filter((c) => (c.stats?.alltime_peak_abs ?? 0) > 0)
    .sort((a, b) => (b.stats?.alltime_peak_abs ?? 0) - (a.stats?.alltime_peak_abs ?? 0));

  const internalFreq = byFrequency(internal).slice(0, 15);
  const internalSev = bySeverity(internal).slice(0, 15);
  const intertieFreq = byFrequency(intertie).slice(0, 10);

  // Observation window — stated on-page so rankings aren't mistaken for all-time
  const firstSeen = all.map((c) => c.first_seen).filter(Boolean).sort()[0];
  const windowDays = firstSeen
    ? Math.max(1, Math.round((Date.now() - new Date(firstSeen)) / 86400_000))
    : null;
  const topSev = internalSev[0];

  const h2 = { ...grotesk, fontSize: 17, margin: '32px 0 4px' };
  const note = { fontSize: 12, color: C.muted, margin: '0 0 4px' };
  const p = { fontSize: 15, lineHeight: 1.75, color: C.muted, maxWidth: 780, margin: '0 0 14px' };

  return (
    <div style={{ background: C.ink, color: C.text, minHeight: '100vh', padding: 24, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        <nav style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
          <Link href="/congestion/caiso" style={{ color: C.muted, textDecoration: 'none' }}>Congestion Monitor</Link>
          {' / '}<span style={{ color: C.text }}>Most congested</span>
        </nav>

        <h1 style={{ ...grotesk, fontSize: 27, margin: '0 0 12px', lineHeight: 1.25 }}>
          Most congested transmission constraints in CAISO
        </h1>
        <p style={p}>
          Congestion in the California ISO market shows up as a{' '}
          <span style={{ color: C.text }}>shadow price</span> on a specific piece of equipment —
          a transmission line, a transformer, or an operating nomogram. This page ranks those
          constraints two ways: how <span style={{ color: C.text }}>often</span> each one binds,
          and how <span style={{ color: C.text }}>hard</span> it hits when it does. The two lists
          are not the same, and the difference is usually the interesting part.
        </p>
        <div style={{ ...mono, fontSize: 11, color: C.muted, marginBottom: 4 }}>
          {all.length} constraints tracked
          {windowDays ? ` · ${windowDays} day observation window` : ''}
          {reg.generated_at ? ` · data through ${reg.generated_at.slice(0, 10)}` : ''}
        </div>

        <h2 style={h2}>Binds most often — internal grid</h2>
        <div style={note}>
          Ranked by the number of market intervals in which each constraint was binding.
        </div>
        <RankTable
          items={internalFreq}
          metric="frequency"
          caption="Counts are binding intervals observed by Voltlas within the retained history window, across both day-ahead and real-time markets."
        />

        <h2 style={h2}>Highest shadow price reached — internal grid</h2>
        <div style={note}>
          Ranked by the largest shadow price observed, in dollars per megawatt-hour.
        </div>
        <RankTable
          items={internalSev}
          metric="severity"
          caption="Values are shown with the sign CAISO publishes; ranking uses magnitude. A single severe hour can outrank a constraint that binds far more often."
        />

        {intertieFreq.length > 0 && (
          <>
            <h2 style={h2}>Interties — binds most often</h2>
            <div style={note}>
              Scheduling constraints on the paths connecting CAISO to neighbouring grids.
            </div>
            <RankTable
              items={intertieFreq}
              metric="frequency"
              caption="Intertie and internal counts are not directly comparable — the two feeds retain different history windows."
            />
          </>
        )}

        <h2 style={h2}>How to read these rankings</h2>
        <p style={p}>
          <span style={{ color: C.text }}>Frequency and severity measure different risks.</span> A
          constraint that binds in most hours at a few dollars per megawatt-hour is a chronic,
          predictable feature of the network — it shapes where power is worth producing, but rarely
          surprises anyone. A constraint that binds twice a month at{' '}
          {topSev ? `$${Math.abs(topSev.stats.alltime_peak_abs).toFixed(0)}` : 'several hundred dollars'}{' '}
          per megawatt-hour is the opposite: mostly invisible, then briefly dominant. Traders,
          schedulers, and planners tend to care about different ends of that spectrum.
        </p>
        <p style={p}>
          Voltage is a useful second signal. Lower-voltage elements — 60, 69, 70, and 115 kV lines
          — appear frequently in the severity ranking because they serve local load pockets with
          limited alternative paths, so a single outage or a hot afternoon can push them to their
          limit. Higher-voltage 230 kV and 500 kV constraints bind less often but move much more
          power when they do.
        </p>

        <h2 style={h2}>Method and limitations</h2>
        <p style={p}>
          Rankings are built from CAISO OASIS market results (PRC_NOMOGRAM for internal constraints,
          PRC_CNSTR for interties), collected automatically and refreshed on this page weekly. They
          reflect what has been <span style={{ color: C.text }}>observed since tracking began</span>
          {windowDays ? ` — a ${windowDays}-day window` : ''}, not CAISO&apos;s full history, so a
          constraint that was severe last winter will not appear until it binds again. Internal and
          intertie counts come from feeds with different retention windows and should be compared
          within a section, not across them. Constraint names are parsed from CAISO&apos;s
          identifiers, so substation abbreviations follow CAISO&apos;s conventions. This page is
          informational only and is not trading, financial, or operational advice.
        </p>

        <div style={{ marginTop: 32, paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: 13, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/congestion/caiso" style={{ color: C.teal, textDecoration: 'none' }}>
            ← Live congestion monitor
          </Link>
          <Link href="/congestion/caiso/constraint" style={{ color: C.teal, textDecoration: 'none' }}>
            All tracked constraints →
          </Link>
        </div>
      </div>
    </div>
  );
}
