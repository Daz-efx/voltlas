'use client';

// app/congestion/caiso/page.jsx
// CAISO Congestion Monitor — two feeds:
//   internal  → nomogram-current.json  (PRC_NOMOGRAM: branch, transformer,
//               nomogram, outage-driven constraints — the internal grid)
//   intertie  → constraints-current.json (PRC_CNSTR: scheduling/intertie limits)
//
// Internal is the DEFAULT tab: it carries the material congestion
// (observed $1,374/MWh on a 70 kV branch vs $65 worst-case on interties).
//
// Prices: raw signed value as CAISO reports it; ranked by |magnitude|.
// DAM shows the CURRENT hour's interval, with the day's PEAK alongside.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Explainer from './Explainer';

const DATA_BASE = 'https://raw.githubusercontent.com/Daz-efx/voltlas/main/data/caiso';

// Approximate display coordinates for known interties. Internal constraints
// (branches/transformers) are not mapped — no public coordinate source.
// Display names for the intertie status board. Order here is the fallback
// display order; the board itself sorts by severity at render time.
// (Replaced the CARTO basemap 2026-09-05 when CARTO began requiring an API
// key, then replaced the stand-in SVG outline 2026-09-05 — hand-drawn
// geography looked worse than no geography. The interties carry ~10 rows;
// a status board shows the same information without pretending to be a map.)
const INTERTIE_LABELS = {
  COTPISO_ITC:      'COTP · California–Oregon',
  MALIN500_ISL:     'Malin 500 · COI',
  SUMMIT_ITC:       'Summit · Drum–Summit',
  SILVERPK_ITC:     'Silver Peak',
  CASCADE_ITC:      'Cascade',
  'ADLANTO-SP_ITC': 'Adelanto–SP · Lugo–Victorville',
  ELDORADO_ITC:     'Eldorado',
  NOB_ITC:          'NOB · Nevada–Oregon Border DC',
  EPE_NET_ITC:      'EPE net',
  AZPS_NET_ITC:     'APS net',
};

const C = {
  ink: '#0A0D10', panel: '#12171C', panel2: '#161C22', line: '#1E262C',
  text: '#E7ECEF', muted: '#7C8790', amber: '#FFB020', amberDim: '#5A4620',
  teal: '#2DD4BF', tealDim: '#1C4A45', red: '#FF5A5F', redDim: '#4A1F21',
};

const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace" };
const grotesk = { fontFamily: "'Space Grotesk', system-ui, sans-serif" };

function sev(price) { return Math.abs(price ?? 0); }
function priceColor(price, binding) {
  if (!binding) return C.teal;
  return sev(price) > 50 ? C.red : C.amber;
}

const CLASS_LABEL = {
  branch: 'Line',
  transformer: 'Transformer',
  nomogram: 'Nomogram',
  outage: 'Outage-driven',
};

// ---------- dependency-free SVG line chart ----------
function Sparkline({ points, color }) {
  if (!points || points.length < 2) {
    return (
      <div style={{ color: C.muted, fontSize: 12, padding: '16px 0' }}>
        Not enough history yet — chart appears after a few pipeline runs.
      </div>
    );
  }
  const W = 360, H = 120, PAD = 6;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals, 0), max = Math.max(...vals, 1);
  const x = (i) => PAD + (i / (points.length - 1)) * (W - 2 * PAD);
  const y = (v) => H - PAD - ((v - min) / (max - min || 1)) * (H - 2 * PAD);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${d} L${x(points.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <path d={area} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" />
      <text x={PAD} y={12} fill={C.muted} fontSize="9" style={mono}>|${max.toFixed(0)}|</text>
      <text x={PAD} y={H - PAD - 2} fill={C.muted} fontSize="9" style={mono}>|${min.toFixed(0)}|</text>
    </svg>
  );
}

function Panel({ title, right, children, style }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 18, ...style }}>
      {title && (
        <div style={{ ...grotesk, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>{title}</span>{right}
        </div>
      )}
      {children}
    </div>
  );
}

