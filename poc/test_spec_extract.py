"""擷取規則單元測試。字串取自規格文件中的品名範例，僅驗證規則邏輯，不代表真實頁面格式。"""
import unittest

from spec_extract import classify_category, extract, extract_prices


class ExtractTest(unittest.TestCase):
    def test_prices(self):
        self.assertEqual(extract_prices("AMD R5 7500F, $4590↘$4290"), {"price": 4290, "list_price": 4590})
        self.assertEqual(extract_prices("X $12,250"), {"price": 12250, "list_price": None})
        self.assertIsNone(extract_prices("無價格"))

    def test_gpu_length_cm(self):
        f = extract("gpu", "微星 RTX4060 VENTUS 2X BLACK 8G OC(2490MHz/19.9cm/雙風扇/註四年) 促銷搭機價 $8990")
        self.assertEqual(f["length_mm"], 199.0)
        self.assertTrue(f["bundle_only"])
        self.assertEqual(f["price"], 8990)

    def test_motherboard(self):
        f = extract("motherboard", "技嘉 B650M GAMING X AX(M-ATX/Realtek 2.5G+Wi-Fi 6E/註冊五年)6+2+1相電源 $4690",
                    group_label="AMD AM5 DDR5")
        self.assertEqual((f["socket"], f["memory_type"], f["form_factor"]), ("AM5", "DDR5", "M-ATX"))

    def test_case(self):
        f = extract("case", "Montech Air 903 MAX 黑 (顯卡400/散熱180/E-ATX) $1890")
        self.assertEqual((f["gpu_clearance_mm"], f["cooler_clearance_mm"]), (400.0, 180.0))
        self.assertEqual(f["max_form_factor"], "E-ATX")

    def test_psu(self):
        f = extract("psu", "海韻 FOCUS GX-750 ATX3 (750W/金牌) $3790")
        self.assertEqual(f["wattage"], 750)
        self.assertIsNone(f["psu_form"])
        self.assertEqual(extract("psu", "銀欣 SX750 SFX 750W $5000")["psu_form"], "SFX")

    def test_cpu(self):
        f = extract("cpu", "AMD R5 7500F【6核/12緒】無內顯 $3990", group_label="AMD AM5")
        self.assertEqual(f["socket"], "AM5")
        self.assertTrue(f["no_igpu"])
        self.assertTrue(extract("cpu", "Intel i5-14400F $4290", group_label="Intel 1700")["no_igpu"])

    def test_cooler(self):
        self.assertEqual(extract("cooler", "利民 PA120 (高15.7cm) $1350")["height_or_radiator"], 157.0)
        self.assertEqual(extract("cooler", "NZXT Kraken 360 水冷 $5990")["radiator_mm"], 360)

    def test_ram(self):
        f = extract("ram", "威剛 32GB(16G*2) DDR5-6000 XPG Lancer $3199")
        self.assertEqual((f["memory_type"], f["capacity_gb"]), ("DDR5", 32))

    def test_classify(self):
        self.assertEqual(classify_category("處理器 CPU"), "cpu")
        self.assertEqual(classify_category("電源供應器"), "psu")
        self.assertIsNone(classify_category("滑鼠"))


if __name__ == "__main__":
    unittest.main()
