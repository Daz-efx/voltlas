# CAISO Congestion Monitor — Project Notes

_Last updated: 2026-07-11_

## Current state
- Live at voltlas.com/congestion, all known defects closed as of commit `947637a`
- Pipeline: GitHub Actions (`fetch-caiso.yml`) pulls PRC_CNSTR (DAM+RTM) and
  TRNS_OUTAGE from CAISO OASIS, commits JSON to `data/caiso/`
- Page fetches data client-side from raw.githubusercontent.com (deploys decoupled;
  Vercel Ignored Build Step skips data-only commits)
- Binding = |shadow_price| > 0.005; ranked by magnitude (CAISO reports mixed signs)

## Verified facts (hard-won, don't rediscover)
- PRC_CNSTR value column is `MW` = shadow price in $/MWh, verified against OASIS UI
- Signs are mixed by constraint type; OASIS UI also displays raw signed values
- TRNS_OUTAGE is an audit feed, no native outage ID; we key on OMS number
  parsed from OUTAGE_NOTES; windows >60 days classified as standing limitations
- `ti_id=ALL` does NOT filter PRC_CNSTR (tested); the report is inherently
  scheduling-constraint scoped, but NOT purely interties — see AMR-SND 138
  (+$193.15 RTM, 2026-07-11), a non-ITC constraint that ranked #1
- GitHub cron delivers ~30-60 min in practice, not the requested 15

## Open items
1. SEO layer (next): generateMetadata, OG image (existing ImageResponse pattern),
   sitemap entry, explainer prose (shadow prices, negative signs, curtailments)
2. Consider softening "every ~15 min" label to match observed cadence
3. PRC_NOMOGRAM ingestion — internal flowgate constraints (v2 data layer)
4. Map COORDS table only covers 7 interties; non-ITC constraints get no pin
   (graceful, but expand as new IDs appear)
5. Outage↔constraint linkage only matches where ti_id aligns (intertie-only)
6. Later: corridor weather overlay, curtailment/negative-price correlation,
   multi-ISO expansion (NYISO easiest first)
