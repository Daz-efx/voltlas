// app/interconnection/ercot/page.jsx
// ERCOT generation interconnection queue, summarized by county and fuel.
// Built at deploy time from public/data/queue/{projects_ercot,meta}.json
// (scripts/queue_scores.py, refreshed weekly by .github/workflows/queue-scores.yml).
//
// HONESTY CONSTRAINTS baked in below:
//   - Queue MW is requested capacity, not capacity that will be built. Stated.
//   - ERCOT's GIS report under-reports historical withdrawals, so no
//     completion/withdrawal RATES are shown — only counts, labeled as such.
//   - The experimental composite "siting score" is not shown (failed validation).

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

const FUELS = [
  { key: 'Storage', color: '#2DD4BF' },
  { key: 'Solar', color: '#FFB020' },
  { key: 'Wind', color: '#7AA2F7' },
  { key: 'Gas', color: '#FF5A5F' },
  { key: 'Other', color: '#7C8790' },
];
const FUEL_COLOR = Object.fromEntries(FUELS.map((f) => [f.key, f.color]));

function fuelOf(genType = '') {
  const t = genType.toLowerCase();
  if (t.includes('battery') || t.includes('storage')) return 'Storage';
  if (t.startsWith('solar')) return 'Solar';
  if (t.startsWith('wind')) return 'Wind';
  if (t.startsWith('gas')) return 'Gas';
  return 'Other';
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'queue', name), 'utf8'));
  } catch {
    return fallback;
  }
}

export const metadata = {
  title: 'ERCOT Interconnection Queue by County — Texas Solar, Storage, Wind & Gas',
  description:
    'Where new generation wants to connect to the Texas grid: ERCOT interconnection queue capacity by county and fuel — battery storage, solar, wind, and gas — from ERCOT’s Generation Interconnection Status report. Updated weekly.',
  keywords: [
    'ERCOT interconnection queue', 'ERCOT GIS report', 'Texas interconnection queue',
    'Texas battery storage projects', 'Texas solar projects', 'ERCOT queue by county',
    'generation interconnection Texas',
  ],
  alternates: { canonical: `${SITE}/interconnection/ercot` },
  openGraph: {
    title: 'ERCOT Interconnection Queue by County',
    description: 'Requested new generation on the Texas grid, by county and fuel, from ERCOT’s GIS report.',
    url: `${SITE}/interconnection/ercot`,
    siteName: 'Voltlas',
    type: 'website',
  },
};

const fmtMW = (x) => (x >= 1000 ? `${(x / 1000).toFixed(1)} GW` : `${Math.round(x)} MW`);

function FuelBar({ mix, total, height = 6 }) {
  return (
    <div style={{ display: 'flex', height, borderRadius: 3, overflow: 'hidden', background: C.line }}>
      {FUELS.map((f) => (mix[f.key] ? (
        <div key={f.key} title={`${f.key}: ${fmtMW(mix[f.key])}`}
          style={{ width: `${(100 * mix[f.key]) / total}%`, background: f.color }} />
      ) : null))}
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: C.muted, margin: '8px 0 0' }}>
      {FUELS.map((f) => (
        <span key={f.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: f.color, display: 'inline-block' }} />
          {f.key}
        </span>
      ))}
    </div>
  );
}

