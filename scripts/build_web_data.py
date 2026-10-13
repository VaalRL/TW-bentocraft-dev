"""產生前端用的精簡資料：web/public/data/catalog.min.json、prices.min.json。

只保留約束引擎與介面需要的資訊（值、誤差、條件式上限、是否為推定值、審查狀態），
去掉來源參考連結與備註；報價只保留能對應到規格庫型號的列。

用法：
    python scripts/build_web_data.py [--catalog-dir data/catalog] [--prices data/prices/coolpc.json] [--out web/public/data]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.catalog import load_catalog  # noqa: E402
from pipeline.prices import strip_part_promo  # noqa: E402

REVIEW = {"auto": "a", "verified": "v", "draft": "d"}


def compact_model(m: dict) -> dict:
    out: dict = {"c": m["category"], "b": m["brand"], "n": m["name"], "s": {}, "r": REVIEW[m["review"]["status"]]}
    extra: dict = {}
    for field, spec in m["specs"].items():
        out["s"][field] = spec["value"]
        meta = {}
        if spec.get("tolerance"):
            meta["t"] = spec["tolerance"]
        if spec.get("conditions"):
            meta["k"] = [[c["value"], c["when"]] for c in spec["conditions"]]
        if spec["source"] == "inferred":
            meta["i"] = 1
        if meta:
            extra[field] = meta
    if extra:
        out["x"] = extra
    if m.get("variants"):
        out["v"] = {vid: v["label"] for vid, v in m["variants"].items()}
    return out


def build_catalog(shards: dict[str, dict]) -> dict:
    models, redirects = {}, {}
    for shard in shards.values():
        for mid, m in shard["models"].items():
            if m["status"] == "deprecated":
                redirects[mid] = m["replaced_by"]
            else:
                models[mid] = compact_model(m)
    return {"models": dict(sorted(models.items())), "redirects": redirects}


def build_prices(doc: dict | None, models: dict[str, dict]) -> dict:
    """models：build_catalog 產生的精簡型號（含品牌 b、名稱 n），用於組合附件的顯示名稱。"""
    if doc is None:
        return {"fetched_at": None, "status": "missing", "vendor": "coolpc", "offers": []}
    offers = []
    for o in doc["offers"]:
        main = o["items"][0]
        if main.get("model_id") not in models:
            continue
        row: dict = {"m": main["model_id"], "p": o["price"]}
        if main.get("variant"):
            row["v"] = main["variant"]
        for src, dst in (("list_price", "l"), ("combo_discount", "d"), ("valid_until", "u")):
            if o.get(src):
                row[dst] = o[src]
        if o.get("price_condition"):
            cond = o["price_condition"]
            row["c"] = {"t": cond["type"], **({"q": cond["requires"]} if cond.get("requires") else {})}
        if o.get("gift"):
            row["g"] = o["gift"]["text"]
        # 對應到規格庫的附件顯示型號名稱，否則顯示去掉「現省」等促銷字樣的原文
        extras = [f"{models[i['model_id']]['b']} {models[i['model_id']]['n']}" if i.get("model_id") in models
                  else strip_part_promo(i.get("text", i.get("model_id", ""))) for i in o["items"][1:]]
        if extras:
            row["x"] = extras
        offers.append(row)
    return {"fetched_at": doc["fetched_at"], "status": doc["status"], "vendor": doc["vendor"], "offers": offers}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog-dir", type=Path, default=ROOT / "data/catalog")
    ap.add_argument("--prices", type=Path, default=ROOT / "data/prices/coolpc.json")
    ap.add_argument("--out", type=Path, default=ROOT / "web/public/data")
    args = ap.parse_args()

    catalog = build_catalog(load_catalog(args.catalog_dir))
    prices_doc = json.loads(args.prices.read_text(encoding="utf-8")) if args.prices.exists() else None
    prices = build_prices(prices_doc, catalog["models"])

    args.out.mkdir(parents=True, exist_ok=True)
    for name, doc in (("catalog.min.json", catalog), ("prices.min.json", prices)):
        (args.out / name).write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"型號 {len(catalog['models'])}、轉址 {len(catalog['redirects'])}；"
          f"報價 {len(prices['offers'])} 列（狀態 {prices['status']}，{prices['fetched_at']}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
