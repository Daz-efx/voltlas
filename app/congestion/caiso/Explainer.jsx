// app/congestion/caiso/Explainer.jsx
// SEO/educational prose rendered below the dashboard. This text is what
// search engines index and rank. Imported by page.jsx; renders via SSR.
// Reviewed for market-ops accuracy 2026-07-12 (branch/nomogram taxonomy,
// LMP expansion, sign-convention wording).

const C = {
  ink: '#0A0D10', panel: '#12171C', line: '#1E262C',
  text: '#E7ECEF', muted: '#7C8790', teal: '#2DD4BF',
};

const h2 = {
  fontFamily: "'Space Grotesk', system-ui, sans-serif",
  fontSize: 22, color: C.text, margin: '40px 0 14px',
};
const p = {
  fontSize: 15, lineHeight: 1.75, color: C.muted, margin: '0 0 16px', maxWidth: 780,
};
const em = { color: C.text };

export default function Explainer() {
  return (
    <section style={{ marginTop: 48, paddingTop: 32, borderTop: `1px solid ${C.line}` }}>
      <h2 style={{ ...h2, marginTop: 0 }}>What this page shows</h2>
      <p style={p}>
        This monitor tracks <span style={em}>transmission congestion in the California ISO
        (CAISO) market</span>{' '}using two official data feeds: constraint shadow prices from
        the day-ahead (DAM) and real-time (RTM) markets, and transmission outage curtailments
        on the interties that connect CAISO to neighboring grids. Both are pulled automatically
        from CAISO&apos;s OASIS system and refreshed throughout the day. There is no login, no
        paywall, and no modeled or estimated data — every number on this page comes from
        CAISO&apos;s own published market results.
      </p>

      <h2 style={h2}>What is a shadow price?</h2>
      <p style={p}>
        When CAISO clears its market, it solves an optimization problem: serve forecast demand at
        the lowest total cost, subject to the physical limits of the transmission system. A
        <span style={em}> shadow price</span> is the mathematical byproduct of that optimization —
        for each transmission constraint, it measures how much total system cost would change if
        that limit were relaxed by one megawatt. A constraint with a shadow price of zero is not
        limiting anything. A constraint with a large shadow price is <span style={em}>binding</span>:
        the grid is pushed up against that limit, and the market is paying real money to route
        around it. Shadow prices are the root cause behind locational marginal price (LMP)
        spreads — when you see a large price separation between two CAISO zones, a binding
        constraint with a significant shadow price is usually why.
      </p>

      <h2 style={h2}>Why are some shadow prices negative?</h2>
      <p style={p}>
        The sign is an accounting convention from the underlying optimization, not a market
        anomaly. In the convention CAISO uses for this report, a negative value on a binding
        constraint means that adding one more megawatt of transfer capability would{' '}
        <span style={em}>reduce</span>{' '}total system cost by that amount — a shadow price of
        &minus;$15/MWh reads as &ldquo;this limit is costing the system $15 for every megawatt it
        holds back.&rdquo; Different constraint types in the same report can carry different sign
        conventions, which is why this page ranks constraints by <span style={em}>magnitude</span>:
        the absolute value is the primary severity signal, regardless of sign. The raw signed
        value is shown exactly as CAISO reports it.
      </p>

      <h2 style={h2}>Interties, curtailments, and standing limitations</h2>
      <p style={p}>
        CAISO imports and exports power across major interties — the California&ndash;Oregon
        Intertie (COI/Malin) to the Pacific Northwest, paths to the Desert Southwest, and
        others. Each has an operating transfer capability (OTC), and when equipment is out for
        maintenance or forced out of service, that capability is <span style={em}>curtailed</span>.
        The outage table on this page shows those curtailments in megawatts, sourced from
        CAISO&apos;s transmission outage feed and grouped by outage record. A 1,500&nbsp;MW
        curtailment on a major path is a materially different event from a 20&nbsp;MW one, so the
        table sorts by curtailed capacity. Long-duration limits — derates that persist for months
        or years rather than days — are separated into a <span style={em}>standing path
        limitations</span> section, so the operational outage view stays readable.
      </p>

      <h2 style={h2}>How traders and analysts use this</h2>
      <p style={p}>
        Congestion is one of the primary drivers of short-term electricity price behavior in
        CAISO. A binding intertie constraint changes import economics for the entire system;
        a multi-day curtailment on COI reshapes the supply stack in Northern California.
        Watching which constraints bind, at what shadow price, and which outages are scheduled
        over the coming weeks gives context for LMP spreads, congestion revenue right (CRR)
        positions, and day-ahead versus real-time divergence. This page is designed for that
        morning scan: the ranked list answers &ldquo;what is binding right now and how badly,&rdquo;
        and the outage log answers &ldquo;what capability is offline and until when.&rdquo;
      </p>

      <h2 style={h2}>Data sources and caveats</h2>
      <p style={p}>
        Constraint shadow prices come from CAISO OASIS report PRC_CNSTR (day-ahead and real-time
        markets); outage and curtailment data come from the OASIS transmission outage feed. Data
        refreshes automatically on a schedule of roughly every 15&ndash;60 minutes. This feed
        currently covers scheduling constraints — predominantly interties — and does not yet
        include CAISO&apos;s internal branch or nomogram constraints. Map pin positions are
        approximate corridor locations for orientation, not surveyed coordinates. This page is
        informational only and is not trading, financial, or operational advice.
      </p>
    </section>
  );
}
