"""驗證規格庫分片與每日報價檔。

先以 JSON Schema（draft 2020-12）驗證結構，再做 schema 表達不了的跨檔檢查。

用法：
    python schema/validate.py --catalog data/catalog/*.json --prices data/prices/coolpc.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

SCHEMA_DIR = Path(__file__).resolve().parent
_SCHEMAS = {
    name: json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))
    for name in ("catalog.schema.json", "prices.schema.json")
}
_REGISTRY = Registry().with_resources(
    [(s["$id"], Resource.from_contents(s)) for s in _SCHEMAS.values()]
    + [(name, Resource.from_contents(s)) for name, s in _SCHEMAS.items()]
)


def _validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(
        _SCHEMAS[name], registry=_REGISTRY, format_checker=Draft202012Validator.FORMAT_CHECKER
    )


CATALOG_VALIDATOR = _validator("catalog.schema.json")
PRICES_VALIDATOR = _validator("prices.schema.json")


def _fmt(err) -> str:
    path = "/".join(str(p) for p in err.absolute_path) or "(root)"
    return f"{path}: {err.message}"


def schema_errors(validator: Draft202012Validator, doc: dict) -> list[str]:
    return [_fmt(e) for e in sorted(validator.iter_errors(doc), key=lambda e: list(e.absolute_path))]


def catalog_errors(shards: list[dict]) -> list[str]:
    """跨分片檢查：ID 前綴與類別一致、轉址目標存在且未棄用、verified 散熱器具備對應欄位。"""
    errors: list[str] = []
    models: dict[str, dict] = {}
    for shard in shards:
        for mid, m in shard.get("models", {}).items():
            if mid in models:
                errors.append(f"{mid}: 重複的型號 ID")
            models[mid] = m
            if m.get("category") != shard.get("category") or not mid.startswith(f"{shard.get('category')}:"):
                errors.append(f"{mid}: 型號類別與分片類別 {shard.get('category')} 不一致")
    for mid, m in models.items():
        target = m.get("replaced_by")
        if target:
            if target not in models:
                errors.append(f"{mid}: replaced_by 指向不存在的 {target}")
            elif models[target].get("status") == "deprecated":
                errors.append(f"{mid}: replaced_by 指向已棄用的 {target}（不得串接轉址）")
        if m.get("category") == "cooler" and m.get("review", {}).get("status") == "verified":
            specs = m.get("specs", {})
            kind = specs.get("cooler_type", {}).get("value")
            need = {"air": "height_mm", "aio": "radiator_mm"}.get(kind)
            if need and need not in specs:
                errors.append(f"{mid}: verified 的 {kind} 散熱器缺少 {need}")
    return errors


def prices_errors(prices: dict, catalog_ids: set[str] | None) -> list[str]:
    """報價檔檢查：offer_id 不重複；有提供規格庫時，對應的型號必須存在且主件類別一致。"""
    errors: list[str] = []
    seen: set[str] = set()
    for i, offer in enumerate(prices.get("offers", [])):
        oid = offer.get("offer_id")
        if oid in seen:
            errors.append(f"offers/{i}: 重複的 offer_id {oid}")
        seen.add(oid)
        for item in offer.get("items", []):
            mid = item.get("model_id")
            if not mid or catalog_ids is None:
                continue
            if mid not in catalog_ids:
                errors.append(f"offers/{i}: model_id {mid} 不在規格庫")
            elif item.get("role") == "main" and not mid.startswith(f"{offer.get('category')}:"):
                errors.append(f"offers/{i}: 主件 {mid} 與 offer 類別 {offer.get('category')} 不一致")
    return errors


def validate(catalog_paths: list[Path], prices_paths: list[Path]) -> list[str]:
    errors: list[str] = []
    shards = []
    for p in catalog_paths:
        doc = json.loads(p.read_text(encoding="utf-8"))
        shards.append(doc)
        errors += [f"{p}: {e}" for e in schema_errors(CATALOG_VALIDATOR, doc)]
    errors += catalog_errors(shards)
    catalog_ids = {mid for s in shards for mid in s.get("models", {})} if shards else None
    for p in prices_paths:
        doc = json.loads(p.read_text(encoding="utf-8"))
        errors += [f"{p}: {e}" for e in schema_errors(PRICES_VALIDATOR, doc)]
        errors += [f"{p}: {e}" for e in prices_errors(doc, catalog_ids)]
    return errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", nargs="*", default=[], type=Path)
    ap.add_argument("--prices", nargs="*", default=[], type=Path)
    ap.add_argument("--max-errors", type=int, default=50)
    args = ap.parse_args()
    errors = validate(args.catalog, args.prices)
    for e in errors[: args.max_errors]:
        print(e)
    if len(errors) > args.max_errors:
        print(f"…另有 {len(errors) - args.max_errors} 個錯誤")
    print(f"{len(args.catalog)} 個規格庫分片、{len(args.prices)} 個報價檔：{len(errors)} 個錯誤")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
