"""每日報價管線測試：以合成的估價頁片段驗證報價 ID、規格庫對應、草稿產生與失敗沿用。

品名格式取自 2026-10-12 PoC 實測的原價屋頁面。
"""
import copy
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "schema"))
sys.path.insert(0, str(ROOT / "scripts"))

from pipeline.catalog import CatalogIndex, main_text, new_models, price_fields, split_name  # noqa: E402
from pipeline.coolpc import parse_items  # noqa: E402
from pipeline.prices import build_offers, offer_id, write_prices  # noqa: E402
import update_prices  # noqa: E402
from validate import CATALOG_VALIDATOR, PRICES_VALIDATOR, schema_errors  # noqa: E402

ROWS = {
    ("n4", "處理器 CPU"): [
        ("AMD AM5 8000系列", "｛AMD R5 8400F盒｝【6核/12緒】4.2G(↑4.7G)65W【任搭主機板】, $4450 ◆ ★ ↓酷幣200↓"),
        ("AMD AM5 8000系列", "｛AMD R5 8400F盒｝【6核/12緒】4.2G(↑4.7G)65W, $4950 ◆ ★ ↓酷幣200↓"),
    ],
    ("n12", "顯示卡VGA"): [
        ("NVIDIA RTX5080-16GB(GDDR7)", "｛微星 RTX5080 16G VENTUS 3X OC｝2655MHz/31cm/三風扇/註五年, $53990 ◆ ★ ↓任搭190↓"),
    ],
    ("n14", "CASE 機殼(+電源)"): [
        ("君主 Montech 機殼", "｛Montech HS02 PRO 黑｝卡42/U高17.5/可翻轉機身/全景玻璃透側/背插/ATX, $3290 ◆ ★"),
        ("特價 or 活動專區", "Montech HS02 PRO(白) 玻璃透側/ATX+Montech PureFlow 360 ARGB(白)水冷 現省$1190！, $3790 ◆ ★"),
        ("特價 or 活動專區", "↪ 買 HS02 組合,送燈條 市價$1290！ ★"),
    ],
}


def page(rows=ROWS, repeat: int = 1) -> str:
    """產生與原價屋結構相同的估價頁片段；repeat > 1 時以不同型號名稱放大列數。"""
    parts = ['<html><head><meta charset="utf-8"></head><body><table>']
    for (name, label), opts in rows.items():
        parts.append(f"<tr><td>{label}</td><td><select name=\"{name}\">")
        groups: dict[str, list[str]] = {}
        for g, t in opts:
            groups.setdefault(g, []).append(t)
        for g, ts in groups.items():
            parts.append(f'<optgroup label="{g}">')
            for n in range(repeat):
                for i, t in enumerate(ts):
                    text = t if n == 0 else t.replace("｝", f" R{n}｝", 1)
                    parts.append(f'<option value="{i}">{text}</option>')
            parts.append("</optgroup>")
        parts.append("</select></td></tr>")
    parts.append("</table></body></html>")
    return "".join(parts)


class TitleQuirksTest(unittest.TestCase):
    """2026-10-13 估價頁出現、首版解析器沒處理的品名寫法。"""

    def test_missing_closing_brace(self):
        self.assertEqual(split_name("｛技嘉 Z890 AORUS XTREME AI TOP(E-ATX/2*10G LAN)/DDR5"),
                         ("技嘉 GIGABYTE", "gigabyte", "Z890 AORUS XTREME AI TOP"))
        self.assertEqual(split_name("｛WD 黑標 SN8100 2TB/Gen5 PCIe 5.0/讀14900")[1:], ("wd", "黑標 SN8100 2TB"))

    def test_assembly_prefix(self):
        text = "裝機價｛華碩 PRIME B850M-A｝M-ATX, $3990 ◆ ★"
        self.assertTrue(main_text({"text": text}).startswith("｛華碩"))
        self.assertEqual(price_fields({"text": text, "price": 3990}, 2026)["price_condition"], {"type": "assembly"})


