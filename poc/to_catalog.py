"""把 coolpc_probe.py 輸出的 items.jsonl 轉成草稿規格庫與報價檔，並以 schema 驗證。

用法：
    python poc/to_catalog.py poc/out/items.jsonl --out poc/out/draft

輸出：
    draft/catalog/<類別>.json   規格庫分片（review.status = auto）
    draft/prices/coolpc.json     報價快照
    draft/runtime/catalog.min.json  去掉來源資訊的前端精簡版（僅用於估算體積）

目的是驗證 schema 能承載真實資料、量測檔案大小，不是正式的規格庫產生器。
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "schema"))
from pipeline.catalog import (  # noqa: E402
    detect_variant, identity, main_text, price_fields, short_hash, slug, specs_for, split_name,
)
from pipeline.extract import split_combo  # noqa: E402
from validate import validate  # noqa: E402

def build(items: list[dict], meta: dict) -> tuple[dict[str, dict], dict, dict]:
    year = int(meta["fetched_at"][:4])
    shards: dict[str, dict] = defaultdict(lambda: {})
    key_to_id: dict[tuple[str, str], str] = {}
    stats: Counter = Counter()
    conflicts: list[str] = []
    offers = []
    unknown_brands: Counter = Counter()

    for item in items:
        cat = item["category"]
        main = main_text(item)
        key, pn = identity(item)
        brand, bslug, name = split_name(main)
        if pn:
            name = f"{name} {pn}"
        if bslug == "unknown":
            unknown_brands[(main.split() or ["?"])[0][:12]] += 1
        mid = key_to_id.get((cat, key))
        if mid is None:
            base = slug(name) or short_hash(key)
            mid = f"{cat}:{bslug}:{base}"
            if mid in shards[cat]:  # 不同型號鍵卻產生相同 ID → 加雜湊區分
                mid = f"{mid}-{short_hash(key, 4)}"
                stats["id_collisions"] += 1
            key_to_id[(cat, key)] = mid
            shards[cat][mid] = {
                "category": cat, "brand": brand, "name": name[:120], "status": "active",
                "aliases": {"model_keys": [key]}, "specs": {}, "review": {"status": "auto"},
            }
        model = shards[cat][mid]
        variant = detect_variant(item["text"])
        if variant:
            model.setdefault("variants", {})[variant[0]] = variant[1]
        for f, v in specs_for(item).items():
            cur = model["specs"].get(f)
            if cur is None:
                model["specs"][f] = v
            elif cur["value"] != v["value"]:
                conflicts.append(f"{mid} {f}: {cur['value']} vs {v['value']}")
        if item.get("vendor_ref"):
            refs = model["aliases"].setdefault("vendor_refs", {}).setdefault("coolpc", [])
            if item["vendor_ref"] not in refs:
                refs.append(item["vendor_ref"])

        offer_items = [{"role": "main", "model_id": mid, "match": "model_key"}]
        if variant:
            offer_items[0]["variant"] = variant[0]
        for part in (split_combo(item["text"]) or [])[1:]:
            offer_items.append({"role": part["kind"], "match": "unmatched", "text": part["text"][:120]})
            stats["combo_parts"] += 1
        ref = item.get("vendor_ref")
        oid = f"coolpc:{ref}" if ref and re.fullmatch(r"[A-Za-z0-9_.-]+", ref) else f"coolpc:h{short_hash(item['text'])}"
        offers.append({
            "offer_id": oid, "category": cat,
            "vendor_section": {"id": item.get("select", ""), "group": item.get("group", "")},
            "raw_title": item["text"], **price_fields(item, year), "items": offer_items,
        })

    # offer_id 必須唯一：通路代碼重複時改用品名雜湊
    counts = Counter(o["offer_id"] for o in offers)
    stats["vendor_ref_duplicates"] = sum(1 for c in counts.values() if c > 1)
    for o in offers:
        if counts[o["offer_id"]] > 1:
            o["offer_id"] = f"coolpc:h{short_hash(o['raw_title'])}"
    # 品名完全相同的列（重複上架）仍可能重複：加序號
    seen: Counter = Counter()
    for o in offers:
        seen[o["offer_id"]] += 1
        if seen[o["offer_id"]] > 1:
            o["offer_id"] += f"-{seen[o['offer_id']]}"

    catalog = {
        cat: {"schema_version": "1.0", "category": cat, "generated_at": meta["fetched_at"],
              "models": dict(sorted(models.items()))}
        for cat, models in shards.items()
    }
    prices = {
        "schema_version": "1.0", "vendor": "coolpc", "source_url": meta["source_url"],
        "fetched_at": meta["fetched_at"], "status": "ok", "offers": offers,
    }
    stats["models"] = sum(len(m) for m in shards.values())
    stats["offers"] = len(offers)
    stats["spec_conflicts"] = len(conflicts)
    stats["offers_with_vendor_ref"] = sum(1 for i in items if i.get("vendor_ref"))
    return catalog, prices, {"stats": stats, "conflicts": conflicts, "unknown_brands": unknown_brands}


def runtime_bundle(catalog: dict[str, dict]) -> dict:
    """前端精簡版：只留值，近似值（有 tolerance 或來源為 title/inferred 的間隙與長度）以 ~ 標記。"""
    out = {}
    for cat, shard in catalog.items():
        rows = {}
        for mid, m in shard["models"].items():
            specs = {}
            for f, v in m["specs"].items():
                specs[f] = v["value"]
                if v.get("tolerance") or v.get("conditions"):
                    specs[f + "~"] = [v.get("tolerance", 0)] + [c["value"] for c in v.get("conditions", [])]
            rows[mid] = [m["brand"], m["name"], specs]
        out[cat] = rows
    return out


def write_json(path: Path, doc: dict, compact: bool = False) -> tuple[int, int]:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(doc, ensure_ascii=False, separators=(",", ":") if compact else None,
                     indent=None if compact else 1).encode("utf-8")
    path.write_bytes(raw)
    return len(raw), len(gzip.compress(raw, 9))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("items", type=Path)
    ap.add_argument("--out", type=Path, default=Path("poc/out/draft"))
    args = ap.parse_args()
    lines = [json.loads(line) for line in args.items.read_text(encoding="utf-8").splitlines() if line.strip()]
    meta, items = lines[0]["meta"], lines[1:]

    catalog, prices, info = build(items, meta)
    sizes = {}
    for cat, shard in catalog.items():
        sizes[f"catalog/{cat}.json"] = write_json(args.out / "catalog" / f"{cat}.json", shard)
    sizes["prices/coolpc.json"] = write_json(args.out / "prices" / "coolpc.json", prices)
    no_title = {**prices, "offers": [{k: v for k, v in o.items() if k != "raw_title"} for o in prices["offers"]]}
    sizes["prices/coolpc.json（不含 raw_title，compact）"] = write_json(args.out / "prices" / "coolpc.min.json", no_title, compact=True)
    sizes["runtime/catalog.min.json"] = write_json(args.out / "runtime" / "catalog.min.json", runtime_bundle(catalog), compact=True)

    errors = validate(sorted((args.out / "catalog").glob("*.json")), [args.out / "prices" / "coolpc.json"])

    print("# 草稿規格庫產生結果\n")
    print("| 項目 | 數量 |\n| :-- | --: |")
    for k, v in sorted(info["stats"].items()):
        print(f"| {k} | {v} |")
    print("\n| 類別 | 型號數 | 有變體 | 各欄位涵蓋率 |\n| :-- | --: | --: | :-- |")
    for cat, shard in sorted(catalog.items()):
        ms = shard["models"].values()
        fields = Counter(f for m in ms for f in m["specs"])
        cov = "、".join(f"{f} {n / len(ms):.0%}" for f, n in fields.most_common())
        print(f"| {cat} | {len(ms)} | {sum(1 for m in ms if m.get('variants'))} | {cov} |")
    print("\n| 檔案 | 原始 | gzip |\n| :-- | --: | --: |")
    total_raw = total_gz = 0
    for name, (raw, gz) in sizes.items():
        print(f"| {name} | {raw / 1024:.0f} KB | {gz / 1024:.0f} KB |")
        if name.startswith("catalog/"):
            total_raw += raw
            total_gz += gz
    print(f"| catalog/*.json 合計 | {total_raw / 1024:.0f} KB | {total_gz / 1024:.0f} KB |")
    print(f"\nschema 驗證錯誤：{len(errors)}")
    for e in errors[:30]:
        print("  -", e)
    print(f"\n規格衝突（同型號不同列的值不一致）：{len(info['conflicts'])}")
    for c in info["conflicts"][:40]:
        print("  -", c)
    print("\n未辨識品牌（開頭字樣, 列數）：", info["unknown_brands"].most_common(30))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
