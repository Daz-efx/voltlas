// app/congestion/caiso/Explainer.jsx
// SEO/educational prose rendered below the dashboard.
// Revised 2026-07-19: internal (branch/transformer/nomogram) constraints added.

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
        (CAISO) market</span>{' '}using three official data feeds: shadow prices on CAISO&apos;s
        internal constraints (transmission lines, transformers, and operating nomograms),
        shadow prices on the scheduling constraints that govern the interties to neighboring
        grids, and transmission outage curtailments. All three come from CAISO&apos;s OASIS
        system and refresh automatically. There is no login, no paywall, and no modeled or
        estimated data — every number here comes from CAISO&apos;s own published market results.
      </p>

      <h2 style={h2}>What is a shadow price?</h2>
      <p style={p}>
        When CAISO clears its market, it solves an optimization problem: serve forecast demand at
        the lowest total cost, subject to the physical limits of the transmission system. A
        <span style={em}> shadow price</span> is the mathematical byproduct of that optimization —
        for each constraint, it measures how much total system cost would change if that limit
        were relaxed by one megawatt. A constraint with a shadow price of zero is not limiting
        anything. A constraint with a large shadow price is <span style={em}>binding</span>: the
        grid is pushed up against that limit, and the market is paying real money to route around
        it. Shadow prices are the root cause behind locational marginal price (LMP) spreads —
        when you see a large price separation between two locations, a binding constraint with a
        significant shadow price is usually why.
      </p>

      <h2 style={h2}>Internal constraints vs. intertie constraints</h2>
      <p style={p}>
        The <span style={em}>Internal</span>{' '}tab shows congestion inside the CAISO footprint:
        individual transmission lines (branch constraints, shown as a line between two substations
        at a given voltage), transformer banks, multi-element operating
        <span style={em}> nomograms</span>, and constraints created by specific outages. This is
        where the largest shadow prices usually appear — a single loaded 70&nbsp;kV or 115&nbsp;kV
        line can clear at hundreds of dollars per megawatt-hour during a local peak.
      </p>
      <p style={p}>
        The <span style={em}>Interties</span>{' '}tab shows scheduling constraints on the paths in and
        out of CAISO — the California&ndash;Oregon Intertie (COI/Malin), the Nevada&ndash;Oregon
        Border DC line, paths to the Desert Southwest, and others. These bind less often and at
        smaller magnitudes, but they move whole-system import economics when they do.
      </p>

      <h2 style={h2}>Why are some shadow prices negative?</h2>
      <p style={p}>
        The sign is an accounting convention from the underlying optimization, not a market
        anomaly. In the convention CAISO uses for these reports, a negative value on a binding
        constraint means that adding one more megawatt of capability would{' '}
        <span style={em}>reduce</span>{' '}total system cost by that amount — a shadow price of
        &minus;$15/MWh reads as &ldquo;this limit is costing the system $15 for every megawatt it
        holds back.&rdquo; Different constraint types carry different sign conventions, which is
        why this page ranks by <span style={em}>magnitude</span>: the absolute value is the
        primary severity signal, regardless of sign. The raw signed value is shown exactly as
        CAISO reports it.
      </p>

      <h2 style={h2}>Day-ahead values: current hour and daily peak</h2>
      <p style={p}>
        The day-ahead market publishes an entire operating day at once, so a single DAM constraint
        has a different shadow price in every hour. This page shows the{' '}
        <span style={em}>current hour&apos;s</span> value as the headline number, with the
        <span style={em}> day&apos;s peak</span> and the hour it occurs shown alongside when the
        two differ meaningfully. That combination answers both questions a morning scan needs:
        what is binding right now, and how much worse does today get. Real-time (RTM) values are
        the most recent published interval.
      </p>

      <h2 style={h2}>Interties, curtailments, and standing limitations</h2>
      <p style={p}>
        Each intertie has an operating transfer capability (OTC), and when equipment is out for
        maintenance or forced out of service, that capability is <span style={em}>curtailed</span>.
        The outage table shows those curtailments in megawatts, sourced from CAISO&apos;s
        transmission outage feed and grouped by outage record. A 1,500&nbsp;MW curtailment on a
        major path is a materially different event from a 20&nbsp;MW one, so the table sorts by
        curtailed capacity. Long-duration limits — derates that persist for months or years rather
        than days — are separated into a <span style={em}>standing path limitations</span> section,
        so the operational outage view stays readable.
      </p>

      <h2 style={h2}>How traders and analysts use this</h2>
      <p style={p}>
        Congestion is one of the primary drivers of short-term electricity price behavior in
        CAISO. A binding internal branch reshapes local LMPs and can strand generation behind it;
        a multi-day curtailment on COI reshapes the supply stack across Northern California.
        Watching which constraints bind, at what shadow price, and which outages are scheduled
        over the coming weeks gives context for LMP spreads, congestion revenue right (CRR)
        positions, and day-ahead versus real-time divergence. The ranked list answers &ldquo;what
        is binding right now and how badly,&rdquo; and the outage log answers &ldquo;what
        capability is offline and until when.&rdquo;
      </p>

      <h2 style={h2}>Data sources and caveats</h2>
      <p style={p}>
        Internal constraint shadow prices come from CAISO OASIS report PRC_NOMOGRAM; intertie
        scheduling constraint prices from PRC_CNSTR; outage and curtailment data from the OASIS
        transmission outage feed — all for both day-ahead and real-time markets. Data refreshes
        automatically, typically every 15&ndash;60 minutes. Constraint display names are parsed
        from CAISO&apos;s internal identifiers, so substation abbreviations reflect CAISO&apos;s
        naming rather than utility conventions. Map pins cover interties only; internal branch,
        transformer, and nomogram constraints are listed but not geocoded. Outage-to-constraint
        linkage is available where CAISO tags a constraint with an outage reference. This page is
        informational only and is not trading, financial, or operational advice.
      </p>
    </section>
  );
}
