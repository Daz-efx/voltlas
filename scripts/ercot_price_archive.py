#!/usr/bin/env python3
"""
Voltlas — ERCOT price + node-mapping archiver

ERCOT MIS only keeps ~30 days of nodal DAM Settlement Point Price files
(NP4-190-CD). This job downloads every file it hasn't seen yet and stores one
compact Parquet file per delivery day, building a multi-season history that
isn't otherwise publicly available.

It also snapshots the Settlement Point / Resource Node mapping (NP4-160-SG),
writing a new dated copy only when its contents change, so historical prices
can always be joined to the node map that was live at the time.

Layout (repo-relative):
  data/ercot/dam_spp/YYYY/YYYY-MM-DD.parquet   one file per delivery day
  data/ercot/dam_spp/_manifest.json            processed MIS DocIDs
  data/ercot/mapping/YYYY-MM-DD/*.csv          mapping snapshot when changed
  data/ercot/mapping/_latest.json              hash + date of current snapshot

Usage:
  python scripts/ercot_price_archive.py            # fetch anything new
  python scripts/ercot_price_archive.py --status   # coverage report, no fetch

Notes
  * Idempotent: safe to run daily or weekly; skips DocIDs already processed.
    Weekly gives ~3 missed runs of slack before data ages out of MIS.
  * Retention window on MIS (~30 days) is observed, not documented here; the
    status report flags gaps so you'll see if it ever shrinks.
  * Size: ~1k settlement points x 24 h per day, float32 + zstd. Expect tens of
    MB per year; fine to commit, or move to object storage later.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
import time
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import requests

MIS_LIST = "https://www.ercot.com/misapp/servlets/IceDocListJsonWS?reportTypeId={rtid}"
MIS_GET = "https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId={doc_id}"
RTID_DAM_SPP = 12331   # NP4-190-CD
RTID_MAPPING = 10008   # NP4-160-SG

ROOT = Path("data/ercot")
SPP_DIR = ROOT / "dam_spp"
MAP_DIR = ROOT / "mapping"
MANIFEST = SPP_DIR / "_manifest.json"
MAP_LATEST = MAP_DIR / "_latest.json"

SESSION = requests.Session()
SESSION.headers["User-Agent"] = "voltlas-data/1.0"


def get(url: str, tries: int = 4) -> requests.Response:
    for i in range(tries):
        try:
            r = SESSION.get(url, timeout=120)
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            if i == tries - 1:
                raise
            wait = 5 * 2 ** i
            print(f"[retry] {e!r} -> sleeping {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("unreachable")


def list_docs(rtid: int) -> list[dict]:
    docs = get(MIS_LIST.format(rtid=rtid)).json()["ListDocsByRptTypeRes"]["DocumentList"]
    out = []
    for item in docs:
        d = item["Document"]
        out.append({"id": str(d["DocID"]),
                    "name": f'{d.get("ConstructedName", "")} {d.get("FriendlyName", "")}'.lower(),
                    "published": d.get("PublishDate", "")})
    return out


def zip_csvs(doc_id: str) -> dict[str, bytes]:
    z = zipfile.ZipFile(io.BytesIO(get(MIS_GET.format(doc_id=doc_id)).content))
    return {Path(n).name: z.read(n) for n in z.namelist() if n.lower().endswith(".csv")}


def load_json(p: Path, default):
    return json.loads(p.read_text()) if p.exists() else default


# ---------------------------------------------------------------- prices ---

def parse_spp(raw: bytes) -> pd.DataFrame:
    df = pd.read_csv(io.BytesIO(raw), dtype=str)
    df.columns = [c.strip().upper().replace(" ", "_") for c in df.columns]
    need = {"DELIVERYDATE", "HOURENDING", "SETTLEMENTPOINT", "SETTLEMENTPOINTPRICE"}
    if not need <= set(df.columns):
        raise ValueError(f"unexpected DAM SPP columns: {list(df.columns)}")
    out = pd.DataFrame({
        "date": pd.to_datetime(df["DELIVERYDATE"], format="%m/%d/%Y").dt.date,
        "he": pd.to_numeric(df["HOURENDING"].str.split(":").str[0]).astype("int8"),
        "dst": df.get("DSTFLAG", pd.Series("N", index=df.index)).fillna("N").eq("Y"),
        "sp": df["SETTLEMENTPOINT"].str.strip(),
        "price": pd.to_numeric(df["SETTLEMENTPOINTPRICE"], errors="coerce").astype("float32"),
    })
    return out.dropna(subset=["price"])


def archive_prices() -> int:
    manifest = load_json(MANIFEST, {})
    docs = [d for d in list_docs(RTID_DAM_SPP) if "csv" in d["name"]]
    new = [d for d in docs if d["id"] not in manifest]
    print(f"[spp] {len(docs)} csv docs on MIS, {len(new)} new")
    written = 0
    for d in sorted(new, key=lambda x: x["published"]):
        frames = [parse_spp(b) for b in zip_csvs(d["id"]).values()]
        df = pd.concat(frames, ignore_index=True)
        for day, part in df.groupby("date"):
            path = SPP_DIR / f"{day:%Y}" / f"{day:%Y-%m-%d}.parquet"
            path.parent.mkdir(parents=True, exist_ok=True)
            part = part.assign(sp=part["sp"].astype("category"))
            part.sort_values(["sp", "he", "dst"]).to_parquet(
                path, index=False, compression="zstd")
            manifest[d["id"]] = {"delivery_date": f"{day:%Y-%m-%d}", "rows": len(part),
                                 "published": d["published"]}
            written += 1
            print(f"[spp] {day} -> {path} ({len(part):,} rows)")
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST.write_text(json.dumps(manifest, indent=1, sort_keys=True))  # save as we go
    return written


# --------------------------------------------------------------- mapping ---

def archive_mapping() -> bool:
    docs = list_docs(RTID_MAPPING)
    if not docs:
        print("[map] no mapping docs listed")
        return False
    latest_doc = max(docs, key=lambda d: d["published"])
    files = zip_csvs(latest_doc["id"])
    # hash content with the date-stamped filenames normalized out
    def stem(n: str) -> str:
        return re.sub(r"_\d{8}_\d{6}(?=\.csv$)", "", n, flags=re.I)
    h = hashlib.sha256()
    for name in sorted(files, key=stem):
        h.update(stem(name).encode())
        h.update(files[name])
    digest = h.hexdigest()[:16]

    prev = load_json(MAP_LATEST, {})
    if prev.get("hash") == digest:
        print(f"[map] unchanged since {prev.get('date')} ({digest})")
        return False
    snap = MAP_DIR / f"{date.today():%Y-%m-%d}"
    snap.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (snap / name).write_bytes(data)
    MAP_LATEST.write_text(json.dumps({"hash": digest, "date": f"{date.today():%Y-%m-%d}",
                                      "doc_id": latest_doc["id"],
                                      "files": sorted(files)}, indent=1))
    print(f"[map] new snapshot {snap} ({len(files)} files, {digest})")
    return True


# ---------------------------------------------------------------- status ---

def status() -> None:
    days = sorted(p.stem for p in SPP_DIR.glob("*/*.parquet"))
    if not days:
        print("[status] archive empty")
        return
    have = pd.to_datetime(days)
    full = pd.date_range(have.min(), have.max(), freq="D")
    gaps = full.difference(have)
    size = sum(p.stat().st_size for p in SPP_DIR.glob("*/*.parquet")) / 1e6
    print(f"[status] {len(days)} days: {days[0]} .. {days[-1]}  ({size:.1f} MB)")
    print(f"[status] gaps: {len(gaps)}" + (f" -> {[f'{g:%Y-%m-%d}' for g in gaps[:20]]}" if len(gaps) else ""))
    snaps = sorted(p.name for p in MAP_DIR.iterdir() if p.is_dir()) if MAP_DIR.exists() else []
    print(f"[status] mapping snapshots: {snaps}")


def load_archive(start: str | None = None, end: str | None = None,
                 root: Path = SPP_DIR) -> pd.DataFrame:
    """Helper for analysis scripts: concatenate archived days in [start, end]."""
    paths = sorted(root.glob("*/*.parquet"))
    if start:
        paths = [p for p in paths if p.stem >= start]
    if end:
        paths = [p for p in paths if p.stem <= end]
    if not paths:
        return pd.DataFrame(columns=["date", "he", "dst", "sp", "price"])
    df = pd.concat((pd.read_parquet(p) for p in paths), ignore_index=True)
    df["sp"] = df["sp"].astype(str)
    return df


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true", help="report coverage only")
    args = ap.parse_args()
    if not args.status:
        t = datetime.now(timezone.utc).isoformat(timespec="seconds")
        print(f"[run] {t}")
        n = archive_prices()
        archive_mapping()
        print(f"[run] wrote {n} day files")
    status()
    return 0


if __name__ == "__main__":
    sys.exit(main())
