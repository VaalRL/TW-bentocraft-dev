"""CPU 算圖跑分（Blender Open Data）整理測試。"""
import unittest

from pipeline.benchmarks import Result, catalog_key, cpu_key, medians, pick_version


class KeyTest(unittest.TestCase):
    def test_blender_names(self):
        self.assertEqual(cpu_key("AMD Ryzen 7 9800X3D 8-Core Processor"), "amd:9800X3D")
        self.assertEqual(cpu_key("AMD Ryzen 9 9950X3D2 16-Core Processor"), "amd:9950X3D2")
        self.assertEqual(cpu_key("AMD Ryzen 5 3400G with Radeon Vega Graphics"), "amd:3400G")
        self.assertEqual(cpu_key("Intel(R) Core(TM) Ultra 7 265K"), "intel:265K")
        self.assertEqual(cpu_key("12th Gen Intel(R) Core(TM) i5-12400F"), "intel:12400")  # F 款與一般款同晶片
        self.assertEqual(cpu_key("Intel(R) Core(TM) Ultra 5 250KF Plus"), "intel:250KPLUS")
        self.assertIsNone(cpu_key("Apple M4 Max"))

    def test_catalog_names_match(self):
        self.assertEqual(catalog_key("cpu:amd:r7-7800x3d-tray", "AMD", "R7 7800X3D Tray盤"), "amd:7800X3D")
        self.assertEqual(catalog_key("cpu:amd:r5-8400f", "AMD", "R5 8400F盒"), "amd:8400F")  # AMD 的 F 是不同型號
        self.assertEqual(catalog_key("cpu:intel:core-ultra-5-245kf", "Intel", "Core Ultra 5 245KF"), "intel:245K")
        self.assertEqual(catalog_key("cpu:intel:i5-14400f", "Intel", "i5-14400F"), "intel:14400")
        # 7700 與 7700X、14700 與 14700K 是不同型號
        self.assertNotEqual(cpu_key("AMD Ryzen 7 7700X 8-Core Processor"), catalog_key("x", "AMD", "R7 7700 MPK"))
        self.assertNotEqual(cpu_key("Intel(R) Core(TM) i7-14700K"), catalog_key("x", "Intel", "i7-14700"))


class AggregateTest(unittest.TestCase):
    def results(self, name, version, scores):
        return [Result(name, version, s) for s in scores]

    def test_version_with_most_coverage_wins(self):
        rs = (self.results("AMD Ryzen 7 9800X3D", "4.4.0", [1] * 5) + self.results("Intel(R) Core(TM) Ultra 7 265K", "4.4.0", [1] * 5)
              + self.results("AMD Ryzen 7 9800X3D", "4.5.0", [1] * 9) + self.results("Intel(R) Core(TM) Ultra 7 265K", "4.5.0", [1] * 2))
        self.assertEqual(pick_version(rs, {"amd:9800X3D", "intel:265K"}), "4.4.0")
        self.assertIsNone(pick_version(rs, {"amd:7700"}))

    def test_median_and_min_samples(self):
        rs = self.results("AMD Ryzen 7 9800X3D", "4.5.0", [100, 300, 200, 250, 150]) + self.results("Intel(R) Core(TM) i5-14400", "4.5.0", [9] * 4)
        self.assertEqual(medians(rs, "4.5.0"), {"amd:9800X3D": (200, 5)})


if __name__ == "__main__":
    unittest.main()
