#!/usr/bin/env python3
"""
Extract ERCOT CDR "Unit Code -> County" pairs into a small committed CSV,
so the weekly congestion check can run in CI without the 13 MB workbook.

Merges any number of CDR-style workbooks. Pass them OLDEST FIRST: later
files override earlier ones for the same unit code, and units that drop out
of newer editions (retirements) are kept from the older ones, because their
resource nodes may still carry prices.

Usage:
  python scripts/ercot_cdr_extract.py ~/Downloads/CDR_Dec2025.xlsx ~/Downloads/CDR_Jul2026.xlsx

Output:
  data/ercot/cdr_units.csv   unit_code,county,source
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from ercot_congestion_check import read_cdr  # noqa: E402

OUT = Path("data/ercot/cdr_units.csv")


def main(paths: list[str]) -> int:
    if not paths:
        print(__doc__)
        return 1
    frames = []
    for i, p in enumerate(paths):
        path = Path(p).expanduser()
        df = read_cdr(path).assign(source=path.name, _order=i)
        frames.append(df)
    allu = pd.concat(frames, ignore_index=True)
    merged = (allu.sort_values("_order")
                  .drop_duplicates("unit_code", keep="last")
                  .drop(columns="_order")
                  .sort_values("unit_code"))

    if len(frames) > 1:
        old, new = set(frames[0]["unit_code"]), set(frames[-1]["unit_code"])
        moved = (frames[0].merge(frames[-1], on="unit_code", suffixes=("_old", "_new"))
                 .query("county_old != county_new"))
        print(f"[merge] only in oldest: {len(old - new)}, only in newest: {len(new - old)}, "
              f"county changed: {len(moved)}")
        if len(moved):
            print(moved[["unit_code", "county_old", "county_new"]].head(10).to_string(index=False))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    merged.to_csv(OUT, index=False)
    print(f"[ok] {len(merged):,} unit codes -> {OUT} ({OUT.stat().st_size/1e3:.0f} KB)")
    print(merged["source"].value_counts().to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
