'use client';

// app/congestion/page.jsx
// CAISO Congestion Monitor — reads the real pipeline outputs:
//   constraints-current.json  { updated_at, constraints: { [id]: { constraint_name, markets:{}, worst:{} } } }
//   constraints-history.json  flat rows [{ interval_start, constraint_id, market, shadow_price, ... }]
//   outages.json              { updated_at, outages: { [oms]: { ti_id, description, windows:{}, category, display_status, max_curtailed_mw, ... } } }
//
// DATA_BASE: where the JSON lives at runtime. Because the pipeline commits
// every 15 min but the site build is manual, DO NOT import these JSONs
// statically — fetch at runtime. Two options:
//   a) copy/symlink data/caiso into public/data/caiso and use '/data/caiso'
//   b) fetch straight from raw.githubusercontent.com (works without redeploys)
// Set accordingly:
const DATA_BASE = 'https://raw.githubusercontent.com/Daz-efx/voltlas/main/data/caiso'; // or 'https://raw.githubusercontent.com/<user>/<repo>/main/data/caiso'

// Approximate display coordinates for known interties/interfaces.
// ILLUSTRATIVE positions, not surveyed. Interfaces not listed here still
// appear in lists/tables — they just don't get a map pin.
const COORDS = {
  COTPISO_ITC:    { lat: 40.6,  lng: -122.4, label: 'COTP (California–Oregon Transmission Project)' },
  MALIN500_ISL:   { lat: 42.0,  lng: -121.7, label: 'Malin 500 (COI)' },
  SUMMIT_ITC:     { lat: 39.3,  lng: -120.6, label: 'Summit (Drum–Summit)' },
  SILVERPK_ITC:   { lat: 37.75, lng: -118.1, label: 'Silver Peak' },
  CASCADE_ITC:    { lat: 41.2,  lng: -121.4, label: 'Cascade' },
  'ADLANTO-SP_ITC': { lat: 34.58, lng: -117.4, label: 'Adelanto–SP (Lugo–Victorville)' },
  ELDORADO_ITC:   { lat: 35.0,  lng: -114.9, label: 'Eldorado' },
};

import { useEffect, useMemo, useRef, useState } from 'react';

const C = {
  ink: '#0A0D10', panel: '#12171C', panel2: '#161C22', line: '#1E262C',
  text: '#E7ECEF', muted: '#7C8790', amber: '#FFB020', amberDim: '#5A4620',
  teal: '#2DD4BF', tealDim: '#1C4A45', red: '#FF5A5F',
};

const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace" };
const grotesk = { fontFamily: "'Space Grotesk', system-ui, sans-serif" };

function priceColor(price, binding) {
  if (!binding) return C.teal;
  return price > 50 ? C.red : C.amber;
}

// ---------- tiny dependency-free SVG line chart ----------
function Sparkline({ points, color }) {
  if (!points || points.length < 2) {
    return <div style={{ color: C.muted, fontSize: 12, padding: '16px 0' }}>Not enough history yet — chart appears after a few pipeline runs.</div>;
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
      <text x={PAD} y={12} fill={C.muted} fontSize="9" style={mono}>${max.toFixed(0)}</text>
      <text x={PAD} y={H - PAD - 2} fill={C.muted} fontSize="9" style={mono}>${min.toFixed(0)}</text>
    </svg>
  );
}

// ---------- panel chrome ----------
function Panel({ title, right, children, style }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 18, ...style }}>
      {title && (
        <div style={{ ...grotesk, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{title}</span>{right}
        </div>
      )}
      {children}
    </div>
  );
}

function TabRow({ tabs, active, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {tabs.map((t) => (
        <button key={t} onClick={() => onSelect(t)} style={{
          fontSize: 11, padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
          background: active === t ? C.panel2 : 'transparent',
          border: `1px solid ${active === t ? C.teal : C.line}`,
          color: active === t ? C.text : C.muted, fontFamily: 'inherit',
        }}>{t}</button>
      ))}
    </div>
  );
}