function CountyTable({ rows, valueKey, caption }) {
  const max = Math.max(...rows.map((r) => r[valueKey]), 1);
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, overflow: 'hidden', marginTop: 12 }}>
      {rows.map((c, i) => (
        <div key={c.county} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
          background: i % 2 ? C.panel2 : C.panel,
          borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${C.line}`,
        }}>
          <span style={{ ...mono, fontSize: 11, color: C.muted, width: 22, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
          <span style={{ width: 'clamp(96px, 26vw, 150px)', flexShrink: 0 }}>
            <span style={{ display: 'block', fontSize: 13, color: C.text }}>{c.county}</span>
            <span style={{ fontSize: 10.5, color: C.muted }}>{c.n} project{c.n === 1 ? '' : 's'}</span>
          </span>
          <span style={{ flex: 1, minWidth: 60 }}>
            <div style={{ width: `${Math.max(4, (100 * c[valueKey]) / max)}%` }}>
              <FuelBar mix={valueKey === 'activeMW' ? c.mix : c.recentMix} total={c[valueKey]} />
            </div>
          </span>
          <span style={{ ...mono, fontSize: 13, fontWeight: 600, width: 70, flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMW(c[valueKey])}</span>
        </div>
      ))}
      {caption && <div style={{ fontSize: 10.5, color: C.muted, padding: '8px 14px', background: C.panel2, borderTop: `1px solid ${C.line}` }}>{caption}</div>}
    </div>
  );
}

export default function ErcotQueuePage() {
  const projects = readJson('projects_ercot.json', []);
  const meta = readJson('meta.json', {});
  const cov = meta.isos?.ercot ?? {};

  const generated = meta.generated_at ? new Date(meta.generated_at) : new Date();
  const cutoff = new Date(generated);
  cutoff.setMonth(cutoff.getMonth() - 24);

  const totals = {};
  const byCounty = {};
  let activeTotal = 0;
  for (const pr of projects) {
    const fuel = fuelOf(pr.gen_type);
    const c = (byCounty[pr.county] ??= { county: pr.county, n: 0, activeMW: 0, recentMW: 0, mix: {}, recentMix: {} });
    if (pr.bucket === 'active') {
      c.n += 1;
      c.activeMW += pr.mw;
      c.mix[fuel] = (c.mix[fuel] ?? 0) + pr.mw;
      totals[fuel] = (totals[fuel] ?? 0) + pr.mw;
      activeTotal += pr.mw;
    }
    if (pr.queue_date && new Date(pr.queue_date) >= cutoff) {
      c.recentMW += pr.mw;
      c.recentMix[fuel] = (c.recentMix[fuel] ?? 0) + pr.mw;
    }
  }
  const counties = Object.values(byCounty);
  const topActive = counties.filter((c) => c.activeMW > 0).sort((a, b) => b.activeMW - a.activeMW).slice(0, 20);
  const topRecent = counties.filter((c) => c.recentMW > 0).sort((a, b) => b.recentMW - a.recentMW).slice(0, 10);
  const nActiveCounties = counties.filter((c) => c.activeMW > 0).length;
  const storageShare = activeTotal ? Math.round((100 * (totals.Storage ?? 0)) / activeTotal) : 0;

  const h2 = { ...grotesk, fontSize: 17, margin: '32px 0 4px' };
  const note = { fontSize: 12, color: C.muted, margin: '0 0 4px' };
  const p = { fontSize: 15, lineHeight: 1.75, color: C.muted, maxWidth: 780, margin: '0 0 14px' };
  const em = { color: C.text };

  return (
    <div style={{ background: C.ink, color: C.text, minHeight: '100vh', padding: 24, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        <nav style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
          <Link href="/congestion/ercot" style={{ color: C.muted, textDecoration: 'none' }}>ERCOT</Link>
          {' / '}<span style={{ color: C.text }}>Interconnection queue</span>
        </nav>

        <h1 style={{ ...grotesk, fontSize: 27, margin: '0 0 12px', lineHeight: 1.25 }}>
          ERCOT interconnection queue by county
        </h1>
        <p style={p}>
          Every new power plant that wants to connect to the Texas grid enters ERCOT&apos;s
          interconnection queue. This page summarizes that queue by county and fuel: where developers
          are proposing projects, what they want to build, and where interest has grown fastest.
          Queue capacity is <span style={em}>requested</span> capacity; across U.S. queues, most
          requested capacity has historically been withdrawn rather than built.
        </p>
        <div style={{ ...mono, fontSize: 11, color: C.muted, marginBottom: 4 }}>
          {cov.active ?? '—'} active projects · {fmtMW(activeTotal)} requested · {nActiveCounties} counties
          {meta.generated_at ? ` · data as of ${meta.generated_at.slice(0, 10)}` : ''}
        </div>

        <h2 style={h2}>What is in the queue</h2>
        <div style={note}>Active requested capacity by fuel.</div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: 14, marginTop: 12, background: C.panel }}>
          <FuelBar mix={totals} total={activeTotal || 1} height={14} />
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12 }}>
            {FUELS.filter((f) => totals[f.key]).map((f) => (
              <span key={f.key} style={{ fontSize: 12, color: C.muted }}>
                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: f.color, marginRight: 6 }} />
                {f.key} <span style={{ ...mono, color: C.text }}>{fmtMW(totals[f.key])}</span>
                {' '}({Math.round((100 * totals[f.key]) / activeTotal)}%)
              </span>
            ))}
          </div>
        </div>

        <h2 style={h2}>Counties with the most requested capacity</h2>
        <div style={note}>Active projects only, by requested megawatts.</div>
        <Legend />
        <CountyTable rows={topActive} valueKey="activeMW"
          caption="Bars show fuel mix of active requests; bar length is relative to the top county." />

        <h2 style={h2}>Fastest-growing interest — last 24 months</h2>
        <div style={note}>Capacity entering the queue in the 24 months before the data date, any status.</div>
        <CountyTable rows={topRecent} valueKey="recentMW" />

        <h2 style={h2}>Reading the queue</h2>
        <p style={p}>
          <span style={em}>Storage leads.</span> Battery projects make up about {storageShare}% of
          active requested capacity. Batteries are typically smaller and quicker to build than wind or
          solar and are often sited at existing substations, so they cluster differently.
        </p>
        <p style={p}>
          <span style={em}>A busy queue is not a congestion map.</span> It is tempting to read heavy
          queue activity as a sign that a region is export-constrained. Voltlas tested that against
          observed prices and found the relationship weak: queue interest tracks where developers see
          land, resource quality, and existing substations, not only where the grid is stuck. For
          measured congestion, see{' '}
          <Link href="/congestion/ercot" style={{ color: C.teal, textDecoration: 'none' }}>ERCOT congestion by county</Link>.
        </p>

        <h2 style={h2}>Method and limitations</h2>
        <p style={p}>
          Data comes from ERCOT&apos;s Generation Interconnection Status (GIS) report, retrieved weekly
          through the open-source gridstatus library. A project is counted in the county ERCOT reports
          for it; multi-county projects are assigned to the first county listed. Fuel categories are
          grouped from ERCOT&apos;s generation type field. ERCOT&apos;s report retains only a partial
          history of withdrawn projects, so this page does not publish completion or withdrawal rates.
          Requested capacity overstates what will be built. This page is informational only and is not
          an interconnection, capacity, or investment determination.
        </p>

        <div style={{ marginTop: 32, paddingTop: 18, borderTop: `1px solid ${C.line}`, fontSize: 13, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/congestion/ercot" style={{ color: C.teal, textDecoration: 'none' }}>
            ← ERCOT congestion by county
          </Link>
          <Link href="/congestion/caiso" style={{ color: C.teal, textDecoration: 'none' }}>
            CAISO congestion monitor →
          </Link>
        </div>
      </div>
    </div>
  );
}
