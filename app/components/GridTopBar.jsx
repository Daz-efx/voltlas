// app/components/GridTopBar.jsx
// Slim site bar shown above every grid page (congestion + interconnection) via
// app/congestion/layout.jsx and app/interconnection/layout.jsx. Gives a way
// back to the homepage and between the grid pages without the browser Back button.

import Link from 'next/link';

const C = { ink: '#0A0D10', line: '#1E262C', text: '#E7ECEF', muted: '#7C8790' };

const LINKS = [
  ['/congestion/caiso', 'CAISO congestion'],
  ['/congestion/ercot', 'ERCOT congestion'],
  ['/interconnection/ercot', 'ERCOT queue'],
];

export default function GridTopBar() {
  return (
    <div style={{ background: C.ink, borderBottom: `1px solid ${C.line}`, padding: '12px 24px', fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px 20px' }}>
        <Link href="/" aria-label="Voltlas home" style={{ color: C.text, textDecoration: 'none', fontSize: 14, fontWeight: 700, letterSpacing: '0.08em' }}>
          ← VOLTLAS <span style={{ color: C.muted, fontWeight: 400, letterSpacing: 0 }}>home</span>
        </Link>
        <nav aria-label="Grid pages" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} style={{ color: C.muted, textDecoration: 'none', fontSize: 12.5 }}>{label}</Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
