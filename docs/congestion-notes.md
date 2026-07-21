# CAISO Congestion Monitor — Project Notes

_Last updated: 2026-07-20_

## Current state
- Live at voltlas.com/congestion/caiso (moved from /congestion, which now
  redirects — future multi-ISO hub structure)
- SEO layer COMPLETE: layout.jsx metadata, opengraph-image.jsx, Explainer.jsx
  prose, sitemap entry (hourly / 0.9)
- Pipeline: GitHub Actions (`fetch-caiso.yml`) pulls PRC_CNSTR (DAM+RTM) and
  TRNS_OUTAGE from CAISO OASIS, commits JSON to `data/caiso/`
- Page fetches data client-side from raw.githubusercontent.com (deploys
  decoupled; Vercel Ignored Build Step skips data-only commits)
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

## Added 2026-07-19/20
- PRC_NOMOGRAM pipeline live: CAISO INTERNAL constraints (branch, transformer,
  nomogram, outage-driven). This is where real congestion lives — observed
  $1,374/MWh on a 70 kV branch vs ~$65 worst-case on interties.
- NOMOGRAM_ID formats decoded (parser in fetch-caiso-nomogram.mjs):
  `{node}_{station}_{kV}_{node}_{station}_{kV}_BR_{ckt}` = line
  same shape with `_XF_` = transformer (note: kV fields can have leading spaces)
  `OMS_TL#####_OUTAGE_NG` = outage-driven, carries TL number
  `NNNN-CONTRL-NAME_EXP_NG` / `NNNN_NAME_NG` = nomogram
- FIXED: DAM interval selection. Was keeping the LATEST interval per market,
  which for DAM meant hour 24, not the current hour. Now picks the interval
  containing now, and also records the day's peak. Applies to both feeds.
- Dashboard: Internal/Intertie feed tabs (Internal default), class badges,
  current+peak display, scrollable list.
- FIXED: Leaflet grey tiles — container measured at init before layout settled.
  invalidateSize on rAF/250ms/1s + ResizeObserver.
- Per-constraint pages: /congestion/caiso/constraint/[slug], ~50 pages,
  generated from data/caiso/constraint-registry.json + index page + sitemap.
- Registry (build-constraint-registry.mjs) ACCUMULATES across runs (60-day
  retention) because constraint IDs churn and history trims at 14/30 days.
  Slugs are deterministic so URLs are stable.
- NOTE: nomogram-history is BINDING-ROWS-ONLY (volume guard), so binding_pct
  is null for internal constraints — we show counts, never a fake percentage.
- DEPLOY GATING: page SET is build-time (generateStaticParams from registry);
  page NUMBERS are live (client fetch). New constraints get pages only on
  deploy → weekly-deploy.yml fires a Vercel deploy hook Sundays 14:00 UTC.
  Hook URL lives in the VERCEL_DEPLOY_HOOK repo secret.

## Open items
1. ~~SEO layer~~ DONE 2026-07-12
2. ~~Domain review of Explainer.jsx~~ DONE 2026-07-12 (branch/nomogram taxonomy fix)
3. ~~Search Console indexing~~ REQUESTED 2026-07-19
4. Consider softening "every ~15 min" label to match observed cadence
5. ~~PRC_NOMOGRAM ingestion~~ DONE 2026-07-19
6. Map COORDS table only covers 7 interties; non-ITC constraints get no pin
   (graceful, but expand as new IDs appear)
7. Outage↔constraint linkage only matches where ti_id aligns (intertie-only)
8. Later: corridor weather overlay, curtailment/negative-price correlation,
   multi-ISO expansion (NYISO easiest first; ERCOT pairs with nomogram work)