class OfferIdTest(unittest.TestCase):
    def test_stable_when_price_and_promotions_change(self):
        base = {"select": "n14", "text": "｛COUGAR Airface Pure Pro 黑｝顯卡長32/CPU高17.5/玻璃透側/ATX 原價$1890！, $1590 ◆ ★"}
        changed = {"select": "n14", "text": "｛COUGAR Airface Pure Pro 黑｝顯卡長32/CPU高17.5/玻璃透側/ATX, $1690 ◆ ★ 熱賣 ↓任搭90↓"}
        self.assertEqual(offer_id(base), offer_id(changed))
        sale = {"select": "n15", "text": "｛華碩 ROG STRIX 1000W(白色)｝全模 送 ESD-T1W外接盒▼下殺到 10/31 20:00, $6590 ◆ ★"}
        after = {"select": "n15", "text": "｛華碩 ROG STRIX 1000W(白色)｝全模 送 ESD-T1W外接盒, $6990 ◆ ★"}
        self.assertEqual(offer_id(sale), offer_id(after))

    def test_different_products_differ(self):
        a = {"select": "n12", "text": "｛微星 RTX5080 16G VENTUS 3X OC｝31cm, $53990"}
        b = {"select": "n12", "text": "｛微星 RTX5070 12G VENTUS 2X OC｝24cm, $28990"}
        self.assertNotEqual(offer_id(a), offer_id(b))


class BuildTest(unittest.TestCase):
    def setUp(self):
        self.items = parse_items(page())
        self.empty = {cat: {"schema_version": "1.0", "category": cat, "models": {}}
                      for cat in ("cpu", "motherboard", "ram", "gpu", "cooler", "case", "psu", "ssd")}

    def test_parse_skips_notes(self):
        self.assertEqual(len(self.items), 5)  # 「↪ 買…送…」附註列不是商品

    def test_bootstrap_then_match(self):
        created, stats = new_models(self.items, self.empty)
        shards = copy.deepcopy(self.empty)
        for cat, models in created.items():
            shards[cat]["models"].update(models)
            self.assertEqual(schema_errors(CATALOG_VALIDATOR, shards[cat]), [])
        # 組合列與單品列（黑／白）歸為同一個機殼型號
        self.assertEqual(len(created["case"]), 1)
        case = next(iter(created["case"].values()))
        self.assertEqual(case["specs"]["gpu_clearance_mm"]["value"], 420)
        self.assertEqual(set(case["variants"]), {"black", "white"})

        offers, per_cat = build_offers(self.items, CatalogIndex(shards), 2026)
        self.assertEqual(per_cat["case"], {"offers": 2, "matched": 2})
        combo = next(o for o in offers if len(o["items"]) > 1)
        self.assertEqual([i["role"] for i in combo["items"]], ["main", "aio"])
        self.assertEqual(combo["items"][1]["match"], "unmatched")
        cpu = next(o for o in offers if o.get("price_condition"))
        self.assertEqual(cpu["price_condition"]["requires"], ["motherboard"])
        doc = {"schema_version": "1.0", "vendor": "coolpc", "source_url": "https://www.coolpc.com.tw/evaluate.php",
               "fetched_at": "2026-10-12T03:17:00Z", "status": "ok", "offers": offers}
        self.assertEqual(schema_errors(PRICES_VALIDATOR, doc), [])
        self.assertNotIn("raw_title", offers[0])

    def test_unmatched_without_catalog(self):
        offers, per_cat = build_offers(self.items, CatalogIndex(self.empty), 2026)
        self.assertTrue(all(o["items"][0]["match"] == "unmatched" for o in offers))
        self.assertEqual(per_cat["gpu"], {"offers": 1, "matched": 0})

    def test_existing_models_are_never_modified(self):
        shards = copy.deepcopy(self.empty)
        shards["gpu"]["models"]["gpu:msi:rtx5080-16g-ventus-3x-oc"] = {
            "category": "gpu", "brand": "微星 MSI", "name": "RTX5080 16G VENTUS 3X OC", "status": "active",
            "aliases": {"model_keys": ["微星RTX508016GVENTUS3XOC"]},
            "specs": {"length_mm": {"value": 303, "source": "retailer_spec", "ref": "https://example.com"}},
            "review": {"status": "verified"},
        }
        created, _ = new_models(self.items, shards)
        self.assertEqual(created["gpu"], {})

    def test_conflicting_rows_become_draft(self):
        items = parse_items(page({("n14", "CASE 機殼(+電源)"): [
            ("x", "｛Fractal Design Meshify 3 TG 黑｝顯卡長34.9/CPU高17/ATX, $3990"),
            ("x", "｛Fractal Design Meshify 3 TG 白｝顯卡長34.95/CPU高17/ATX, $4090"),
        ]}))
        created, stats = new_models(items, self.empty)
        model = next(iter(created["case"].values()))
        self.assertEqual(model["review"]["status"], "draft")
        self.assertEqual(stats["spec_conflicts"], 1)


