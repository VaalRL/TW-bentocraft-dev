"""PoC：驗證 GitHub Actions 能否抓取原價屋估價頁，並量測品名規格擷取率。

用法：
    python poc/coolpc_probe.py --out poc/out            # 線上抓取
    python poc/coolpc_probe.py --html saved.html --out poc/out   # 解析本機存檔

只用標準函式庫。每次執行只對原價屋發出 robots.txt 與 evaluate.php 各一次請求。
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.coolpc import EVALUATE_URL, ROBOTS_URL, SelectParser, decode_html, fetch  # noqa: E402
from pipeline.extract import REQUIRED_FIELDS, classify_category, extract  # noqa: E402

USER_AGENT = "TW-bentocraft-PoC/0.1 (+https://github.com/VaalRL/TW-bentocraft)"
SAMPLES_PER_CATEGORY = 3
MISSING_SAMPLES = 25
AUDIT_SEED = 20261012


def inherit_case_specs(items: list[dict]) -> int:
    """組合列（機殼+電源等）或缺值的機殼，從同型號單品列繼承間隙規格。回傳補上的列數。"""
    fields = ("gpu_clearance_mm", "cooler_clearance_mm")
    donors: dict[str, dict] = {}
    for i in items:
        if not i.get("combo_parts") and all(i.get(f) for f in fields):
            donors.setdefault(i["model_key"], i)
    filled = 0
    for i in items:
        if all(i.get(f) for f in fields):
            continue
        donor = donors.get(i["model_key"])
        if donor:
            for f in fields:
                i[f] = i.get(f) or donor[f]
            i["inherited_from"] = donor["text"][:60]
            filled += 1
    return filled


def analyse(html: str, audit_per_category: int = 0) -> dict:
    parser = SelectParser()
    parser.feed(html)
    parser.close()

    report: dict = {"select_count": len(parser.selects), "selects": [], "categories": {}}
    per_cat: dict[str, list[dict]] = defaultdict(list)
    out_of_scope: Counter = Counter()
    for sel in parser.selects:
        cat = classify_category(sel["label"])
        priced = 0
        for opt in sel["options"]:
            # 下拉選單標籤（如「封閉式｜開放式水冷」）與 optgroup 一起作為擷取上下文
            fields = extract(cat, opt["text"], opt["group"], sel["label"])
            if "price" not in fields:
                continue
            priced += 1
            if not cat:
                continue
            if fields["in_scope"]:
                per_cat[cat].append({"text": opt["text"], "group": opt["group"], "select": sel["name"],
                                     "select_label": sel["label"], "vendor_ref": opt["value"], **fields})
            else:
                out_of_scope[cat] += 1
        report["selects"].append(
            {"name": sel["name"], "label": sel["label"], "category": cat,
             "options": len(sel["options"]), "priced_options": priced,
             "groups": sorted({o["group"] for o in sel["options"] if o["group"]})}
        )

    raw_ok: dict[str, float] = {}
    for cat, items in per_cat.items():
        required = REQUIRED_FIELDS.get(cat, ())
        if required:
            raw_ok[cat] = round(sum(1 for i in items if all(i.get(f) for f in required)) / len(items), 3)
    inherited = inherit_case_specs(per_cat["case"]) if per_cat.get("case") else 0

    rng = random.Random(AUDIT_SEED)
    report["audit"] = {
        cat: rng.sample(items, min(audit_per_category, len(items)))
        for cat, items in sorted(per_cat.items()) if audit_per_category
    }

    for cat, items in per_cat.items():
        required = REQUIRED_FIELDS.get(cat, ())

        def ok(i):
            return all(i.get(f) for f in required)

        by_group: dict[str, list[dict]] = defaultdict(list)
        for i in items:
            by_group[i["group"]].append(i)
        report["categories"][cat] = {
            "items": len(items),
            "out_of_scope": out_of_scope[cat],
            "bundle_only": sum(1 for i in items if i["bundle_only"]),
            "combo_discount": sum(1 for i in items if i.get("combo_discount")),
            "field_coverage": {f: round(sum(1 for i in items if i.get(f)) / len(items), 3) for f in required},
            "all_required_fields": round(sum(1 for i in items if ok(i)) / len(items), 3) if required else None,
            "all_required_fields_raw": raw_ok.get(cat),
            "combo_rows": sum(1 for i in items if i.get("combo_parts")),
            "combo_kinds": Counter(k for i in items for k in (i.get("combo_parts") or [])).most_common(),
            "inherited": inherited if cat == "case" else 0,
            "with_gift": sum(1 for i in items if i.get("gift")),
            "with_alt_value": sum(1 for i in items if i.get("gpu_clearance_alt_mm") or i.get("cooler_clearance_alt_mm")),
            "group_coverage": sorted(
                ((g, len(v), round(sum(1 for i in v if ok(i)) / len(v), 2)) for g, v in by_group.items()),
                key=lambda x: x[2],
            ),
            "value_counts": {
                f: Counter(str(i.get(f)) for i in items).most_common(10)
                for f in ("socket", "memory_type", "form_factor", "psu_form", "max_form_factor", "igpu")
                if any(f in i for i in items)
            },
            "samples": items[:SAMPLES_PER_CATEGORY],
            "missing_samples": [i["text"] for i in items if not ok(i)][:MISSING_SAMPLES],
        }
    report["items"] = per_cat
    return report


def to_markdown(meta: dict, report: dict | None) -> str:
    lines = ["# CoolPC PoC probe", ""]
    lines.append("| 請求 | 狀態 | 位元組 | 耗時(s) | 備註 |")
    lines.append("| :-- | :-- | --: | --: | :-- |")
    for r in meta["requests"]:
        note = r.get("error") or r.get("content_type") or ""
        lines.append(f"| `{r['url']}` | {r['status']} | {r['bytes']} | {r['elapsed_s']} | {note} |")
    if meta.get("encoding"):
        lines += ["", f"偵測編碼：`{meta['encoding']}`"]
    if not report:
        return "\n".join(lines) + "\n"
    lines += ["", f"`<select>` 數量：{report['select_count']}", ""]
    lines.append("| 類別 | 範圍內品項 | 排除 | 附條件價 | 任搭折抵 | 必要欄位全數擷取（直接 → 含繼承） | 各欄位擷取率 |")
    lines.append("| :-- | --: | --: | --: | --: | --: | :-- |")
    for cat, c in sorted(report["categories"].items()):
        cov = ", ".join(f"{k} {v:.0%}" for k, v in c["field_coverage"].items()) or "—"
        allf = "—" if c["all_required_fields"] is None else (
            f"{c['all_required_fields_raw']:.0%} → {c['all_required_fields']:.0%}")
        lines.append(f"| {cat} | {c['items']} | {c['out_of_scope']} | {c['bundle_only']} | "
                     f"{c['combo_discount']} | {allf} | {cov} |")
    case = report["categories"].get("case")
    if case:
        lines += ["", f"機殼組合列：{case['combo_rows']}（{case['combo_kinds']}）；"
                  f"由同型號單品繼承規格：{case['inherited']}；含括號條件值：{case['with_alt_value']}"]
    unmapped = [s for s in report["selects"] if not s["category"] and s["priced_options"]]
    if unmapped:
        lines += ["", "未對應類別的下拉選單：", ""]
        lines += [f"- `{s['name']}` {s['label']}（{s['priced_options']} 項）" for s in unmapped]
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", help="解析本機 HTML 檔，不連網")
    ap.add_argument("--out", default="poc/out")
    ap.add_argument("--save-html", action="store_true", help="保存原始 HTML 至輸出目錄")
    ap.add_argument("--audit", type=int, default=0, help="每類別固定種子抽樣 N 筆，供人工核對")
    ap.add_argument("--dump-items", action="store_true", help="輸出全部範圍內品項至 items.jsonl（供 to_catalog.py）")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    meta: dict = {"requests": []}
    if args.html:
        body, ctype = Path(args.html).read_bytes(), None
        meta["requests"].append({"url": args.html, "status": "local", "bytes": len(body), "elapsed_s": 0})
    else:
        robots = fetch(ROBOTS_URL, user_agent=USER_AGENT)
        meta["robots_txt"] = robots["body"].decode("utf-8", "replace")[:4000] if robots["status"] == 200 else None
        time.sleep(2)
        page = fetch(EVALUATE_URL, timeout=60, user_agent=USER_AGENT)
        for r in (robots, page):
            meta["requests"].append({k: v for k, v in r.items() if k != "body"})
        body, ctype = page["body"], page.get("content_type")
        if page["status"] != 200 or not body:
            (out / "report.md").write_text(to_markdown(meta, None), encoding="utf-8")
            (out / "report.json").write_text(json.dumps({"meta": meta}, ensure_ascii=False, indent=2), encoding="utf-8")
            print(to_markdown(meta, None))
            return 1

    html, enc = decode_html(body, ctype)
    meta["encoding"] = enc
    if args.save_html:
        (out / "evaluate.html").write_bytes(body)
    report = analyse(html, args.audit)
    meta["fetched_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if args.dump_items:
        with open(out / "items.jsonl", "w", encoding="utf-8") as f:
            f.write(json.dumps({"meta": {"fetched_at": meta["fetched_at"], "source_url": EVALUATE_URL}},
                               ensure_ascii=False) + "\n")
            for cat, items in sorted(report.pop("items").items()):
                for i in items:
                    f.write(json.dumps({"category": cat, **i}, ensure_ascii=False) + "\n")
    else:
        report.pop("items")
    md = to_markdown(meta, report)
    (out / "report.md").write_text(md, encoding="utf-8")
    (out / "report.json").write_text(json.dumps({"meta": meta, "report": report}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(md)
    if meta.get("robots_txt"):
        print("## robots.txt\n```\n" + meta["robots_txt"] + "\n```")
    # 日誌中列出少量樣本，供下一輪調整擷取規則
    for cat, c in sorted(report["categories"].items()):
        print(f"\n## {cat} value counts")
        print(json.dumps(c["value_counts"], ensure_ascii=False))
        print(f"## {cat} group coverage (group, items, all-required ratio)")
        for g in c["group_coverage"]:
            print("  ", json.dumps(g, ensure_ascii=False))
        print(f"## {cat} missing required fields")
        for t in c["missing_samples"]:
            print("  -", t)
    audit_keys = ("price", "list_price", "combo_discount", "bundle_only", "gift", "socket", "igpu", "memory_type",
                  "form_factor", "capacity_gb", "length_mm", "height_mm", "radiator_mm", "gpu_clearance_mm",
                  "gpu_clearance_alt_mm", "cooler_clearance_mm", "cooler_clearance_alt_mm", "max_form_factor",
                  "combo_parts", "inherited_from", "wattage", "psu_form")
    with open(out / "audit.jsonl", "w", encoding="utf-8") as f:
        for cat, items in report.get("audit", {}).items():
            print(f"\n## AUDIT {cat}")
            for n, i in enumerate(items, 1):
                vals = {k: i[k] for k in audit_keys if i.get(k) is not None and (i[k] is not False or k == "igpu")}
                print(f"A {cat} {n:02d} | {json.dumps(vals, ensure_ascii=False)} | [{i['group'][:30]}] {i['text']}")
                f.write(json.dumps({"category": cat, **i}, ensure_ascii=False) + "\n")
    print("\n## selects")
    for s in report["selects"]:
        if s["priced_options"]:
            print(json.dumps({k: v for k, v in s.items() if k != "groups"}, ensure_ascii=False))
    return 0 if report["categories"] else 2


if __name__ == "__main__":
    sys.exit(main())
