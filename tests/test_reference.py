"""對照表（data/reference/specs.json）測試：規則比對順序、只補缺漏、規格庫已同步。"""
import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "schema"))

from pipeline.catalog import load_catalog  # noqa: E402
from pipeline.reference import apply_reference, load_reference, match_rule, sockets_from_mount_codes  # noqa: E402
from validate import CATALOG_VALIDATOR, schema_errors  # noqa: E402

REF = load_reference()


def model(category, name, **specs):
    return {"category": category, "brand": "x", "name": name, "status": "active", "specs": specs,
            "review": {"status": "auto"}}


def value(category, name, field):
    m = model(category, name)
    apply_reference(m, REF)
    return m["specs"].get(field, {}).get("value")


class TestRules(unittest.TestCase):
    def test_gpu_variants_resolve_to_the_right_chip(self):
        cases = {
            "RTX5060Ti 8G VENTUS 2X OC PLUS": 180,
            "RTX5060 8G VENTUS 2X OC": 145,
            "DUAL-RTX5060TI-O16G": 180,
            "RTX5070Ti 16G SHADOW 3X OC": 300,
            "RTX5070 12G VENTUS 2X OC": 250,
            "DUAL-RTX3050-O6G": 70,
            "RTX3050 WINDFORCE OC V2 8G": 130,
            "RX9060XT 8G-L/OC Hellhound 暗黑犬": 150,
            "RX9060XT 16G-A Reaper 遊蕩者": 160,
            "ATS-RX9070GRE-O12G": 220,
            "RX9070XT 16G-L/OC 暗黑犬": 304,
            "N730K-2GD3/OCV5": 49,
        }
        for name, watts in cases.items():
            with self.subTest(name=name):
                self.assertEqual(value("gpu", name, "board_power_w"), watts)

    def test_only_rtx5070_and_up_get_12v2x6(self):
        self.assertEqual(value("gpu", "RTX5070 SOLID", "power_connectors"), ["12V-2x6"])
        self.assertIsNone(value("gpu", "RTX5060Ti 8GB AMP", "power_connectors"))
        self.assertIsNone(value("gpu", "RX9070XT 16G-A 遊蕩者", "power_connectors"))

    def test_cpu_suffixes_are_not_confused(self):
        self.assertEqual(value("cpu", "R9 9950X", "max_power_w"), 230)
        self.assertEqual(value("cpu", "R9 9950X3D", "max_power_w"), 230)
        self.assertIsNone(value("cpu", "R9 9950X3D2", "max_power_w"))  # PPT 未確認，不填
        self.assertEqual(value("cpu", "Core Ultra 5 250KF Plus", "max_power_w"), 159)
        self.assertEqual(value("cpu", "Core Ultra 7 265K", "max_power_w"), 250)

    def test_cooler_only_for_boxed_parts(self):
        self.assertIs(value("cpu", "R5 8400F盒", "cooler_included"), True)
        self.assertIsNone(value("cpu", "R5 8400F", "cooler_included"))
        self.assertIsNone(value("cpu", "i5-14400F", "cooler_included"))  # 盒裝或盒裝以外無法從品名判斷
        self.assertIs(value("cpu", "R7 9800X3D", "cooler_included"), False)

    def test_unknown_names_are_left_alone(self):
        self.assertIsNone(match_rule(REF, "gpu", "Arc B580"))
        self.assertIsNone(match_rule(REF, "ram", "RTX5080"))


class TestMountCodes(unittest.TestCase):
    def test_legend(self):
        self.assertEqual(sockets_from_mount_codes("XZ"), ["AM4", "AM5", "LGA1700", "LGA1851"])
        self.assertEqual(sockets_from_mount_codes("Z"), ["LGA1700", "LGA1851"])
        self.assertIn("LGA1200", sockets_from_mount_codes("WXZ"))
        self.assertEqual(sockets_from_mount_codes("Q"), [])  # 圖例以外的代碼不猜

    def test_cooler_gets_sockets_from_codes(self):
        m = model("cooler", "AG400", mount_codes={"value": "XZ", "source": "title"})
        self.assertEqual(apply_reference(m, REF), ["sockets"])
        self.assertEqual(m["specs"]["sockets"]["source"], "retailer_spec")
        self.assertNotIn("LGA1200", m["specs"]["sockets"]["value"])


class TestDerived(unittest.TestCase):
    def test_mini_itx_has_two_slots(self):
        m = model("motherboard", "B850I", form_factor={"value": "Mini-ITX", "source": "title"})
        self.assertEqual(apply_reference(m, REF), ["dimm_slots"])
        self.assertEqual(m["specs"]["dimm_slots"]["value"], 2)
        atx = model("motherboard", "X870E", form_factor={"value": "ATX", "source": "title"})
        self.assertEqual(apply_reference(atx, REF), [])  # ATX 有 2 條也有 4 條，不推定


class TestApply(unittest.TestCase):
    def test_existing_values_are_kept(self):
        m = model("gpu", "RTX5080 X3", board_power_w={"value": 400, "source": "manual", "note": "實測"})
        self.assertEqual(apply_reference(m, REF), ["power_connectors"])
        self.assertEqual(m["specs"]["board_power_w"]["value"], 400)

    def test_verified_models_are_not_touched(self):
        m = model("cpu", "R7 9800X3D")
        m["review"] = {"status": "verified"}
        self.assertEqual(apply_reference(m, REF), [])

    def test_provenance(self):
        m = model("gpu", "RTX5080 X3")
        apply_reference(m, REF)
        self.assertEqual(m["specs"]["board_power_w"]["source"], "inferred")
        self.assertIn("RTX 5080", m["specs"]["board_power_w"]["note"])
        c = model("cpu", "R7 9800X3D")
        apply_reference(c, REF)
        self.assertEqual(c["specs"]["max_power_w"]["source"], "manual")


class TestCatalogInSync(unittest.TestCase):
    def test_catalog_has_reference_values_and_is_valid(self):
        shards = load_catalog(ROOT / "data/catalog")
        for cat in ("cpu", "gpu", "cooler", "motherboard"):
            for mid, m in shards[cat]["models"].items():
                with self.subTest(model=mid):
                    self.assertEqual(apply_reference(copy.deepcopy(m), REF), [],
                                     "對照表有值尚未回填，請執行 scripts/apply_reference.py")
            self.assertEqual(schema_errors(CATALOG_VALIDATOR, shards[cat]), [])


if __name__ == "__main__":
    unittest.main()
