"""CPU 算圖跑分（Blender Open Data）整理測試。"""
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

from pipeline.benchmarks import Result, catalog_key, cpu_key, medians, parse_line, pick_version, read_snapshot

ROOT = Path(__file__).resolve().parent.parent


def run(scene, spm, name="AMD Ryzen 7 9800X3D 8-Core Processor", device_type="CPU", version="4.5.0", sockets=1):
    """快照中一個場景的結果（schema v4 的 data[] 元素，欄位取自 benchmark-launcher-cli 3.1 的輸出）。"""
    return {
        "blender_version": {"version": version, "label": version},
        "scene": {"label": scene},
        "system_info": {"num_cpu_sockets": sockets, "devices": [{"type": "CPU", "name": name}]},
        "device_info": {"device_type": device_type, "compute_devices": [{"type": device_type, "name": name}]},
        "stats": {"samples_per_minute": spm},
    }


def line(scores=(100, 50, 80), **kw):
    return json.dumps({"id": "x", "schema_version": "v4", "created_at": "2026-10-01T00:00:00+00:00",
                       "data": [run(s, v, **kw) for s, v in zip(("monster", "junkshop", "classroom"), scores)]})


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


class ParseTest(unittest.TestCase):
    def test_cpu_run_sums_three_scenes(self):
        self.assertEqual(parse_line(line()), Result("AMD Ryzen 7 9800X3D 8-Core Processor", "4.5", 230))

    def test_rejects_gpu_partial_multisocket_and_old_schema(self):
        self.assertIsNone(parse_line(line(device_type="OPTIX")))
        self.assertIsNone(parse_line(line(sockets=2)))
        partial = json.loads(line())
        partial["data"].pop()
        self.assertIsNone(parse_line(json.dumps(partial)))
        self.assertIsNone(parse_line(json.dumps({"schema_version": "v3", "data": []})))
        self.assertIsNone(parse_line("not json"))

    def test_snapshot_zip_and_script(self):
        with tempfile.TemporaryDirectory() as d:
            zp = Path(d, "snap.zip")
            lines = [line((100 + i, 50, 80)) for i in range(5)]
            lines += [line(name="Intel Core Ultra 7 265K")] * 2  # 樣本不足
            with zipfile.ZipFile(zp, "w") as z:
                z.writestr("opendata-2026-10-11-000000+0000.jsonl", "\n".join(lines) + "\n")
                z.writestr("LICENSE.txt", "CC0 1.0 Universal")
            results, member = read_snapshot(zp)
            self.assertEqual(len(list(results)), 7)
            out = Path(d, "out.json")
            subprocess.run([sys.executable, str(ROOT / "scripts/update_cpu_benchmarks.py"), "--zip", str(zp), "--out", str(out)],
                           check=True, capture_output=True)
            doc = json.loads(out.read_text())
            self.assertEqual((doc["blender_version"], doc["snapshot_date"]), ("4.5", "2026-10-11"))
            self.assertEqual(doc["scores"], {"amd:9800X3D": [232.0, 5]})
            with zipfile.ZipFile(zp, "w") as z:  # 授權不是 CC0 時拒絕
                z.writestr("a.jsonl", "")
                z.writestr("LICENSE.txt", "All rights reserved")
            with self.assertRaises(ValueError):
                read_snapshot(zp)


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
