"""規格完整度報告測試。"""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import catalog_coverage  # noqa: E402


def model(**specs):
    return {"status": "active", "specs": {k: {"value": v, "source": "title"} for k, v in specs.items()}}


SHARDS = {"cooler": {"models": {
    "cooler:a:air": model(cooler_type="air", height_mm=155),
    "cooler:a:air-unknown-height": model(cooler_type="air"),
    "cooler:a:aio": model(cooler_type="aio", radiator_mm=360),
    "cooler:a:unpriced": model(cooler_type="air"),
}}}


class CoverageTest(unittest.TestCase):
    def row(self, rows, field):
        return next(r for r in rows if r["category"] == "cooler" and r["field"] == field)

    def test_only_priced_and_applicable_models_count(self):
        prices = {"offers": [{"items": [{"role": "main", "model_id": mid}]}
                             for mid in ("cooler:a:air", "cooler:a:air-unknown-height", "cooler:a:aio")]
                  + [{"items": [{"role": "main", "match": "unmatched", "text": "x"}]}]}
        rows = catalog_coverage.coverage(SHARDS, catalog_coverage.priced_ids(prices))
        height = self.row(rows, "height_mm")  # 只算風冷，且不算沒報價的
        self.assertEqual((height["filled"], height["total"], height["missing"]),
                         (1, 2, ["cooler:a:air-unknown-height"]))
        self.assertEqual(self.row(rows, "radiator_mm")["total"], 1)  # 只算一體式水冷

    def test_markdown(self):
        md = catalog_coverage.markdown(catalog_coverage.coverage(SHARDS, None), "全部型號")
        self.assertIn("| cooler | `height_mm` | C5 | 1/3（33%） | 0 | 2 |", md)


if __name__ == "__main__":
    unittest.main()