class UpdatePricesTest(unittest.TestCase):
    def run_main(self, html: str, out: Path, extra=()):
        out.parent.mkdir(parents=True, exist_ok=True)
        src = out.parent / "page.html"
        src.write_text(html, encoding="utf-8")
        gh_out = out.parent / "gh_output"
        argv = ["update_prices.py", "--html", str(src), "--out", str(out),
                "--catalog-dir", str(out.parent / "catalog"), *extra]
        with mock.patch.object(sys, "argv", argv), mock.patch.dict(os.environ, {"GITHUB_OUTPUT": str(gh_out)}), \
                mock.patch.object(update_prices, "MIN_ITEMS", 3), redirect_stdout(io.StringIO()):
            code = update_prices.main()
        return code, gh_out.read_text() if gh_out.exists() else ""

    def test_success_then_stale_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "prices" / "coolpc.json"
            code, gh = self.run_main(page(repeat=2), out)
            self.assertEqual(code, 0)
            self.assertIn("crawl_ok=true", gh)
            first = json.loads(out.read_text())
            self.assertEqual(first["status"], "ok")
            self.assertEqual(schema_errors(PRICES_VALIDATOR, first), [])

            # 第二次只解析出 1 列：低於下限，沿用上次的報價列
            (out.parent / "gh_output").unlink()
            code, gh = self.run_main(page({("n12", "顯示卡VGA"): ROWS[("n12", "顯示卡VGA")]}), out)
            self.assertEqual(code, 0)
            self.assertIn("crawl_ok=false", gh)
            second = json.loads(out.read_text())
            self.assertEqual(second["status"], "stale")
            self.assertEqual(second["offers"], first["offers"])
            self.assertEqual(second["fetched_at"], first["fetched_at"])
            self.assertEqual(schema_errors(PRICES_VALIDATOR, second), [])

    def test_failure_without_previous_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "coolpc.json"
            code, gh = self.run_main("<html></html>", out)
            self.assertEqual(code, 1)
            self.assertIn("crawl_ok=false", gh)
            self.assertFalse(out.exists())

    def test_one_offer_per_line(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "coolpc.json"
            doc = {"schema_version": "1.0", "offers": [{"offer_id": "a"}, {"offer_id": "b"}]}
            write_prices(out, doc)
            self.assertEqual(json.loads(out.read_text()), doc)
            self.assertEqual(sum('"offer_id"' in line for line in out.read_text().splitlines()), 2)

    def test_robots(self):
        self.assertTrue(update_prices.robots_allows(b"User-agent: Googlebot\nDisallow: /book/\n"))
        self.assertFalse(update_prices.robots_allows(b"User-agent: *\nDisallow: /\n"))
        self.assertTrue(update_prices.robots_allows(b"User-agent: *\nDisallow: /book/\n"))


if __name__ == "__main__":
    unittest.main()
