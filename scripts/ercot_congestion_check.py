#!/usr/bin/env python3
"""
Voltlas — ERCOT congestion validation for the county siting score (v2)

Question: do counties the queue score ranks highly actually sit in
export-constrained pockets, i.e. show NEGATIVE price basis vs the hub?

Method
  1. Day-Ahead Settlement Point Prices (ERCOT MIS NP4-190-CD).
     Basis = Resource Node price - HB_BUSAVG, per hour. ERCOT LMPs have no
     loss component, so this is a relative-congestion measure.
  2. Resource node -> county, in priority order:
       a. overrides   data/ercot_node_county_overrides.csv (resource_node,county)
       b. CDR join    NP4-160-SG "resource node to unit" file gives
                      UNIT_SUBSTATION + UNIT_NAME = CDR "Unit Code"; the CDR
                      workbook gives Unit Code -> County. Deterministic.
       c. fuzzy       (only with --fuzzy) exact-token match of node/substation
                      names against queue project names + POIs. Weak.
     PUN nodes (private-use networks, industrial) are excluded.
  3. County basis = median of node mean-basis; compare with counties.json.

Run after queue_scores.py:
  python scripts/ercot_congestion_check.py --cdr ~/Downloads/<CDR file>.xlsx --days 30

Get the CDR: latest "Capacity, Demand and Reserves" report workbook from
ercot.com (Grid Info > Resource Adequacy). Any recent edition works; it is
only used for Unit Code -> County.

EPISTEMIC NOTES
  * The NP4-160-SG unit file and CDR column names are coded from memory of
    ERCOT formats; the script prints what it finds and stops if they differ.
  * Units in the CDR are OPERATING units, so new-build-only counties won't get
    a basis value. That's correct: no node, no observed price.
  * ~30 days of DAM is one season and understates real-time congestion.
  * Correlation validates the proxy, not any single county.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import requests

MIS_LIST = "https://www.ercot.com/misapp/servlets/IceDocListJsonWS?reportTypeId={rtid}"
MIS_GET = "https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId={doc_id}"
RTID_MAPPING = 10008   # NP4-160-SG Settlement Points List and Electrical Buses Mapping
RTID_DAM_SPP = 12331   # NP4-190-CD DAM Settlement Point Prices
HUB_REF = "HB_BUSAVG"

QUEUE_DIR = Path("public/data/queue")
OVERRIDES = Path("data/ercot_node_county_overrides.csv")
DIAG = Path("data/diagnostics/ercot_node_matches.csv")

STOP = set("""
solar wind energy storage battery bess ess esr slr bes pun llc inc project projects
power farm farms generation generating gen station substation sub tap line lines
unit units all ranch center plant the and phase holdings renewable renewables park
facility site texas county north south east west central creek hill hills lake river
valley new old cc ct gt st pv wt combined cycle peaker peaking ercot hub load
resource node black red blue white green gold star sun
""".split())
MAX_TOKEN_FREQ = 5       # fuzzy: tokens in more projects than this are too generic
SESSION = requests.Session()
SESSION.headers["User-Agent"] = "voltlas-data/1.0"


def norm_county(s: pd.Series) -> pd.Series:
    return (s.astype(str).str.strip().str.title()
              .str.replace(r"\s+County$", "", regex=True)
              .str.replace(r"^Ft\.?\s+", "Fort ", regex=True))


# ------------------------------------------------------------- download ---

def list_docs(rtid: int) -> pd.DataFrame:
    r = SESSION.get(MIS_LIST.format(rtid=rtid), timeout=60)
    r.raise_for_status()
    rows = []
    for item in r.json()["ListDocsByRptTypeRes"]["DocumentList"]:
        d = item["Document"]
        rows.append({
            "id": d["DocID"],
            "name": f'{d.get("ConstructedName", "")} {d.get("FriendlyName", "")}'.lower(),
            "published": pd.to_datetime(d.get("PublishDate"), errors="coerce", utc=True),
        })
    return pd.DataFrame(rows).sort_values("published", ascending=False)


def read_zip_csvs(doc_id: str) -> dict[str, pd.DataFrame]:
    r = SESSION.get(MIS_GET.format(doc_id=doc_id), timeout=120)
    r.raise_for_status()
    out = {}
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        for n in z.namelist():
            if n.lower().endswith(".csv"):
                df = pd.read_csv(z.open(n), dtype=str)
                df.columns = [c.strip().upper().replace(" ", "_") for c in df.columns]
                out[n] = df
    return out


def fetch_mapping() -> tuple[pd.DataFrame, pd.DataFrame | None]:
    """Returns (bus mapping with RESOURCE_NODE/SUBSTATION, node->unit table or None)."""
    files = read_zip_csvs(list_docs(RTID_MAPPING).iloc[0]["id"])
    print("[mapping] files: " + ", ".join(f"{Path(n).name}{list(d.columns)}" for n, d in files.items()))
    bus, units = None, None
    for df in files.values():
        cols = set(df.columns)
        if {"RESOURCE_NODE", "SUBSTATION"} <= cols and bus is None:
            keep = [c for c in ["RESOURCE_NODE", "SUBSTATION", "NODE_NAME"] if c in cols]
            bus = df.loc[df["RESOURCE_NODE"].fillna("").str.strip().ne(""), keep]
        if "RESOURCE_NODE" in cols and "UNIT_NAME" in cols and units is None:
            sub = "UNIT_SUBSTATION" if "UNIT_SUBSTATION" in cols else (
                  "SUBSTATION" if "SUBSTATION" in cols else None)
            if sub:
                units = df[["RESOURCE_NODE", sub, "UNIT_NAME"]].dropna()
                units = units.assign(unit_code=(units[sub].str.strip() + "_"
                                                + units["UNIT_NAME"].str.strip()).str.upper())
    if bus is None:
        raise SystemExit("[mapping] no CSV with RESOURCE_NODE + SUBSTATION columns")
    print(f"[mapping] {bus['RESOURCE_NODE'].nunique():,} resource nodes; "
          f"node->unit table: {'found, %d units' % len(units) if units is not None else 'NOT FOUND'}")
    return bus, units


def fetch_dam_prices(days: int) -> pd.DataFrame:
    docs = list_docs(RTID_DAM_SPP)
    docs = docs[docs["name"].str.contains("csv")].head(days)
    print(f"[prices] {len(docs)} DAM SPP daily files selected")
    frames = []
    for i, doc_id in enumerate(docs["id"], 1):
        frames.extend(read_zip_csvs(doc_id).values())
        if i % 10 == 0:
            print(f"[prices] {i}/{len(docs)}", flush=True)
    p = pd.concat(frames, ignore_index=True)
    need = {"DELIVERYDATE", "HOURENDING", "SETTLEMENTPOINT", "SETTLEMENTPOINTPRICE"}
    if not need <= set(p.columns):
        raise SystemExit(f"[prices] unexpected columns {list(p.columns)}")
    p = p.rename(columns={"DELIVERYDATE": "date", "HOURENDING": "he",
                          "SETTLEMENTPOINT": "sp", "SETTLEMENTPOINTPRICE": "price"})
    if "DSTFLAG" in p:
        p["he"] = p["he"] + p["DSTFLAG"].fillna("N")
    p["price"] = pd.to_numeric(p["price"], errors="coerce")
    return p[["date", "he", "sp", "price"]].dropna()


# ------------------------------------------------------------------ CDR ---

def read_cdr(path: Path) -> pd.DataFrame:
    """CDR Unit Code -> County. Accepts the extracted CSV (unit_code,county) or a
    CDR .xlsx, scanning every sheet for a header row with UNIT CODE and COUNTY."""
    if path.suffix.lower() == ".csv":
        cdr = pd.read_csv(path, dtype=str).dropna(subset=["unit_code", "county"])
        cdr["unit_code"] = cdr["unit_code"].str.strip().str.upper()
        cdr["county"] = norm_county(cdr["county"])
        print(f"[cdr] {len(cdr):,} unit codes from {path}")
        return cdr.drop_duplicates("unit_code")[["unit_code", "county"]]
    found = []
    for sheet, raw in pd.read_excel(path, sheet_name=None, header=None, dtype=str).items():
        norm = raw.apply(lambda c: c.astype(str).str.strip().str.upper()
                                     .str.replace(r"\s+", " ", regex=True))
        for r in range(min(len(norm), 60)):
            row = list(norm.iloc[r])
            if "UNIT CODE" in row and "COUNTY" in row:
                uc, co = row.index("UNIT CODE"), row.index("COUNTY")
                body = raw.iloc[r + 1:, [uc, co]].dropna()
                body.columns = ["unit_code", "county"]
                body = body[body["unit_code"].str.contains("_", na=False)]
                found.append(body.assign(sheet=sheet))
                break
    if not found:
        raise SystemExit(f"[cdr] no sheet in {path.name} has 'Unit Code' + 'County' headers")
    cdr = pd.concat(found, ignore_index=True)
    cdr["unit_code"] = cdr["unit_code"].str.strip().str.upper()
    cdr["county"] = norm_county(cdr["county"])
    cdr = cdr.drop_duplicates("unit_code")
    print(f"[cdr] {len(cdr):,} unit codes from sheets: {sorted(cdr['sheet'].unique())}")
    return cdr[["unit_code", "county"]]


def cdr_node_counties(units: pd.DataFrame, cdr: pd.DataFrame) -> pd.DataFrame:
    """Node -> county via CDR. Pass 1: exact unit code. Pass 2 (substation
    fallback): for units whose code isn't in the CDR (e.g. storage named
    SUB_ESR1 in the mapping vs SUB_BESS1 in the CDR), use the county of any CDR
    unit at the same substation, if that substation maps to exactly one county."""
    sub_col = "UNIT_SUBSTATION" if "UNIT_SUBSTATION" in units else "SUBSTATION"
    u = units.assign(sub=units[sub_col].str.strip().str.upper())

    exact = u.merge(cdr, on="unit_code", how="inner").assign(how="cdr")

    # substation -> county from CDR codes, using the mapping's substation list;
    # longest matching prefix wins (substation names can contain underscores)
    subs = sorted(set(u["sub"]), key=len, reverse=True)
    rows = []
    for code, county in zip(cdr["unit_code"], cdr["county"]):
        for sname in subs:
            if code.startswith(sname + "_"):
                rows.append((sname, county))
                break
    sc = pd.DataFrame(rows, columns=["sub", "county"]).drop_duplicates()
    nc = sc.groupby("sub")["county"].nunique()
    sub_county = sc[sc["sub"].isin(nc[nc == 1].index)].drop_duplicates("sub")

    rest = u[~u["unit_code"].isin(exact["unit_code"])]
    by_sub = rest.merge(sub_county, on="sub", how="inner").assign(how="cdr_sub")
    j = pd.concat([exact, by_sub], ignore_index=True)
    print(f"[cdr] units matched: exact {exact['unit_code'].nunique():,}, "
          f"by substation {by_sub['unit_code'].nunique():,}, of {u['unit_code'].nunique():,} "
          f"({int((nc > 1).sum())} substations skipped: multi-county)")

    g = j.groupby("RESOURCE_NODE")
    out = pd.DataFrame({
        "county": g["county"].agg(lambda s: s.mode().iloc[0]),
        "n_counties": g["county"].nunique(),
        "any_exact": g["how"].agg(lambda s: (s == "cdr").any()),
    }).reset_index()
    out["match"] = np.where(out["n_counties"] > 1, "cdr_multi",
                            np.where(out["any_exact"], "cdr", "cdr_sub"))
    return out.rename(columns={"RESOURCE_NODE": "resource_node"})[["resource_node", "county", "match"]]


# ---------------------------------------------------------------- fuzzy ---

def tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z]{4,}", str(text).lower()) if t not in STOP}


def fuzzy_node_counties(bus: pd.DataFrame, projects: pd.DataFrame,
                        skip: set[str]) -> pd.DataFrame:
    """Exact-token match only (no prefixes), rare tokens only, single county only."""
    pr = projects[projects["county"].notna()].copy()
    pr["tok"] = (pr["project_name"].fillna("") + " " + pr["poi"].fillna("")).map(tokens)
    freq: dict[str, int] = {}
    for ts in pr["tok"]:
        for t in ts:
            freq[t] = freq.get(t, 0) + 1
    index: dict[str, set[str]] = {}
    for c, ts in zip(pr["county"], pr["tok"]):
        for t in ts:
            if freq[t] <= MAX_TOKEN_FREQ:
                index.setdefault(t, set()).add(c)

    cols = [c for c in ["RESOURCE_NODE", "SUBSTATION", "NODE_NAME"] if c in bus]
    text = (bus[cols].fillna("").agg(" ".join, axis=1).str.replace("_", " ")
            .groupby(bus["RESOURCE_NODE"]).agg(" ".join))
    rows = []
    for node, t in text.items():
        if node in skip:
            continue
        counties = set()
        for tok in tokens(t):
            counties |= index.get(tok, set())
        if len(counties) == 1:
            rows.append({"resource_node": node, "county": counties.pop(), "match": "fuzzy"})
    return pd.DataFrame(rows, columns=["resource_node", "county", "match"])


# ---------------------------------------------------------------- basis ---

def node_basis(prices: pd.DataFrame, nodes: set[str]) -> pd.DataFrame:
    hub = prices[prices["sp"] == HUB_REF][["date", "he", "price"]].rename(columns={"price": "hub"})
    if hub.empty:
        raise SystemExit(f"[basis] {HUB_REF} not found in price data")
    p = prices[prices["sp"].isin(nodes)].merge(hub, on=["date", "he"])
    p["basis"] = p["price"] - p["hub"]
    g = p.groupby("sp")["basis"]
    return pd.DataFrame({
        "mean_basis": g.mean(),
        "median_basis": g.median(),
        "p10_basis": g.quantile(0.10),
        "share_hours_below_neg5": g.apply(lambda s: (s < -5).mean()),
        "n_hours": g.size(),
    }).reset_index().rename(columns={"sp": "resource_node"})


def spearman(a: pd.Series, b: pd.Series) -> float:
    ok = a.notna() & b.notna()
    if ok.sum() < 5:
        return float("nan")
    return float(np.corrcoef(a[ok].rank(), b[ok].rank())[0, 1])


# ----------------------------------------------------------------- main ---

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cdr", type=Path, help="CDR .xlsx or extracted unit_code,county .csv")
    ap.add_argument("--fuzzy", action="store_true", help="also fuzzy-match nodes not in CDR")
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--archive", action="store_true",
                    help="use data/ercot/dam_spp archive (last --days days) instead of MIS")
    ap.add_argument("--min-nodes", type=int, default=1)
    args = ap.parse_args()

    projects = pd.DataFrame(json.loads((QUEUE_DIR / "projects_ercot.json").read_text()))
    counties = pd.DataFrame(json.loads((QUEUE_DIR / "counties.json").read_text()))
    counties = counties[counties["iso"] == "ERCOT"]

    bus, units = fetch_mapping()
    all_nodes = set(bus["RESOURCE_NODE"])
    pun = {n for n in all_nodes if re.search(r"_PUN\d*$", n)}
    gen_nodes = all_nodes - pun
    print(f"[mapping] excluding {len(pun)} PUN nodes -> {len(gen_nodes):,} generation nodes")

    parts = []
    if OVERRIDES.exists():
        ov = pd.read_csv(OVERRIDES, dtype=str).dropna()
        parts.append(ov.assign(match="override")[["resource_node", "county", "match"]])
    if args.cdr:
        if units is None:
            print("[cdr] skipped: no node->unit table in NP4-160-SG (see file list above)")
        else:
            parts.append(cdr_node_counties(units, read_cdr(args.cdr.expanduser())))
    have = set(pd.concat(parts)["resource_node"]) if parts else set()
    if args.fuzzy:
        parts.append(fuzzy_node_counties(bus, projects, skip=have | pun))
    if not parts:
        raise SystemExit("Nothing to map with. Pass --cdr <file.xlsx> and/or --fuzzy.")

    nodes = (pd.concat(parts, ignore_index=True)
               .drop_duplicates("resource_node", keep="first"))      # priority order
    nodes = nodes[nodes["resource_node"].isin(gen_nodes)]
    nodes["county"] = norm_county(nodes["county"])
    DIAG.parent.mkdir(parents=True, exist_ok=True)
    nodes.sort_values(["county", "resource_node"]).to_csv(DIAG, index=False)
    print(f"[match] {len(nodes):,}/{len(gen_nodes):,} generation nodes mapped "
          f"({len(nodes)/len(gen_nodes):.0%}): "
          + "  ".join(f"{k}={v}" for k, v in nodes["match"].value_counts().items()))

    if args.archive:
        sys.path.insert(0, str(Path(__file__).parent))
        from ercot_price_archive import load_archive
        a = load_archive()
        if a.empty:
            raise SystemExit("[prices] archive empty; run ercot_price_archive.py first")
        keep = sorted(a["date"].astype(str).unique())[-args.days:]
        a = a[a["date"].astype(str).isin(keep)]
        prices = pd.DataFrame({"date": a["date"].astype(str),
                               "he": a["he"].astype(str) + a["dst"].map({True: "Y", False: "N"}),
                               "sp": a["sp"], "price": a["price"].astype(float)})
        print(f"[prices] {len(keep)} archived days")
    else:
        prices = fetch_dam_prices(args.days)
    nb = nodes.merge(node_basis(prices, set(nodes["resource_node"])), on="resource_node")
    print(f"[basis] {len(nb):,} mapped nodes with prices "
          f"({prices['date'].min()} .. {prices['date'].max()})")

    cb = (nb.groupby("county")
            .agg(county_basis=("mean_basis", "median"),
                 county_median_hourly=("median_basis", "median"),
                 county_p10_basis=("p10_basis", "median"),
                 share_hours_below_neg5=("share_hours_below_neg5", "median"),
                 n_nodes=("resource_node", "nunique"))
            .reset_index())
    cb = cb[cb["n_nodes"] >= args.min_nodes]

    j = counties.merge(cb, on="county", how="left")
    cov = j["county_basis"].notna()
    unjoined = sorted(set(cb["county"]) - set(counties["county"]))
    print(f"[join] {int(cov.sum())}/{len(j)} scored counties have a basis value"
          + (f"; basis counties not in queue: {unjoined[:10]}" if unjoined else ""))

    print("\nSpearman rho vs basis (hypothesis: NEGATIVE). Two basis measures:")
    print(f"  {'':20s} {'mean':>7s} {'share<-5':>9s}")
    for c in ["score", "s_gen_pocket", "s_firm_share", "s_completion_rate", "s_speed", "s_momentum"]:
        if c in j:
            # share<-5: hypothesis is POSITIVE (more congested hours), sign-flip to compare
            print(f"  {c:20s} {spearman(j[c], j['county_basis']):+7.2f} "
                  f"{-spearman(j[c], j['share_hours_below_neg5']):+9.2f}")

    jj = j[cov].copy()
    if len(jj) >= 10:
        jj["score_quintile"] = pd.qcut(jj["score"].rank(method="first"), 5,
                                       labels=["Q1 low", "Q2", "Q3", "Q4", "Q5 high"])
        print("\nBy score quintile ($/MWh vs HB_BUSAVG):")
        print(jj.groupby("score_quintile", observed=True)
                .agg(counties=("county", "size"), nodes=("n_nodes", "sum"),
                     median_basis=("county_basis", "median"),
                     hrs_below_neg5=("share_hours_below_neg5", "median"))
                .round(2).to_string())

    pd.set_option("display.width", 200)
    show = ["county", "score", "rank_in_iso", "county_basis", "county_median_hourly",
            "county_p10_basis", "share_hours_below_neg5", "n_nodes"]
    print("\nTop 15 scored counties:")
    print(j.sort_values("rank_in_iso").head(15)[show].round(2).to_string(index=False))
    print("\nMost export-constrained counties by observed basis (>= 3 nodes):")
    print(cb[cb["n_nodes"] >= 3].sort_values("county_basis").head(15)
            .merge(counties[["county", "score", "rank_in_iso"]], on="county", how="left")
            .round(2).to_string(index=False))

    # Publish EVERY county with observed prices (incl. counties with no queue
    # projects, e.g. Floyd); queue score attached where available.
    out = cb.merge(counties[["county", "state", "score", "rank_in_iso"]], on="county", how="left")
    out["state"] = out["state"].fillna("TX")
    out = out[["county", "state", "score", "rank_in_iso", "county_basis", "county_median_hourly",
               "county_p10_basis", "share_hours_below_neg5", "n_nodes"]]
    (QUEUE_DIR / "ercot_county_basis.json").write_text(json.dumps({
        "price_window": [str(prices["date"].min()), str(prices["date"].max())],
        "reference": HUB_REF, "market": "DAM",
        "node_mapping": nodes["match"].value_counts().to_dict(),
        "generation_nodes": len(gen_nodes),
        "nodes_with_prices": int(nb["resource_node"].nunique()),
        "counties": json.loads(out.to_json(orient="records")),
    }))
    print(f"\n[ok] wrote {QUEUE_DIR / 'ercot_county_basis.json'} and {DIAG}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