function TabRow({ tabs, active, onSelect, accent = C.teal }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {tabs.map((t) => (
        <button key={t.key ?? t} onClick={() => onSelect(t.key ?? t)} style={{
          fontSize: 11, padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
          background: active === (t.key ?? t) ? C.panel2 : 'transparent',
          border: `1px solid ${active === (t.key ?? t) ? accent : C.line}`,
          color: active === (t.key ?? t) ? C.text : C.muted, fontFamily: 'inherit',
        }}>{t.label ?? t}</button>
      ))}
    </div>
  );
}


// ---------- intertie status board (replaces the map panel) ----------
// Every intertie CAISO is currently reporting, plus any known interface that
// has dropped out of the current publication, sorted by severity.
function IntertieBoard({ constraints, activeOutages, onSelect, selectedId }) {
  const ids = new Set([
    ...Object.keys(INTERTIE_LABELS),
    ...Object.keys(constraints ?? {}),
  ]);

  const rows = [...ids].map((id) => {
    const c = constraints?.[id];
    return {
      id,
      label: INTERTIE_LABELS[id] ?? c?.constraint_name ?? id,
      price: c?.worst?.shadow_price,
      market: c?.worst?.market,
      binding: !!c?.worst?.binding,
      known: !!c,
      outage: activeOutages.has(id),
    };
  }).sort((a, b) => {
    if (a.known !== b.known) return a.known ? -1 : 1;
    return sev(b.price) - sev(a.price);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {rows.map((r) => (
        <div
          key={r.id}
          onClick={() => r.known && onSelect(r.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px',
            background: selectedId === r.id ? C.panel2 : 'transparent',
            borderLeft: `2px solid ${selectedId === r.id ? C.teal : 'transparent'}`,
            borderBottom: `1px solid ${C.line}`,
            cursor: r.known ? 'pointer' : 'default',
            opacity: r.known ? 1 : 0.45,
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: r.known ? priceColor(r.price, r.binding) : C.muted,
          }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.label}
            </span>
            <span style={{ fontSize: 10, color: C.muted }}>
              {r.known
                ? `${r.market}${r.binding ? ' · binding' : ' · not binding'}`
                : 'not in current publication'}
              {r.outage ? ' · outage' : ''}
            </span>
          </span>
          {r.outage && (
            <span style={{
              fontSize: 9.5, padding: '2px 6px', borderRadius: 3, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              background: C.amberDim, color: C.amber, flexShrink: 0,
            }}>outage</span>
          )}
          <span style={{
            ...mono, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
            color: r.known ? priceColor(r.price, r.binding) : C.muted,
          }}>
            {r.known ? `$${(r.price ?? 0).toFixed(2)}` : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CongestionPage() {
  const [internal, setInternal] = useState(null);
  const [intertie, setIntertie] = useState(null);
  const [internalHistory, setInternalHistory] = useState([]);
  const [intertieHistory, setIntertieHistory] = useState([]);
  const [outageData, setOutageData] = useState(null);
  const [registry, setRegistry] = useState(null);
  const [error, setError] = useState(null);

  const [feed, setFeed] = useState('internal');   // 'internal' | 'intertie'
  const [marketTab, setMarketTab] = useState('All');
  const [outageTab, setOutageTab] = useState('active');
  const [selectedId, setSelectedId] = useState(null);


  // ---------- data load ----------
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const j = (f) => fetch(`${DATA_BASE}/${f}`).then((r) => r.json());
        const [nom, cns, nomH, cnsH, out, reg] = await Promise.all([
          j('nomogram-current.json'),
          j('constraints-current.json'),
          j('nomogram-history.json').catch(() => []),
          j('constraints-history.json').catch(() => []),
          j('outages.json'),
          j('constraint-registry.json').catch(() => null),
        ]);
        if (!alive) return;
        setInternal(nom); setIntertie(cns);
        setInternalHistory(nomH); setIntertieHistory(cnsH);
        setOutageData(out); setRegistry(reg);
      } catch (e) {
        if (alive) setError(String(e));
      }
    }
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Map CAISO constraint IDs to their page slugs. A constraint observed
  // since the last deploy won't have a page yet — those simply render
  // without a link rather than 404ing.
  const slugById = useMemo(() => {
    const m = {};
    for (const c of Object.values(registry?.constraints ?? {})) m[c.constraint_id] = c.slug;
    return m;
  }, [registry]);

  // Interfaces with an active outage — drives the ring markers on the schematic.
  const activeOutageIfaces = useMemo(() => {
    const s = new Set();
    for (const o of Object.values(outageData?.outages ?? {})) {
      if (o.category === 'outage' && o.display_status === 'active' && o.ti_id) s.add(o.ti_id);
    }
    return s;
  }, [outageData]);

  const activeData = feed === 'internal' ? internal : intertie;
  const activeHistory = feed === 'internal' ? internalHistory : intertieHistory;

  // ---------- ranked list ----------
  const ranked = useMemo(() => {
    if (!activeData?.constraints) return [];
    const entries = Object.entries(activeData.constraints);
    const rows =
      marketTab === 'All'
        ? entries
            .map(([id, c]) => ({ id, name: c.constraint_name, cls: c.constraint_class, oms: c.oms_ref, ...c.worst }))
            .filter((r) => r.shadow_price != null)
        : entries
            .filter(([, c]) => c.markets?.[marketTab])
            .map(([id, c]) => ({ id, name: c.constraint_name, cls: c.constraint_class, oms: c.oms_ref, ...c.markets[marketTab] }));
    return rows.sort((a, b) => sev(b.shadow_price) - sev(a.shadow_price));
  }, [activeData, marketTab]);

  // Default selection = worst in the active feed
  useEffect(() => {
    if (ranked.length === 0) { setSelectedId(null); return; }
    setSelectedId((prev) =>
      prev && activeData?.constraints?.[prev] ? prev : ranked[0].id
    );
  }, [ranked, activeData]);

  // ---------- outages ----------
  const { discreteOutages, standingLimits } = useMemo(() => {
    const all = Object.values(outageData?.outages ?? {});
    return {
      discreteOutages: all.filter((o) => o.category === 'outage')
        .sort((a, b) => (b.max_curtailed_mw ?? 0) - (a.max_curtailed_mw ?? 0)),
      standingLimits: all.filter((o) => o.category === 'standing_limitation')
        .sort((a, b) => (b.max_curtailed_mw ?? 0) - (a.max_curtailed_mw ?? 0)),
    };
  }, [outageData]);

  const filteredOutages = useMemo(
    () => discreteOutages.filter((o) => (outageTab === 'all' ? true : o.display_status === outageTab)),
    [discreteOutages, outageTab]
  );

  // ---------- detail ----------
  const selected = selectedId && activeData?.constraints?.[selectedId]
    ? { id: selectedId, ...activeData.constraints[selectedId] } : null;

  const selectedHistory = useMemo(() => {
    if (!selected || !Array.isArray(activeHistory)) return [];
    return activeHistory
      .filter((h) => h.constraint_id === selected.id)
      .sort((a, b) => a.interval_start.localeCompare(b.interval_start))
      .slice(-96)
      .map((h) => ({ t: h.interval_start, v: Math.abs(h.shadow_price) }));
  }, [activeHistory, selected]);

  // Outages related to the selection: intertie by ti_id, internal by OMS ref
  const relatedOutages = useMemo(() => {
    if (!selected) return [];
    const all = [...discreteOutages, ...standingLimits];
    if (feed === 'intertie') return all.filter((o) => o.ti_id === selected.id);
    if (selected.oms_ref) {
      return all.filter((o) => String(o.description ?? '').includes(selected.oms_ref));
    }
    return [];
  }, [selected, feed, discreteOutages, standingLimits]);

  // ---------- render ----------
  if (error) {
    return (
      <div style={{ background: C.ink, color: C.red, minHeight: '100vh', padding: 40, ...mono }}>
        Data load failed: {error}<br /><br />Check DATA_BASE path in page.jsx.
      </div>
    );
  }

  const bindingCount = ranked.filter((r) => r.binding).length;
  const activeOutageCount = discreteOutages.filter((o) => o.display_status === 'active').length;
  const fmt = (ts) => (ts ? ts.replace('T', ' ').slice(0, 16) : '—');
  const updatedAt = activeData?.updated_at;

  return (
    <div style={{ background: C.ink, color: C.text, minHeight: '100vh', padding: 24, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, paddingBottom: 20, marginBottom: 20, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <h1 style={{ ...grotesk, fontWeight: 700, fontSize: 20, margin: 0 }}>Congestion Monitor</h1>
            <span style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.12em', border: `1px solid ${C.line}`, padding: '3px 8px', borderRadius: 3 }}>CAISO</span>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '6px 10px', borderRadius: 4, background: C.panel, border: `1px solid ${C.line}` }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.amber, boxShadow: `0 0 8px ${C.amber}` }} />
              Binding <b style={mono}>{bindingCount}</b>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '6px 10px', borderRadius: 4, background: C.panel, border: `1px solid ${C.line}` }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.teal, boxShadow: `0 0 8px ${C.teal}` }} />
              Active intertie outages <b style={mono}>{activeOutageCount}</b>
            </span>
            <span style={{ ...mono, fontSize: 11, color: C.muted }}>
              Updated {updatedAt ? fmt(updatedAt) : '…'} UTC
            </span>
          </div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,0.9fr)', gap: 16, alignItems: 'start' }}>

          <Panel title="Intertie Status" right={<span style={{ ...mono, color: C.muted, fontSize: 10 }}>10 SCHEDULING INTERFACES</span>}>
            <IntertieBoard
              constraints={intertie?.constraints}
              activeOutages={activeOutageIfaces}
              onSelect={(id) => { setFeed('intertie'); setSelectedId(id); }}
              selectedId={selectedId}
            />
            <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 11, color: C.muted, flexWrap: 'wrap' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: C.teal, marginRight: 6 }} />Not binding</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: C.amber, marginRight: 6 }} />Binding</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: C.red, marginRight: 6 }} />High shadow price</span>
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
              Scheduling constraints on the paths connecting CAISO to neighbouring
              balancing authorities, with current shadow prices and any active outage.
              Internal branch, transformer, and nomogram constraints appear in the list
              opposite.
            </div>
          </Panel>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <Panel
              title={
                <span>
                  Top Constraints Right Now{' '}
                  <Link href="/congestion/caiso/most-congested" style={{ color: C.muted, fontSize: 10, textDecoration: 'underline', textTransform: 'none', letterSpacing: 0 }}>
                    most congested
                  </Link>
                  <span style={{ color: C.line }}>{' · '}</span>
                  <Link href="/congestion/caiso/constraint" style={{ color: C.muted, fontSize: 10, textDecoration: 'underline', textTransform: 'none', letterSpacing: 0 }}>
                    all constraints
                  </Link>
                </span>
              }
              right={
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <TabRow
                    tabs={[{ key: 'internal', label: 'Internal' }, { key: 'intertie', label: 'Interties' }]}
                    active={feed}
                    onSelect={(f) => { setFeed(f); setMarketTab('All'); setSelectedId(null); }}
                    accent={C.amber}
                  />
                  <TabRow tabs={['All', 'DAM', 'RTM']} active={marketTab} onSelect={setMarketTab} />
                </div>
              }
            >
              {ranked.length === 0 && (
                <div style={{ color: C.muted, fontSize: 13, padding: '16px 0', textAlign: 'center' }}>
                  No constraints in this view right now.
                </div>
              )}
              <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                {ranked.map((r, i) => (
                  <div key={`${r.id}-${r.market}`} onClick={() => setSelectedId(r.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px', cursor: 'pointer',
                    borderBottom: `1px solid ${C.line}`,
                    borderLeft: selectedId === r.id ? `2px solid ${C.teal}` : '2px solid transparent',
                    background: selectedId === r.id ? C.panel2 : 'transparent', borderRadius: 4,
                  }}>
                    <span style={{ ...mono, fontSize: 11, color: C.muted, width: 20, textAlign: 'right' }}>{i + 1}</span>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: priceColor(r.shadow_price, r.binding), flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12.5, minWidth: 0 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      <span style={{ fontSize: 10, color: C.muted, display: 'block' }}>
                        {r.market}
                        {r.cls ? ` · ${CLASS_LABEL[r.cls] ?? r.cls}` : ''}
                        {r.binding ? ' · binding' : ''}
                        {r.peak && sev(r.peak.shadow_price) > sev(r.shadow_price) * 1.05
                          ? ` · peak $${r.peak.shadow_price.toFixed(2)}`
                          : ''}
                      </span>
                    </span>
                    <span style={{ ...mono, fontSize: 13, fontWeight: 600, color: priceColor(r.shadow_price, r.binding) }}>
                      ${(r.shadow_price ?? 0).toFixed(2)}
                    </span>
                    {slugById[r.id] && (
                      <Link
                        href={`/congestion/caiso/constraint/${slugById[r.id]}`}
                        onClick={(e) => e.stopPropagation()}
                        title="Constraint detail page"
                        style={{ color: C.muted, textDecoration: 'none', fontSize: 13, padding: '0 2px', flexShrink: 0 }}
                      >↗</Link>
                    )}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Constraint Detail">
              {!selected && <div style={{ color: C.muted, fontSize: 13, padding: '16px 0', textAlign: 'center' }}>Select a constraint.</div>}
              {selected && (() => {
                const w = selected.worst ?? {};
                const col = priceColor(w.shadow_price, w.binding);
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <h2 style={{ ...grotesk, fontSize: 16, margin: '0 0 4px' }}>{selected.constraint_name}</h2>
                        <div style={{ ...mono, fontSize: 10.5, color: C.muted, wordBreak: 'break-all' }}>
                          {selected.id}
                        </div>
                        {slugById[selected.id] && (
                          <Link
                            href={`/congestion/caiso/constraint/${slugById[selected.id]}`}
                            style={{ color: C.teal, textDecoration: 'none', fontSize: 11.5, display: 'inline-block', marginTop: 6 }}
                          >Full history &amp; details →</Link>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                        <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, background: w.binding ? C.amberDim : C.tealDim, color: w.binding ? C.amber : C.teal }}>
                          {w.binding ? 'Binding' : 'Not binding'}
                        </span>
                        {selected.constraint_class && (
                          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 3, background: C.panel2, border: `1px solid ${C.line}`, color: C.muted }}>
                            {CLASS_LABEL[selected.constraint_class] ?? selected.constraint_class}
                            {selected.kv ? ` · ${selected.kv} kV` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 22, marginBottom: 12, flexWrap: 'wrap' }}>
                      {Object.entries(selected.markets ?? {}).map(([mkt, row]) => (
                        <div key={mkt}>
                          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                            {mkt} · now
                          </div>
                          <div style={{ ...mono, fontSize: 18, fontWeight: 600, color: priceColor(row.shadow_price, row.binding) }}>
                            ${row.shadow_price.toFixed(2)}
                          </div>
                          {row.peak && (
                            <div style={{ ...mono, fontSize: 10.5, color: C.muted, marginTop: 3 }}>
                              peak ${row.peak.shadow_price.toFixed(2)}
                              {row.peak.interval_start ? ` @ ${row.peak.interval_start.slice(11, 16)}Z` : ''}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <Sparkline points={selectedHistory} color={col} />

                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}`, fontSize: 12 }}>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                        Related outages
                      </div>
                      {relatedOutages.length === 0 && (
                        <div style={{ color: C.muted }}>
                          None on record.{' '}
                          <span style={{ fontSize: 10 }}>
                            (Outage feed covers interties; internal constraints link only when
                            CAISO tags them with an OMS reference.)
                          </span>
                        </div>
                      )}
                      {relatedOutages.map((o) => (
                        <div key={o.oms_number} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px dashed ${C.line}`, color: C.muted, gap: 12 }}>
                          <span style={{ color: C.text }}>OMS {o.oms_number}</span>
                          <span style={mono}>{o.max_curtailed_mw ?? '?'} MW · {o.display_status}</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </Panel>
          </div>
        </div>

        <Panel
          title="Intertie Outages & Curtailments"
          right={<TabRow tabs={['active', 'upcoming', 'completed', 'all']} active={outageTab} onSelect={setOutageTab} />}
          style={{ marginTop: 16 }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  {['OMS #', 'Interface', 'Description', 'Curtailed MW', 'First start', 'Last end', 'Status'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', fontWeight: 500, color: C.muted, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 10px', borderBottom: `1px solid ${C.line}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOutages.map((o) => (
                  <tr key={o.oms_number ?? o.record_id}>
                    <td style={{ ...mono, padding: '9px 10px', borderBottom: `1px solid ${C.line}` }}>{o.oms_number}</td>
                    <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}` }}>{o.ti_id}</td>
                    <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}`, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.description}</td>
                    <td style={{ ...mono, padding: '9px 10px', borderBottom: `1px solid ${C.line}`, color: (o.max_curtailed_mw ?? 0) > 500 ? C.amber : C.text }}>{o.max_curtailed_mw ?? '—'}</td>
                    <td style={{ ...mono, padding: '9px 10px', borderBottom: `1px solid ${C.line}` }}>{fmt(o.first_start)}</td>
                    <td style={{ ...mono, padding: '9px 10px', borderBottom: `1px solid ${C.line}` }}>{fmt(o.last_end)}</td>
                    <td style={{ padding: '9px 10px', borderBottom: `1px solid ${C.line}` }}>
                      <span style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
                        background: o.display_status === 'active' ? C.amberDim : o.display_status === 'upcoming' ? C.tealDim : C.line,
                        color: o.display_status === 'active' ? C.amber : o.display_status === 'upcoming' ? C.teal : C.muted,
                      }}>{o.display_status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredOutages.length === 0 && (
              <div style={{ color: C.muted, fontSize: 13, padding: '16px 0', textAlign: 'center' }}>No {outageTab} outages.</div>
            )}
          </div>
        </Panel>

        <Panel title={`Standing Path Limitations (${standingLimits.length})`} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
            Long-duration OTC derates (window &gt; 60 days) — persistent transfer-capability limits,
            shown separately from operational outages.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {standingLimits.map((o) => (
              <div key={o.oms_number ?? o.record_id} style={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 4, padding: '10px 12px', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                  <b>{o.ti_id}</b>
                  <span style={{ ...mono, color: (o.max_curtailed_mw ?? 0) > 500 ? C.amber : C.muted }}>{o.max_curtailed_mw ?? '—'} MW</span>
                </div>
                <div style={{ color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.description}</div>
                <div style={{ ...mono, fontSize: 10, color: C.muted, marginTop: 4 }}>{fmt(o.first_start)} → {fmt(o.last_end)}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Explainer />

        <div style={{ marginTop: 20, fontSize: 11, color: C.muted, textAlign: 'center' }}>
          Source: CAISO OASIS (PRC_NOMOGRAM, PRC_CNSTR, TRNS_OUTAGE) · Shadow prices in $/MWh,
          shown as reported by CAISO (signs vary by constraint type; ranked by magnitude) ·
          DAM values are the current hour&apos;s interval, with the day&apos;s peak shown alongside ·
          Map pin positions are approximate
        </div>
      </div>
    </div>
  );
}