export default function CongestionPage() {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [outageData, setOutageData] = useState(null);
  const [error, setError] = useState(null);
  const [marketTab, setMarketTab] = useState('All');
  const [outageTab, setOutageTab] = useState('active');
  const [selectedId, setSelectedId] = useState(null);
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markersRef = useRef({});

  // ---------- data load ----------
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [cur, hist, out] = await Promise.all([
          fetch(`${DATA_BASE}/constraints-current.json`).then((r) => r.json()),
          fetch(`${DATA_BASE}/constraints-history.json`).then((r) => r.json()).catch(() => []),
          fetch(`${DATA_BASE}/outages.json`).then((r) => r.json()),
        ]);
        if (!alive) return;
        setCurrent(cur); setHistory(hist); setOutageData(out);
        // Default selection: worst constraint overall
        const ids = Object.keys(cur.constraints ?? {});
        if (ids.length) {
          const worstId = ids.reduce((a, b) =>
            (cur.constraints[a].worst?.shadow_price ?? 0) >= (cur.constraints[b].worst?.shadow_price ?? 0) ? a : b
          );
          setSelectedId(worstId);
        }
      } catch (e) {
        if (alive) setError(String(e));
      }
    }
    load();
    const t = setInterval(load, 5 * 60_000); // refresh every 5 min
    return () => { alive = false; clearInterval(t); };
  }, []);

  // ---------- derived: ranked list ----------
  const ranked = useMemo(() => {
    if (!current?.constraints) return [];
    const entries = Object.entries(current.constraints);
    if (marketTab === 'All') {
      // Worst-case dedup: one row per physical constraint (precomputed by pipeline)
      return entries
        .map(([id, c]) => ({ id, name: c.constraint_name, ...c.worst }))
        .filter((r) => r.shadow_price != null)
        .sort((a, b) => b.shadow_price - a.shadow_price);
    }
    return entries
      .filter(([, c]) => c.markets[marketTab])
      .map(([id, c]) => ({ id, name: c.constraint_name, ...c.markets[marketTab] }))
      .sort((a, b) => b.shadow_price - a.shadow_price);
  }, [current, marketTab]);

  // ---------- derived: outage lists ----------
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
    () => discreteOutages.filter((o) => outageTab === 'all' ? true : o.display_status === outageTab),
    [discreteOutages, outageTab]
  );

  // ---------- derived: selected constraint detail ----------
  const selected = selectedId && current?.constraints?.[selectedId]
    ? { id: selectedId, ...current.constraints[selectedId] } : null;

  const selectedHistory = useMemo(() => {
    if (!selected || !Array.isArray(history)) return [];
    return history
      .filter((h) => h.constraint_id === selected.id)
      .sort((a, b) => a.interval_start.localeCompare(b.interval_start))
      .slice(-96) // last ~24h at 15-min cadence
      .map((h) => ({ t: h.interval_start, v: h.shadow_price }));
  }, [history, selected]);

  // Outages on the same interface as the selected constraint (best-effort:
  // constraint IDs and outage TI_IDs only align for intertie constraints)
  const relatedOutages = useMemo(() => {
    if (!selected) return [];
    return [...discreteOutages, ...standingLimits].filter((o) => o.ti_id === selected.id);
  }, [selected, discreteOutages, standingLimits]);

  // ---------- Leaflet (CDN, client-only) ----------
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    const cssId = 'leaflet-css';
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link');
      link.id = cssId; link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(link);
    }
    const scriptId = 'leaflet-js';
    function init() {
      const L = window.L;
      if (!L || leafletMap.current) return;
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView([37.5, -119.8], 5.4);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 10, minZoom: 5 }).addTo(map);
      leafletMap.current = map;
    }
    if (window.L) init();
    else if (!document.getElementById(scriptId)) {
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = init;
      document.body.appendChild(s);
    }
  }, []);

  // Redraw markers when data changes: constraint pins + active-outage pins
  useEffect(() => {
    const L = window.L;
    const map = leafletMap.current;
    if (!L || !map) return;
    Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
    markersRef.current = {};

    // Constraint pins (only those with known coords)
    for (const r of ranked) {
      const coord = COORDS[r.id];
      if (!coord) continue;
      const radius = 6 + Math.min(12, (r.shadow_price ?? 0) / 8);
      const m = L.circleMarker([coord.lat, coord.lng], {
        radius, color: C.ink, weight: 2,
        fillColor: priceColor(r.shadow_price, r.binding), fillOpacity: 0.9,
      }).addTo(map);
      m.bindPopup(`<b>${r.name}</b><br/>$${(r.shadow_price ?? 0).toFixed(2)}/MWh · ${r.binding ? 'Binding' : 'Not binding'}`);
      m.on('click', () => setSelectedId(r.id));
      markersRef.current[`c-${r.id}`] = m;
    }
    // Active outage pins (hollow amber rings), skip if a constraint pin is already there
    for (const o of discreteOutages.filter((o) => o.display_status === 'active')) {
      const coord = COORDS[o.ti_id];
      if (!coord || markersRef.current[`c-${o.ti_id}`]) continue;
      const m = L.circleMarker([coord.lat, coord.lng], {
        radius: 8, color: C.amber, weight: 2, fillColor: 'transparent', fillOpacity: 0,
      }).addTo(map);
      m.bindPopup(`<b>${coord.label}</b><br/>Outage: ${String(o.description).slice(0, 60)}<br/>${o.max_curtailed_mw ?? '?'} MW curtailed`);
      markersRef.current[`o-${o.ti_id}-${o.oms_number}`] = m;
    }
  }, [ranked, discreteOutages]);

  // ---------- render ----------
  if (error) return <div style={{ background: C.ink, color: C.red, minHeight: '100vh', padding: 40, ...mono }}>Data load failed: {error}<br/><br/>Check DATA_BASE path in page.jsx.</div>;

  const bindingCount = ranked.filter((r) => r.binding).length;
  const activeOutageCount = discreteOutages.filter((o) => o.display_status === 'active').length;
  const fmt = (ts) => ts ? ts.replace('T', ' ').slice(0, 16) : '—';

  return (
    <div style={{ background: C.ink, color: C.text, minHeight: '100vh', padding: 24, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        {/* Header */}
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
              Updated {current ? fmt(current.updated_at) : '…'} UTC · every ~15 min
            </span>
          </div>
        </header>

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,0.9fr)', gap: 16, alignItems: 'start' }}>
          <Panel title="Constraint & Intertie Map" right={<span style={{ ...mono, color: C.muted, fontSize: 10 }}>PIN POSITIONS APPROXIMATE</span>}>
            <div ref={mapRef} style={{ width: '100%', height: 440, borderRadius: 4, border: `1px solid ${C.line}` }} />
            <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: 11, color: C.muted, flexWrap: 'wrap' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: C.teal, marginRight: 6 }} />Not binding</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: C.amber, marginRight: 6 }} />Binding</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: C.red, marginRight: 6 }} />High shadow price</span>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: `2px solid ${C.amber}`, marginRight: 6 }} />Active outage</span>
            </div>
          </Panel>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Panel title="Top Constraints Right Now" right={<TabRow tabs={['All', 'DAM', 'RTM', 'HASP']} active={marketTab} onSelect={setMarketTab} />}>
              {ranked.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: '16px 0', textAlign: 'center' }}>No constraints in this market right now.</div>}
              {ranked.map((r, i) => (
                <div key={`${r.id}-${r.market}`} onClick={() => setSelectedId(r.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px', cursor: 'pointer',
                  borderBottom: `1px solid ${C.line}`, borderLeft: selectedId === r.id ? `2px solid ${C.teal}` : '2px solid transparent',
                  background: selectedId === r.id ? C.panel2 : 'transparent', borderRadius: 4,
                }}>
                  <span style={{ ...mono, fontSize: 11, color: C.muted, width: 18, textAlign: 'right' }}>{i + 1}</span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: priceColor(r.shadow_price, r.binding), flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12.5 }}>
                    {r.name}
                    <span style={{ fontSize: 10, color: C.muted, display: 'block' }}>{r.market}{r.binding ? ' · binding' : ''}{r.contingency_id ? ` · ${r.contingency_id}` : ''}</span>
                  </span>
                  <span style={{ ...mono, fontSize: 13, fontWeight: 600, color: priceColor(r.shadow_price, r.binding) }}>${(r.shadow_price ?? 0).toFixed(2)}</span>
                </div>
              ))}
            </Panel>

            <Panel title="Constraint Detail">
              {!selected && <div style={{ color: C.muted, fontSize: 13, padding: '16px 0', textAlign: 'center' }}>Select a constraint.</div>}
              {selected && (() => {
                const w = selected.worst ?? {};
                const col = priceColor(w.shadow_price, w.binding);
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                      <div>
                        <h2 style={{ ...grotesk, fontSize: 16, margin: '0 0 4px' }}>{selected.constraint_name}</h2>
                        <div style={{ ...mono, fontSize: 11, color: C.muted }}>{selected.id} · worst: {w.market}</div>
                      </div>
                      <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, background: w.binding ? C.amberDim : C.tealDim, color: w.binding ? C.amber : C.teal }}>
                        {w.binding ? 'Binding' : 'Not binding'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 22, marginBottom: 12, flexWrap: 'wrap' }}>
                      {Object.entries(selected.markets).map(([mkt, row]) => (
                        <div key={mkt}>
                          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{mkt}</div>
                          <div style={{ ...mono, fontSize: 18, fontWeight: 600, color: priceColor(row.shadow_price, row.binding) }}>${row.shadow_price.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                    <Sparkline points={selectedHistory} color={col} />
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.line}`, fontSize: 12 }}>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Related outages (same interface)</div>
                      {relatedOutages.length === 0 && <div style={{ color: C.muted }}>None on record. <span style={{ fontSize: 10 }}>(Linkage currently covers intertie constraints only.)</span></div>}
                      {relatedOutages.map((o) => (
                        <div key={o.oms_number} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px dashed ${C.line}`, color: C.muted }}>
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

        {/* Intertie outage log */}
        <Panel title="Intertie Outages & Curtailments" right={<TabRow tabs={['active', 'upcoming', 'completed', 'all']} active={outageTab} onSelect={setOutageTab} />} style={{ marginTop: 16 }}>
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
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
                        background: o.display_status === 'active' ? C.amberDim : o.display_status === 'upcoming' ? C.tealDim : C.line,
                        color: o.display_status === 'active' ? C.amber : o.display_status === 'upcoming' ? C.teal : C.muted }}>
                        {o.display_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredOutages.length === 0 && <div style={{ color: C.muted, fontSize: 13, padding: '16px 0', textAlign: 'center' }}>No {outageTab} outages.</div>}
          </div>
        </Panel>

        {/* Standing limitations */}
        <Panel title={`Standing Path Limitations (${standingLimits.length})`} style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
            Long-duration OTC derates (window &gt; 60 days) — persistent transfer-capability limits, shown separately from operational outages.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {standingLimits.map((o) => (
              <div key={o.oms_number ?? o.record_id} style={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 4, padding: '10px 12px', fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <b>{o.ti_id}</b>
                  <span style={{ ...mono, color: (o.max_curtailed_mw ?? 0) > 500 ? C.amber : C.muted }}>{o.max_curtailed_mw ?? '—'} MW</span>
                </div>
                <div style={{ color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.description}</div>
                <div style={{ ...mono, fontSize: 10, color: C.muted, marginTop: 4 }}>{fmt(o.first_start)} → {fmt(o.last_end)}</div>
              </div>
            ))}
          </div>
        </Panel>

        <div style={{ marginTop: 20, fontSize: 11, color: C.muted, textAlign: 'center' }}>
          Source: CAISO OASIS (PRC_CNSTR, TRNS_OUTAGE) · Shadow prices in $/MWh · Outage feed covers interties/scheduling limits; internal network outages not yet included · Map pin positions are approximate
        </div>
      </div>
    </div>
  );
}
