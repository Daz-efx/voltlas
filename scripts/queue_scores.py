#!/usr/bin/env python3
"""
Voltlas — Interconnection Queue Explorer + County Siting Score (v1.1)

Pulls public ISO generation interconnection queues via `gridstatus`,
normalizes them, and computes a county-level large-load siting signal.

Outputs (default ./public/data/queue/):
  projects_<iso>.json   normalized project rows (explorer table)
  counties.json         county metrics + score (map / ranking)
  meta.json             run info + per-ISO data-coverage diagnostics

Usage:
  python scripts/queue_scores.py --isos ercot pjm
  python scripts/queue_scores.py --sample          # offline synthetic test

EPISTEMIC NOTES:
  * GENERATION queues, not large-load queues: the score is a proxy for grid
    conditions, not a load-capacity determination.
  * Generation-pocket logic is an unvalidated heuristic; load centers (e.g.
    Bexar) can rank high on raw MW. Validate against LMP congestion.
  * ERCOT's GIS report under-reports withdrawals (222 withdrawn vs 606
    completed in the Nov 2026 pull), so raw completion rates are biased up.
    v1.1 shrinks completion rate toward the ISO mean (Beta prior) so counties
    with few decided projects can't score a fake 100%.
  * Actual Completion Date is sparse (ERCOT: 123 of 606 completed), so the
    speed metric needs >= MIN_SPEED_SAMPLES dated projects or goes neutral.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

DEFAULT_ISOS = ["ercot", "pjm"]

WEIGHTS = {
    "gen_pocket": 0.30,       # active + completed MW (likely export pocket)
    "completion_rate": 0.25,  # shrunk share of decided projects reaching COD
    "speed": 0.20,            # faster median queue -> COD
    "firm_share": 0.15,       # gas/storage share of active MW
    "momentum": 0.10,         # MW queued in last 24 months
}
MIN_PROJECTS = 5          # decided projects below this -> low_confidence flag
PRIOR_STRENGTH = 8        # pseudo-projects in completion-rate Beta prior
MIN_SPEED_SAMPLES = 3     # dated completions needed for a speed metric

# Firm/dispatchable detection over Generation Type + Fuel + Technology.
# Whole-word match so short ERCOT codes (GAS, CC, GT, BA...) don't over-match.
# Unverified against every ISO's code list — check firm_share in output.
FIRM_RE = re.compile(
    r"\b(?:gas|natural gas|ng|storage|battery|bess|bat|ba|nuclear|nuc|"
    r"combined[- ]cycle|cc|fuel oil|hydrogen|water|combustion turbine|ct|gt|steam|st|ic)\b"
)

COLMAP = {
    "Queue ID": "queue_id",
    "Project Name": "project_name",
    "Interconnecting Entity": "developer",
    "County": "county",
    "State": "state",
    "Interconnection Location": "poi",
    "Transmission Owner": "transmission_owner",
    "Generation Type": "gen_type",
    "Fuel": "fuel",
    "Technology": "technology",
    "Capacity (MW)": "mw",
    "Queue Date": "queue_date",
    "Status": "status",
    "Proposed Completion Date": "proposed_cod",
    "Actual Completion Date": "actual_cod",
    "Withdrawn Date": "withdrawn_date",
}
REQUIRED = ["queue_id", "county", "state", "mw", "status"]

STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "district of columbia": "DC",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL",
    "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
    "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI",
    "minnesota": "MN", "mississippi": "MS", "missouri": "MO", "montana": "MT",
    "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
    "ohio": "OH", "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", "tennessee": "TN",
    "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
}


def norm_state(s: pd.Series) -> pd.Series:
    t = s.astype(str).str.strip()
    mapped = t.str.lower().map(STATES)
    return mapped.fillna(t.str.upper())


# ------------------------------------------------------------- fetching ---

def fetch_queue(iso_id: str) -> pd.DataFrame:
    import gridstatus
    iso = gridstatus.get_iso(iso_id)()
    print(f"[fetch] {iso_id}: downloading queue ...", flush=True)
    df = iso.get_interconnection_queue()
    print(f"[fetch] {iso_id}: {len(df):,} rows, {len(df.columns)} cols", flush=True)
    return df


def sample_queue(iso_id: str, n: int = 1500, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed + sum(map(ord, iso_id)))
    counties = [f"County{i:02d}" for i in range(40)]
    state = {"ercot": "Texas", "pjm": "Virginia"}.get(iso_id, "XX")
    types = ["Solar", "Wind", "Battery Storage", "Gas", "Solar", "Battery Storage"]
    qd = pd.Series(pd.Timestamp("2015-01-01")
                   + pd.to_timedelta(rng.integers(0, 3900, n), unit="D"))
    status = rng.choice(["Active", "Withdrawn", "Completed"], n, p=[0.6, 0.1, 0.3])
    cod = qd + pd.to_timedelta(rng.integers(500, 2400, n), unit="D")
    has_cod = (status == "Completed") & (rng.random(n) < 0.25)  # sparse, like ERCOT
    qd = qd.where(rng.random(n) > 0.1)                          # ~10% missing
    return pd.DataFrame({
        "Queue ID": [f"{iso_id.upper()}-{i}" for i in range(n)],
        "Project Name": [f"Project {i}" for i in range(n)],
        "County": rng.choice(counties, n, p=np.r_[np.full(10, 0.05), np.full(30, 0.5 / 30)]),
        "State": state,
        "Generation Type": rng.choice(types, n),
        "Capacity (MW)": rng.gamma(2.0, 90.0, n).round(1),
        "Queue Date": qd,
        "Status": status,
        "Actual Completion Date": cod.where(has_cod),
    })


# ---------------------------------------------------------- normalizing ---

def normalize(raw: pd.DataFrame, iso_id: str) -> pd.DataFrame:
    df = raw.rename(columns={k: v for k, v in COLMAP.items() if k in raw.columns})
    df = df.loc[:, ~df.columns.duplicated()]
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise SystemExit(
            f"[normalize] {iso_id}: missing columns {missing}.\n"
            f"Available: {list(raw.columns)}\nUpdate COLMAP."
        )

    idx = df.index
    blank = pd.Series("", index=idx)
    nat = pd.Series(pd.NaT, index=idx)

    def col(name, default):
        return df[name] if name in df else default

    type_text = (col("gen_type", blank).fillna("").astype(str) + " | "
                 + col("fuel", blank).fillna("").astype(str) + " | "
                 + col("technology", blank).fillna("").astype(str)).str.lower()

    out = pd.DataFrame({
        "iso": iso_id.upper(),
        "queue_id": df["queue_id"].astype(str),
        "project_name": col("project_name", blank).fillna("").astype(str),
        "county": df["county"].astype(str).str.strip().str.title()
                    .str.replace(r"\s+County$", "", regex=True),
        "state": norm_state(df["state"]),
        "gen_type": col("gen_type", pd.Series("Unknown", index=idx)).fillna("Unknown").astype(str),
        "is_firm": type_text.str.contains(FIRM_RE),
        "mw": pd.to_numeric(df["mw"], errors="coerce"),
        "status": df["status"].astype(str).str.lower(),
        "queue_date": pd.to_datetime(col("queue_date", nat), errors="coerce"),
        "actual_cod": pd.to_datetime(col("actual_cod", nat), errors="coerce"),
        "poi": col("poi", blank).fillna("").astype(str),
    })

    s = out["status"]
    out["bucket"] = np.select(
        [s.str.contains("withdraw|cancel|suspend"),
         s.str.contains("complet|operat|in service|commercial")],
        ["withdrawn", "completed"],
        default="active",
    )
    out["multi_county"] = out["county"].str.contains(r"[/,;&]")
    out["county"] = out["county"].str.split(r"\s*[/,;&]\s*").str[0]

    out = out[out["mw"].gt(0) & ~out["county"].isin(["", "Nan", "None"])]
    return out.reset_index(drop=True)


def coverage(p: pd.DataFrame) -> dict:
    """Data-quality diagnostics, published in meta.json."""
    b = p["bucket"].value_counts()
    comp = p["bucket"] == "completed"
    return {
        "rows": int(len(p)),
        "active": int(b.get("active", 0)),
        "completed": int(b.get("completed", 0)),
        "withdrawn": int(b.get("withdrawn", 0)),
        "completed_with_actual_cod": int(p.loc[comp, "actual_cod"].notna().sum()),
        "queue_date_coverage": round(float(p["queue_date"].notna().mean()), 3),
        "firm_share_of_rows": round(float(p["is_firm"].mean()), 3),
        "multi_county_rows": int(p["multi_county"].sum()),
    }


# -------------------------------------------------------------- scoring ---

def county_metrics(p: pd.DataFrame, now: pd.Timestamp) -> pd.DataFrame:
    p = p.copy()
    act, comp, wd = (p["bucket"] == b for b in ("active", "completed", "withdrawn"))
    recent = p["queue_date"] >= now - pd.DateOffset(months=24)

    p["active_mw"] = p["mw"].where(act, 0)
    p["completed_mw"] = p["mw"].where(comp, 0)
    p["firm_active_mw"] = p["mw"].where(act & p["is_firm"], 0)
    p["recent_mw"] = p["mw"].where(recent, 0)
    p["n_completed"] = comp.astype(int)
    p["n_withdrawn"] = wd.astype(int)
    p["cod_days"] = (p["actual_cod"] - p["queue_date"]).dt.days.where(comp)

    m = p.groupby(["iso", "state", "county"]).agg(
        n_projects=("queue_id", "size"),
        active_mw=("active_mw", "sum"),
        completed_mw=("completed_mw", "sum"),
        firm_active_mw=("firm_active_mw", "sum"),
        recent_mw=("recent_mw", "sum"),
        n_completed=("n_completed", "sum"),
        n_withdrawn=("n_withdrawn", "sum"),
        n_speed_samples=("cod_days", "count"),
        median_days_to_cod=("cod_days", "median"),
    ).reset_index()

    # Completion rate, Beta-shrunk toward the ISO-wide rate (project counts)
    m["n_decided"] = m["n_completed"] + m["n_withdrawn"]
    iso_tot = m.groupby("iso")[["n_completed", "n_decided"]].transform("sum")
    prior = (iso_tot["n_completed"] / iso_tot["n_decided"]).fillna(0.5)
    m["completion_rate_raw"] = (m["n_completed"] / m["n_decided"]).where(m["n_decided"] > 0)
    m["completion_rate"] = ((m["n_completed"] + PRIOR_STRENGTH * prior)
                            / (m["n_decided"] + PRIOR_STRENGTH))

    m.loc[m["n_speed_samples"] < MIN_SPEED_SAMPLES, "median_days_to_cod"] = np.nan
    m["firm_share"] = (m["firm_active_mw"] / m["active_mw"]).where(m["active_mw"] > 0, 0.0)
    m["gen_pocket_mw"] = m["active_mw"] + m["completed_mw"]
    m["low_confidence"] = m["n_decided"] < MIN_PROJECTS
    return m


def score(m: pd.DataFrame) -> pd.DataFrame:
    m = m.copy()

    def pct(col, ascending=True):
        return m.groupby("iso")[col].rank(pct=True, ascending=ascending).fillna(0.5)

    m["s_gen_pocket"] = pct("gen_pocket_mw")
    m["s_completion_rate"] = pct("completion_rate")
    m["s_speed"] = pct("median_days_to_cod", ascending=False)
    m["s_firm_share"] = pct("firm_share")
    m["s_momentum"] = pct("recent_mw")

    m["score"] = sum(WEIGHTS[k] * m[f"s_{k}"] for k in WEIGHTS) * 100
    m.loc[m["low_confidence"], "score"] *= 0.85
    m["score"] = m["score"].round(1)
    m["rank_in_iso"] = m.groupby("iso")["score"].rank(ascending=False, method="min").astype(int)
    for c in ["completion_rate", "completion_rate_raw", "firm_share"]:
        m[c] = m[c].round(3)
    return m.sort_values(["iso", "rank_in_iso"]).reset_index(drop=True)


# --------------------------------------------------------------- output ---

def to_records(df: pd.DataFrame) -> list[dict]:
    out = df.copy()
    for c in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[c]):
            out[c] = out[c].dt.strftime("%Y-%m-%d")
    return json.loads(out.to_json(orient="records"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--isos", nargs="+", default=DEFAULT_ISOS)
    ap.add_argument("--out", default="public/data/queue")
    ap.add_argument("--sample", action="store_true", help="synthetic data (offline test)")
    args = ap.parse_args()

    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    now = pd.Timestamp.now().normalize()

    frames, meta_isos = [], {}
    for iso_id in args.isos:
        try:
            raw = sample_queue(iso_id) if args.sample else fetch_queue(iso_id)
            p = normalize(raw, iso_id)
        except SystemExit:
            raise
        except Exception as e:
            print(f"[warn] {iso_id} failed: {e!r}", file=sys.stderr)
            meta_isos[iso_id] = {"ok": False, "error": repr(e)}
            continue
        frames.append(p)
        cols = ["iso", "queue_id", "project_name", "county", "state", "gen_type",
                "is_firm", "mw", "bucket", "queue_date", "actual_cod", "poi"]
        (outdir / f"projects_{iso_id}.json").write_text(json.dumps(to_records(p[cols])))
        cov = coverage(p)
        meta_isos[iso_id] = {"ok": True, **cov}
        print(f"[ok] {iso_id}: {json.dumps(cov)}")

    if not frames:
        print("[error] no ISO succeeded", file=sys.stderr)
        return 1

    scored = score(county_metrics(pd.concat(frames, ignore_index=True), now))
    (outdir / "counties.json").write_text(json.dumps(to_records(scored)))
    (outdir / "meta.json").write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "version": "1.1",
        "sample_data": args.sample,
        "weights": WEIGHTS,
        "prior_strength": PRIOR_STRENGTH,
        "isos": meta_isos,
        "source": "ISO public interconnection queues via gridstatus (open source)",
        "caveat": "Generation-queue proxy for grid conditions; not a load-capacity determination.",
    }, indent=2))

    show = ["iso", "state", "county", "score", "gen_pocket_mw", "n_completed",
            "n_withdrawn", "completion_rate", "firm_share", "low_confidence"]
    pd.set_option("display.width", 200)
    print("\nTop 10 counties per ISO:\n"
          + scored.groupby("iso").head(10)[show].to_string(index=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
