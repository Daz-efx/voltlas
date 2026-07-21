// app/congestion/caiso/layout.jsx
// Server component wrapper: holds route metadata (the client page.jsx
// cannot export metadata). The OG image is picked up automatically from
// opengraph-image.jsx in this folder via Next.js file conventions.

export const metadata = {
  title: 'CAISO Congestion Monitor — Live Constraint Shadow Prices & Transmission Outages | Voltlas',
  description:
    'Live CAISO congestion: shadow prices on internal transmission lines, transformers, and nomograms, plus intertie scheduling limits and outage curtailments. Day-ahead and real-time, from CAISO OASIS.',
  keywords: [
    'CAISO congestion',
    'branch constraints',
    'nomogram',
    'CAISO internal congestion',
    'shadow prices',
    'transmission constraints',
    'intertie curtailment',
    'CAISO OASIS',
    'binding constraints',
    'transmission outages',
    'COI Malin',
    'electricity trading',
    'grid congestion',
  ],
  alternates: {
    canonical: 'https://voltlas.com/congestion/caiso',
  },
  openGraph: {
    title: 'CAISO Congestion Monitor — Live Shadow Prices & Outages',
    description:
      'Which CAISO constraints are binding right now, what they cost in $/MWh, and which intertie outages are driving them. Free, no login, from official OASIS data.',
    url: 'https://voltlas.com/congestion/caiso',
    siteName: 'Voltlas',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CAISO Congestion Monitor — Live Shadow Prices & Outages',
    description:
      'Binding constraints, shadow prices, and intertie curtailments from CAISO OASIS — updated automatically.',
  },
};

export default function CongestionCaisoLayout({ children }) {
  return children;
}
