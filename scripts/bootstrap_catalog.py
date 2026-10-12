"""從原價屋估價頁產生規格庫中尚不存在的型號，寫入 data/catalog/<類別>.json。

用法：
    python scripts/bootstrap_catalog.py --html saved.html

既有型號一律不修改；新增的型號為 review.status = auto（同型號多列規格不一致者為 draft）。
產生的檔案應以 PR 送審，不直接推上 main。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.catalog import load_catalog, new_models, write_catalog  # noqa: E402
from pipeline.coolpc import decode_html, parse_items  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", required=True, help="估價頁存檔（由 update_prices.py --save-html 產生）")
    ap.add_argument("--catalog-dir", type=Path, default=ROOT / "data/catalog")
    args = ap.parse_args()

    html, _ = decode_html(Path(args.html).read_bytes(), None)
    items = parse_items(html)
    shards = load_catalog(args.catalog_dir)
    created, stats = new_models(items, shards)
    for cat, models in created.items():
        shards[cat]["models"].update(models)
    write_catalog(args.catalog_dir, shards)

    print(f"品項 {len(items)} 列；新增型號 {stats['models_created']} 個；"
          f"ID 碰撞 {stats['id_collisions']}；規格衝突 {stats['spec_conflicts']}（標為 draft）")
    for c in stats["conflicts"][:50]:
        print("  -", c)
    for cat, models in created.items():
        if models:
            print(f"  {cat}: +{len(models)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
