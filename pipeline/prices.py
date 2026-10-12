"""產生每日報價快照（data/prices/<通路>.json），格式見 schema/prices.schema.json。"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from pipeline.catalog import CatalogIndex, detect_variant, identity, main_text, price_fields
from pipeline.extract import split_combo

# 計算報價 ID 前從品名移除會隨日期變動的字樣，讓同一列商品在價格或促銷改變時保持相同 ID
_VOLATILE_RES = [
    re.compile(r"原價\s?\$\s?\d+！?"),
    re.compile(r"現省\s?\$?\s?\d+！?"),
    re.compile(r"▼.*$"),          # 「▼下殺到 10/31 20:00」
    re.compile(r"\s*[◆★]+"),
    re.compile(r"↓[^↓]*↓"),       # 「↓任搭290↓」「↓酷幣100↓」
    re.compile(r"\s*熱賣"),
]


def offer_key(item: dict) -> str:
    text = item["text"]
    head = text[: text.rfind(", $")] if ", $" in text else text
    for rx in _VOLATILE_RES:
        head = rx.sub("", head)
    return f"{item.get('select', '')}|{re.sub(r'\s+', ' ', head).strip()}"


def offer_id(item: dict) -> str:
    return "coolpc:h" + hashlib.sha1(offer_key(item).encode("utf-8")).hexdigest()[:10]


def build_offers(items: list[dict], index: CatalogIndex, fetched_year: int,
                 keep_raw_title: bool = False) -> tuple[list[dict], dict]:
    """品項 → 報價列。能以型號鍵對應到規格庫的記為 model_key，否則保留原文記為 unmatched。"""
    offers = []
    per_cat: dict[str, Counter] = defaultdict(Counter)
    for item in items:
        cat = item["category"]
        key, _ = identity(item)
        mid = index.lookup(cat, key)
        main = {"role": "main", "match": "model_key", "model_id": mid} if mid else \
            {"role": "main", "match": "unmatched", "text": main_text(item)[:120]}
        variant = detect_variant(item["text"])
        if mid and variant:
            main["variant"] = variant[0]
        parts = [main] + [{"role": p["kind"], "match": "unmatched", "text": p["text"][:120]}
                          for p in (split_combo(item["text"]) or [])[1:]]
        offer = {"offer_id": offer_id(item), "category": cat,
                 "vendor_section": {"id": item.get("select", ""), "group": item.get("group", "")}}
        if keep_raw_title:
            offer["raw_title"] = item["text"]
        offer.update(price_fields(item, fetched_year))
        offer["items"] = parts
        offers.append(offer)
        per_cat[cat]["offers"] += 1
        per_cat[cat]["matched"] += bool(mid)

    # 品名完全相同的列（重複上架）會得到相同 ID：依出現順序加序號
    seen: Counter = Counter()
    for o in offers:
        seen[o["offer_id"]] += 1
        if seen[o["offer_id"]] > 1:
            o["offer_id"] += f"-{seen[o['offer_id']]}"
    offers.sort(key=lambda o: (o["category"], o["offer_id"]))
    stats = {cat: dict(c) for cat, c in sorted(per_cat.items())}
    return offers, stats


def write_prices(path: Path, doc: dict) -> None:
    """每個報價列一行，讓每日提交的 diff 只顯示真正變動的商品。"""
    head = {k: v for k, v in doc.items() if k != "offers"}
    lines = ["{"] + [f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}," for k, v in head.items()]
    rows = [json.dumps(o, ensure_ascii=False, separators=(",", ":")) for o in doc["offers"]]
    lines.append('  "offers": [')
    lines += [f"    {r}," for r in rows[:-1]] + ([f"    {rows[-1]}"] if rows else [])
    lines += ["  ]", "}"]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
