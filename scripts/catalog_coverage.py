"""規格完整度報告：有報價的型號中，相容性檢查用到的欄位填了多少。

缺少的欄位會讓對應的檢查顯示「未確認」，所以這份報告指出最值得補資料的地方。
只統計今天有報價的型號（下架的不影響使用者）；類別專屬的欄位只算適用的型號，
例如風冷才算 height_mm、一體式水冷才算 radiator_mm。

用法：
  python scripts/catalog_coverage.py                 # Markdown 表格
  python scripts/catalog_coverage.py --missing case.radiator_support   # 列出缺這個欄位的型號
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.catalog import load_catalog  # noqa: E402

# (類別, 欄位, 用到的檢查, 適用條件)
FIELDS = [
    ("cpu", "socket", "C1", None),
    ("cpu", "max_power_w", "C7", None),
    ("motherboard", "socket", "C1", None),
    ("motherboard", "memory_type", "C2", None),
    ("motherboard", "form_factor", "C3", None),
    ("motherboard", "dimm_slots", "C2", None),
    ("ram", "memory_type", "C2", None),
    ("ram", "modules", "C2", None),
    ("gpu", "length_mm", "C4", lambda s: not _v(s, "external")),
    ("gpu", "board_power_w", "C7", None),
    ("cooler", "cooler_type", "C5", None),
    ("cooler", "sockets", "C6", None),
    ("cooler", "height_mm", "C5", lambda s: _v(s, "cooler_type") == "air"),
    ("cooler", "radiator_mm", "C5", lambda s: _v(s, "cooler_type") == "aio"),
    ("case", "max_mb_form_factor", "C3", None),
    ("case", "gpu_clearance_mm", "C4", None),
    ("case", "cooler_clearance_mm", "C5", None),
    ("case", "psu_form_factors", "C9", None),
    ("case", "radiator_support", "C5", None),
    ("psu", "wattage", "C7", None),
    ("psu", "form_factor", "C9", None),
    ("psu", "pcie_12v2x6", "C8", None),
]


def _v(specs: dict, field: str):
    return specs.get(field, {}).get("value")


def priced_ids(prices: dict | None) -> set[str] | None:
    if prices is None:
        return None
    return {i["model_id"] for o in prices["offers"] for i in o["items"]
            if i.get("role") == "main" and i.get("model_id")}


def coverage(shards: dict[str, dict], priced: set[str] | None) -> list[dict]:
    """每個欄位的 {category, field, check, filled, total, inferred, missing}。priced 為 None 時統計全部型號。"""
    rows = []
    for cat, field, check, applies in FIELDS:
        models = {mid: m for mid, m in shards.get(cat, {}).get("models", {}).items()
                  if m.get("status", "active") == "active" and (priced is None or mid in priced)
                  and (applies is None or applies(m["specs"]))}
        filled = [mid for mid, m in models.items() if field in m["specs"]]
        rows.append({
            "category": cat, "field": field, "check": check, "filled": len(filled), "total": len(models),
            "inferred": sum(models[mid]["specs"][field].get("source") == "inferred" for mid in filled),
            "missing": sorted(set(models) - set(filled)),
        })
    return rows


def markdown(rows: list[dict], scope: str) -> str:
    out = [f"### 規格完整度（{scope}）", "",
           "| 類別 | 欄位 | 檢查 | 已填 | 其中推定 | 缺少 |", "| :-- | :-- | :-- | --: | --: | --: |"]
    for r in rows:
        pct = f"{r['filled'] / r['total']:.0%}" if r["total"] else "—"
        out.append(f"| {r['category']} | `{r['field']}` | {r['check']} | {r['filled']}/{r['total']}（{pct}） "
                   f"| {r['inferred']} | {len(r['missing'])} |")
    out += ["", "缺少的欄位會讓對應的檢查顯示「未確認」。推定值（inferred）在介面上會標示「依推定規格」。"]
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog-dir", type=Path, default=ROOT / "data/catalog")
    ap.add_argument("--prices", type=Path, default=ROOT / "data/prices/coolpc.json")
    ap.add_argument("--missing", metavar="CATEGORY.FIELD", help="列出缺少這個欄位的型號")
    args = ap.parse_args()

    prices = json.loads(args.prices.read_text(encoding="utf-8")) if args.prices.exists() else None
    rows = coverage(load_catalog(args.catalog_dir), priced_ids(prices))
    if args.missing:
        cat, _, field = args.missing.partition(".")
        row = next((r for r in rows if r["category"] == cat and r["field"] == field), None)
        if row is None:
            print(f"沒有這個欄位：{args.missing}（可用：{', '.join(r['category'] + '.' + r['field'] for r in rows)}）",
                  file=sys.stderr)
            return 2
        print("\n".join(row["missing"]))
        return 0
    print(markdown(rows, "有報價的型號" if prices else "全部型號"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
