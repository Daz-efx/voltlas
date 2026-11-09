// app/congestion/ercot/page.jsx
// ERCOT congestion by county: where Texas generation is export-constrained,
// measured from day-ahead nodal prices. Built at deploy time from
// public/data/queue/ercot_county_basis.json (scripts/ercot_congestion_check.py,
// refreshed weekly by .github/workflows/ercot-price-archive.yml).
//
// HONESTY CONSTRAINTS baked in below:
//   - Basis is OBSERVED over a stated price window (currently ~30 days of DAM),
//     not a long-run average. The window is printed on-page.
//   - Counties are only as good as node->county mapping; node coverage and the
//     per-county node count are shown, and thin counties are flagged.
//   - Headline lists require >= 3 priced nodes so one odd node can't top a list.
//   - The experimental queue "siting score" is NOT shown: it failed validation
//     against observed congestion (see scripts/ercot_congestion_check.py).
//   - Informational only; not a load-capacity or interconnection determination.

import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';

const SITE = 'https://voltlas.com';
const MIN_NODES = 3;

const C = {
  ink: '#0A0D10', panel: '#12171C', panel2: '#161C22', line: '#1E262C',
  text: '#E7ECEF', muted: '#7C8790', amber: '#FFB020', teal: '#2DD4BF', red: '#FF5A5F',
};
const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace" };
const grotesk = { fontFamily: "'Space Grotesk', system-ui, sans-serif" };

