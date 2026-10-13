"""以 data/reference/specs.json 與散熱器扣具代碼圖例，補齊規格庫既有型號缺漏的欄位（功耗、支援腳位等）。

用法：
    python scripts/apply_reference.py [--catalog-dir data/catalog] [--check]

只補缺漏的欄位，不覆寫既有值，不動已確認（verified）的型號。新增型號時
bootstrap_catalog.py 會自動套用，這支腳本用於對照表更新後回填既有型號。
--check：只檢查不寫檔；有欄位尚未回填時以非零狀態結束。
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.catalog import load_catalog, write_catalog  # noqa: E402
from pipeline.reference import apply_reference, load_reference, match_rule  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog-dir", type=Path, default=ROOT / "data/catalog")
    ap.add_argument("--check", action="store_true", help="只檢查，不寫檔")
    args = ap.parse_args()

    reference = load_reference()
    shards = load_catalog(args.catalog_dir)
    filled: Counter = Counter()
    unmatched: list[str] = []
    for cat, shard in shards.items():
        for mid, model in shard["models"].items():
            fields = apply_reference(model, reference)
            filled.update(f"{cat}.{f}" for f in fields)
            if cat in reference and model["status"] == "active" and match_rule(reference, cat, model["name"]) is None:
                unmatched.append(mid)

    for key, n in sorted(filled.items()):
        print(f"  {key}: +{n}")
    print(f"補上 {sum(filled.values())} 個欄位；對照表沒有規則的型號 {len(unmatched)} 個")
    for mid in unmatched:
        print("  -", mid)
    if args.check:
        return 1 if filled else 0
    write_catalog(args.catalog_dir, shards)
    return 0


if __name__ == "__main__":
    sys.exit(main())
