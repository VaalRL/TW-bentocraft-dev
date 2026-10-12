"""規格庫與報價 schema 測試：範例必須通過，每條規則都要有會被擋下的反例。"""
import copy
import json
import unittest
from pathlib import Path

from validate import CATALOG_VALIDATOR, PRICES_VALIDATOR, catalog_errors, prices_errors, schema_errors, validate

EXAMPLES = Path(__file__).resolve().parent / "examples"


def load(name: str) -> dict:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


class ExamplesTest(unittest.TestCase):
    def test_examples_valid(self):
        errors = validate(sorted(EXAMPLES.glob("catalog.*.json")), [EXAMPLES / "prices.coolpc.json"])
        self.assertEqual(errors, [])


class CatalogRulesTest(unittest.TestCase):
    def setUp(self):
        self.case = load("catalog.case.json")
        self.gpu = load("catalog.gpu.json")
        self.cpu = load("catalog.cpu.json")

    def assertRejected(self, doc, fragment=""):
        errors = schema_errors(CATALOG_VALIDATOR, doc)
        self.assertTrue(errors, "預期被 schema 擋下")
        if fragment:
            self.assertTrue(any(fragment in e for e in errors), errors)

    def test_value_requires_source(self):
        del self.gpu["models"]["gpu:gigabyte:rtx5060ti-eagle-oc-8g"]["specs"]["length_mm"]["source"]
        self.assertRejected(self.gpu, "source")

    def test_unknown_spec_field_rejected(self):
        self.gpu["models"]["gpu:gigabyte:rtx5060ti-eagle-oc-8g"]["specs"]["len"] = {"value": 1, "source": "title"}
        self.assertRejected(self.gpu)

    def test_spec_fields_are_per_category(self):
        # socket 是 CPU 欄位，放在顯卡上要被擋
        self.gpu["models"]["gpu:gigabyte:rtx5060ti-eagle-oc-8g"]["specs"]["socket"] = {"value": "AM5", "source": "title"}
        self.assertRejected(self.gpu)

    def test_enum_values(self):
        self.cpu["models"]["cpu:amd:ryzen-5-8400f"]["specs"]["socket"]["value"] = "AM6"
        self.assertRejected(self.cpu)
        self.case["models"]["case:montech:hs02-pro"]["specs"]["max_mb_form_factor"]["value"] = "XL-ATX"
        self.assertRejected(self.case)

    def test_bad_model_id(self):
        m = self.gpu["models"].pop("gpu:gigabyte:rtx5060ti-eagle-oc-8g")
        self.gpu["models"]["gpu:技嘉:RTX5060Ti"] = m
        self.assertRejected(self.gpu)

    def test_verified_requires_csp_fields(self):
        del self.case["models"]["case:lian-li:a4-h2o"]["specs"]["psu_form_factors"]
        self.assertRejected(self.case, "psu_form_factors")
        # 同樣缺欄位但只是 auto，允許（缺欄位 = 未知）
        self.case["models"]["case:lian-li:a4-h2o"]["review"] = {"status": "auto"}
        self.assertEqual(schema_errors(CATALOG_VALIDATOR, self.case), [])

    def test_deprecated_requires_replaced_by(self):
        del self.cpu["models"]["cpu:amd:r5-5600x"]["replaced_by"]
        self.assertRejected(self.cpu, "replaced_by")

    def test_provenance_rules(self):
        spec = self.case["models"]["case:montech:hs02-pro"]["specs"]["gpu_clearance_mm"]
        spec["source"] = "inherited"
        self.assertRejected(self.case, "inherited_from")
        spec["inherited_from"] = "case:montech:hs02-pro"
        self.assertEqual(schema_errors(CATALOG_VALIDATOR, self.case), [])
        spec.pop("inherited_from")
        spec["source"] = "vendor_spec"
        self.assertRejected(self.case, "ref")
        spec["source"] = "manual"
        self.assertRejected(self.case)

    def test_clearance_condition_enum(self):
        cond = self.case["models"]["case:thermaltake:the-tower-300"]["specs"]["gpu_clearance_mm"]["conditions"][0]
        cond["when"] = "with_cover"
        self.assertRejected(self.case)

    def test_cross_shard_checks(self):
        cpu = copy.deepcopy(self.cpu)
        cpu["models"]["cpu:amd:r5-5600x"]["replaced_by"] = "cpu:amd:missing"
        self.assertTrue(any("不存在" in e for e in catalog_errors([cpu])))
        cpu = copy.deepcopy(self.cpu)
        cpu["models"]["cpu:amd:ryzen-5-5600x"]["status"] = "deprecated"
        cpu["models"]["cpu:amd:ryzen-5-5600x"]["replaced_by"] = "cpu:amd:ryzen-5-8400f"
        self.assertTrue(any("串接" in e for e in catalog_errors([cpu])))
        self.assertTrue(any("不一致" in e for e in catalog_errors([{**self.gpu, "category": "cpu"}])))


class PricesRulesTest(unittest.TestCase):
    def setUp(self):
        self.prices = load("prices.coolpc.json")

    def assertRejected(self, doc):
        self.assertTrue(schema_errors(PRICES_VALIDATOR, doc), "預期被 schema 擋下")

    def test_requires_category_needs_list(self):
        del self.prices["offers"][0]["price_condition"]["requires"]
        self.assertRejected(self.prices)

    def test_item_match_rules(self):
        item = self.prices["offers"][3]["items"][0]  # unmatched
        item["model_id"] = "gpu:zotac:rtx3060-twin-edge"
        self.assertRejected(self.prices)
        del item["text"]
        item["match"] = "model_key"
        self.assertEqual(schema_errors(PRICES_VALIDATOR, self.prices), [])
        del item["model_id"]
        self.assertRejected(self.prices)

    def test_offer_id_and_price(self):
        self.prices["offers"][0]["offer_id"] = "pchome:123"
        self.assertRejected(self.prices)
        self.prices = load("prices.coolpc.json")
        self.prices["offers"][0]["price"] = 0
        self.assertRejected(self.prices)

    def test_catalog_reference_checks(self):
        ids = {"cpu:amd:ryzen-5-8400f", "gpu:msi:rtx5080-16g-ventus-3x-oc"}
        errors = prices_errors(self.prices, ids)
        self.assertTrue(any("case:montech:hs02-pro" in e for e in errors))
        self.prices["offers"][1]["offer_id"] = self.prices["offers"][0]["offer_id"]
        self.assertTrue(any("重複" in e for e in prices_errors(self.prices, None)))


if __name__ == "__main__":
    unittest.main()