function readBasis() {
  try {
    const p = path.join(process.cwd(), 'public', 'data', 'queue', 'ercot_county_basis.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { counties: [] };
  }
}

export const metadata = {
  title: 'ERCOT Congestion by County — Where Texas Power Is Export-Constrained',
  description:
    'Which Texas counties sit behind ERCOT transmission congestion: nodal day-ahead price basis versus the hub, share of hours deeply discounted, and the most export-constrained wind and solar regions. Updated weekly from ERCOT market data.',
  keywords: [
    'ERCOT congestion', 'ERCOT basis', 'ERCOT nodal prices', 'Texas transmission congestion',
    'West Texas congestion', 'Panhandle congestion', 'export constrained', 'resource node prices',
    'data center siting Texas', 'HB_BUSAVG',
  ],
  alternates: { canonical: `${SITE}/congestion/ercot` },
  openGraph: {
    title: 'ERCOT Congestion by County',
    description:
      'Where Texas generation is stuck behind the grid: county-level price basis from ERCOT day-ahead nodal prices.',
    url: `${SITE}/congestion/ercot`,
    siteName: 'Voltlas',
    type: 'website',
  },
};

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const usd = (x) => (x == null ? '—' : `${x >= 0 ? '+' : '−'}$${Math.abs(x).toFixed(2)}`);
const COL = 'clamp(54px, 13vw, 92px)';
const basisColor = (x) => (x == null ? C.muted : x <= -3 ? C.teal : x >= 3 ? C.amber : C.text);

function Table({ rows, caption, valueKey }) {
  if (!rows.length) return null;
  const head = { ...mono, fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 };
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden', marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px', background: C.panel2, borderBottom: `1px solid ${C.line}` }}>
        <span style={{ ...head, width: 20, flexShrink: 0 }} />
        <span style={{ ...head, flex: 1 }}>County</span>
        <span style={{ ...head, width: COL, flexShrink: 0, textAlign: 'right' }}>&lt;−$5 hrs</span>
        <span style={{ ...head, width: COL, flexShrink: 0, textAlign: 'right' }}>Median</span>
        <span style={{ ...head, width: COL, flexShrink: 0, textAlign: 'right' }}>P10</span>
      </div>
      {rows.map((c, i) => (
        <div key={c.county} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          background: i % 2 ? C.panel2 : C.panel,
          borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${C.line}`,
        }}>
          <span style={{ ...mono, fontSize: 11, color: C.muted, width: 20, flexShrink: 0, textAlign: 'right' }}>{i + 1}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, color: C.text }}>{c.county}</span>
            <span style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap' }}>
              {c.n_nodes} node{c.n_nodes === 1 ? '' : 's'}
              {c.n_nodes < MIN_NODES ? ' · thin sample' : ''}
            </span>
          </span>
          <span style={{ ...mono, fontSize: 12.5, whiteSpace: 'nowrap', width: COL, flexShrink: 0, textAlign: 'right',
            color: valueKey === 'share' ? C.text : C.muted, fontWeight: valueKey === 'share' ? 600 : 400 }}>
            {pct(c.share_hours_below_neg5)}
          </span>
          <span style={{ ...mono, fontSize: 12.5, whiteSpace: 'nowrap', width: COL, flexShrink: 0, textAlign: 'right', color: basisColor(c.county_median_hourly),
            fontWeight: valueKey === 'median' ? 600 : 400 }}>
            {usd(c.county_median_hourly)}
          </span>
          <span style={{ ...mono, fontSize: 12.5, whiteSpace: 'nowrap', width: COL, flexShrink: 0, textAlign: 'right', color: C.muted }}>
            {usd(c.county_p10_basis)}
          </span>
        </div>
      ))}
      {caption && <div style={{ fontSize: 10.5, color: C.muted, padding: '8px 14px', background: C.panel2, borderTop: `1px solid ${C.line}` }}>{caption}</div>}
    </div>
  );
}

export default function ErcotCongestionPage() {
  const data = readBasis();
  const all = (data.counties ?? []).filter((c) => c.n_nodes > 0 && c.share_hours_below_neg5 != null);
  const solid = all.filter((c) => c.n_nodes >= MIN_NODES);

  const exportConstrained = [...solid]
    .sort((a, b) => b.share_hours_below_neg5 - a.share_hours_below_neg5 || a.county_median_hourly - b.county_median_hourly)
    .slice(0, 15);
  const premium = [...solid]
    .sort((a, b) => b.county_median_hourly - a.county_median_hourly)
    .slice(0, 10);
  const alpha = [...all].sort((a, b) => a.county.localeCompare(b.county));

  const [winStart, winEnd] = data.price_window ?? [];
  const mapping = data.node_mapping ?? {};
  const mappedNodes = Object.values(mapping).reduce((s, n) => s + n, 0);
  const coverage = data.generation_nodes ? Math.round((100 * mappedNodes) / data.generation_nodes) : null;
  const top = exportConstrained[0];

  const h2 = { ...grotesk, fontSize: 17, margin: '32px 0 4px' };
  const note = { fontSize: 12, color: C.muted, margin: '0 0 4px' };
  const p = { fontSize: 15, lineHeight: 1.75, color: C.muted, maxWidth: 780, margin: '0 0 14px' };
  const em = { color: C.text };

  return (
    <div style={{ background: C.ink, color: C.text, minHeight: '100vh', padding: 24, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        <nav style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
          <Link href="/congestion/caiso" style={{ color: C.muted, textDecoration: 'none' }}>Congestion</Link>
          {' / '}<span style={{ color: C.text }}>ERCOT by county</span>
        </nav>

        <h1 style={{ ...grotesk, fontSize: 27, margin: '0 0 12px', lineHeight: 1.25 }}>
          ERCOT congestion by county
        </h1>
        <p style={p}>
          Texas has one wholesale price per hour for the whole grid only in theory. In practice, every
          generator is paid the price at its own <span style={em}>node</span>, and when transmission out of
          a region fills up, prices there fall below the rest of the system. This page measures that gap —
          the <span style={em}>basis</span>{' '}against ERCOT&apos;s hub average — for every Texas county with
          operating generation, and ranks where power is most often stuck behind the grid.
        </p>
        <div style={{ ...mono, fontSize: 11, color: C.muted, marginBottom: 4 }}>
          {all.length} counties
          {data.nodes_with_prices ? ` · ${data.nodes_with_prices} priced nodes` : ''}
          {coverage ? ` · ${coverage}% of generation nodes mapped` : ''}
          {winStart ? ` · day-ahead prices ${winStart} to ${winEnd}` : ''}
        </div>

        <h2 style={h2}>Most export-constrained counties</h2>
        <div style={note}>
          Ranked by the share of hours priced more than $5/MWh below the ERCOT hub average.
          Counties with at least {MIN_NODES} priced nodes.
        </div>
        <Table
          rows={exportConstrained}
          valueKey="share"
          caption="Median and P10 (worst 10% of hours) are hourly basis versus HB_BUSAVG in $/MWh, taken as the median across the county's nodes. Negative = cheaper than the hub."
        />

        <h2 style={h2}>Counties priced above the hub</h2>
        <div style={note}>
          Ranked by median hourly basis. These are import-constrained or load-heavy areas where
          power costs more than the system average.
        </div>
        <Table rows={premium} valueKey="median" />

        <h2 style={h2}>What the numbers mean</h2>
        <p style={p}>
          <span style={em}>Negative basis means export-constrained.</span> When a region produces more power
          than its transmission can carry out, the grid prices that power down until some of it stops
          running. Wind and solar regions far from load are the classic case
          {top ? ` — ${top.county} County spent ${pct(top.share_hours_below_neg5)} of hours in this window more than $5/MWh below the hub` : ''}.
        </p>
        <p style={p}>
          <span style={em}>Why it matters for new demand.</span> In an export-constrained area, new
          consumption sits on the &quot;right side&quot; of the bottleneck: it can absorb power that would
          otherwise be curtailed, and buys it at a discount. That is why congestion is one of the first
          screens for large flexible loads such as data centers. It is only a first screen — available
          substation capacity, interconnection studies, and future transmission upgrades decide what can
          actually be built, and basis can change quickly when new lines are energized.
        </p>
        <p style={p}>
          <span style={em}>Median versus P10.</span> A county with a near-zero median but a deeply
          negative P10 (its worst 10% of hours) is congested intermittently — typically on windy nights or sunny
          spring afternoons — rather than all the time.
        </p>

        <h2 style={h2}>All counties</h2>
        <div style={note}>Alphabetical. Counties with fewer than {MIN_NODES} priced nodes are marked as thin samples.</div>
        <Table rows={alpha} valueKey="share" />

        <h2 style={h2}>Method and limitations</h2>
        <p style={p}>
          Prices are ERCOT Day-Ahead Market settlement point prices at resource nodes, archived by Voltlas
          from ERCOT&apos;s public market information system. Basis is each node&apos;s hourly price minus
          the ERCOT Hub Average (HB_BUSAVG); because ERCOT nodal prices carry no loss component, this is a
          relative congestion measure. Nodes are assigned to counties by joining ERCOT&apos;s resource-node
          to unit mapping with the unit and county list in ERCOT&apos;s Capacity, Demand and Reserves
          report, falling back to the unit&apos;s substation where unit names differ
          {coverage ? ` (${coverage}% of generation nodes mapped)` : ''}. Private-use network nodes are
          excluded. A county&apos;s figures are medians across its nodes.
        </p>
        <p style={p}>
          The price window is short{winStart ? ` (${winStart} to ${winEnd})` : ''} and covers a single
          season; congestion patterns shift with wind and solar output, outages, and new transmission.
          Day-ahead prices also understate real-time congestion spikes. Only counties with operating
          generation appear. This page is informational only and is not a load-capacity, interconnection,
          trading, or investment determination.
        </p>

        <div style={{ marginTop: 32, paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: 13, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/interconnection/ercot" style={{ color: C.teal, textDecoration: 'none' }}>
            ERCOT interconnection queue by county →
          </Link>
          <Link href="/congestion/caiso" style={{ color: C.teal, textDecoration: 'none' }}>
            CAISO congestion monitor →
          </Link>
        </div>
      </div>
    </div>
  );
}
