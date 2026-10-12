"""前端精簡資料產生測試。"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_web_data  # noqa: E402

SHARDS = {
    "case": {"category": "case", "models": {
        "case:thermaltake:the-tower-300": {
            "category": "case", "brand": "曜越 Thermaltake", "name": "The Tower 300", "status": "active",
            "variants": {"white": {"label": "白", "color": "white"}},
            "specs": {
                "gpu_clearance_mm": {"value": 400, "source": "title", "conditions": [
                    {"value": 280, "when": "psu_shroud_installed", "source": "retailer_spec", "ref": "https://x"}]},
                "psu_form_factors": {"value": ["ATX"], "source": "inferred"},
            },
            "review": {"status": "auto"},
        },
    }},
    "cpu": {"category": "cpu", "models": {
        "cpu:amd:r5-5600x": {"category": "cpu", "brand": "AMD", "name": "R5 5600X", "status": "deprecated",
                             "replaced_by": "cpu:amd:ryzen-5-5600x", "specs": {}, "review": {"status": "auto"}},
        "cpu:amd:ryzen-5-5600x": {"category": "cpu", "brand": "AMD", "name": "Ryzen 5 5600X", "status": "active",
                                  "specs": {"socket": {"value": "AM4", "source": "optgroup"}},
                                  "review": {"status": "verified"}},
    }},
}


class WebDataTest(unittest.TestCase):
    def test_catalog_keeps_engine_metadata_only(self):
        doc = build_web_data.build_catalog(SHARDS)
        case = doc["models"]["case:thermaltake:the-tower-300"]
        self.assertEqual(case["s"]["gpu_clearance_mm"], 400)
        self.assertEqual(case["x"]["gpu_clearance_mm"], {"k": [[280, "psu_shroud_installed"]]})
        self.assertEqual(case["x"]["psu_form_factors"], {"i": 1})
        self.assertEqual(case["v"], {"white": "白"})
        self.assertNotIn("ref", str(case))
        self.assertEqual(doc["redirects"], {"cpu:amd:r5-5600x": "cpu:amd:ryzen-5-5600x"})
        self.assertNotIn("cpu:amd:r5-5600x", doc["models"])
        self.assertEqual(doc["models"]["cpu:amd:ryzen-5-5600x"]["r"], "v")

    def test_prices_only_matched_offers(self):
        prices = {"fetched_at": "2026-10-13T03:17:00Z", "status": "ok", "vendor": "coolpc", "offers": [
            {"offer_id": "coolpc:ha", "category": "case", "price": 3990, "combo_discount": 90,
             "price_condition": {"type": "requires_category", "requires": ["motherboard"]},
             "items": [{"role": "main", "model_id": "case:thermaltake:the-tower-300", "variant": "white",
                        "match": "model_key"},
                       {"role": "psu", "match": "unmatched", "text": "華碩 TUF 750W"}]},
            {"offer_id": "coolpc:hb", "category": "gpu", "price": 1,
             "items": [{"role": "main", "match": "unmatched", "text": "未知顯卡"}]},
        ]}
        doc = build_web_data.build_prices(prices, {"case:thermaltake:the-tower-300"})
        self.assertEqual(doc["offers"], [{"m": "case:thermaltake:the-tower-300", "p": 3990, "v": "white", "d": 90,
                                          "c": {"t": "requires_category", "q": ["motherboard"]},
                                          "x": ["華碩 TUF 750W"]}])

    def test_missing_prices(self):
        self.assertEqual(build_web_data.build_prices(None, set())["status"], "missing")


if __name__ == "__main__":
    unittest.main()
