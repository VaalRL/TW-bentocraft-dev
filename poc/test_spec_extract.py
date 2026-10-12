"""擷取規則單元測試。字串格式取自 2026-10-12 Actions 實測抓到的原價屋品名。"""
import unittest

from spec_extract import classify_category, extract, extract_prices, is_in_scope


class PriceTest(unittest.TestCase):
    def test_final_price_after_comma(self):
        self.assertEqual(
            extract_prices("｛COUGAR Airface Pure Pro 黑｝顯卡長32/CPU高17.5/玻璃透側/ATX 原價$1890！, $1590 ◆ ★"),
            {"price": 1590, "list_price": 1890, "combo_discount": None},
        )

    def test_saving_is_not_list_price(self):
        p = extract_prices("Montech HS02 PRO(黑) 玻璃透側/ATX+Montech PureFlow 360 ARGB(黑)水冷 現省$1190！, $3790 ◆ ★")
        self.assertEqual((p["price"], p["list_price"]), (3790, None))

    def test_combo_discount(self):
        p = extract_prices("｛華碩 PRO WS W680-ACE｝/ATX/1A1H1P/雙2.5G/註四年 穩定.可靠性高, $10990 ◆ ★ ↓任搭290↓")
        self.assertEqual((p["price"], p["combo_discount"]), (10990, 290))

    def test_markdown_arrow(self):
        self.assertEqual(extract_prices("X, $4590↘$4290 ◆")["price"], 4290)


class ExtractTest(unittest.TestCase):
    def test_cpu(self):
        f = extract("cpu", "｛Intel Core Ultra 5 245KF｝【14核】4.2G(↑5.2G) /24M /無內顯 /無風扇【代理盒裝】, $6300 ◆ ★",
                    group_label="Intel Core Ultra 200S系列1851 腳位【內建 NPU 支援 AI】")
        self.assertEqual(f["socket"], "LGA1851")
        self.assertTrue(f["no_igpu"])
        self.assertFalse(f["bundle_only"])
        f = extract("cpu", "｛Intel Core Ultra 5 225｝【10核】/內顯Xe-core【代理盒裝】~組裝價~, $5280 ◆ ★")
        self.assertTrue(f["bundle_only"])

    def test_motherboard_socket_next_to_cjk(self):
        f = extract("motherboard", "｛技嘉 B650M K｝M-ATX/LAN 2.5G, $3990 ◆ ★", group_label="AMD B650E & B650 / AM5腳位(DDR5)")
        self.assertEqual((f["socket"], f["memory_type"], f["form_factor"]), ("AM5", "DDR5", "M-ATX"))
        f = extract("motherboard", "｛X｝ATX, $1 ◆", group_label="Intel B760 / 1700腳位(DDR4)-12~14代皆支援")
        self.assertEqual((f["socket"], f["memory_type"]), ("LGA1700", "DDR4"))
        self.assertFalse(extract("motherboard", "x, $1", group_label="AMD TRX50 / Socket sTR5")["in_scope"])

    def test_case_shorthand(self):
        f = extract("case", "｛曜越 View 290 TG ARGB 黑｝顯卡長45/U高18/全景曲面玻璃/支援背插/ATX 原價$2690！, $2390 ◆ ★")
        self.assertEqual((f["gpu_clearance_mm"], f["cooler_clearance_mm"]), (450.0, 180.0))
        self.assertEqual(f["max_form_factor"], "ATX")

    def test_gpu(self):
        f = extract("gpu", "微星 RTX4060 VENTUS 2X BLACK 8G OC(2490MHz/19.9cm/雙風扇/註四年), $8990 ◆")
        self.assertEqual(f["length_mm"], 199.0)
        self.assertFalse(extract("gpu", "｛酷碼 VGA Holder 顯卡用支架｝, $490 ◆ ★",
                                 group_label="NVIDIA / AMD 顯示卡周邊配件")["in_scope"])

    def test_psu(self):
        f = extract("psu", "｛XPG CORE REACTOR II VE 750W｝雙8/金牌/全模/ATX3.1(PCIe 5.1)/7年保 原價$3190, $2790 ◆ ★")
        self.assertEqual((f["wattage"], f["psu_form"]), (750, None))
        self.assertEqual(extract("psu", "｛銀欣 SX750｝SFX 750W, $5000")["psu_form"], "SFX")

    def test_ram(self):
        f = extract("ram", "｛UMAX 單條16GB DDR5-5600｝/CL46, $7300 ◆ ★ 熱賣", group_label="桌上型記憶體 DDR5 單條")
        self.assertEqual((f["memory_type"], f["capacity_gb"]), ("DDR5", 16))
        self.assertFalse(extract("ram", "｛UMAX 8GB DDR3-1600｝, $780", group_label="桌上型記憶體 DDR3")["in_scope"])

    def test_cooler_scope(self):
        self.assertFalse(extract("cooler", "｛利民 HR-09 2280｝SSD 固態硬碟散熱器, $550", group_label="M.2 SSD散熱片")["in_scope"])
        self.assertEqual(extract("cooler", "NZXT Kraken 360 水冷, $5990")["radiator_mm"], 360)

    def test_classify(self):
        self.assertEqual(classify_category("處理器 CPU"), "cpu")
        self.assertEqual(classify_category("CASE 機殼(+電源)"), "case")
        self.assertIsNone(classify_category("機殼風扇｜機殼配件"))
        self.assertEqual(classify_category("封閉式｜開放式水冷"), "cooler")
        self.assertIsNone(classify_category("滑鼠｜鼠墊｜數位板"))
        self.assertTrue(is_in_scope("psu", "", "x"))


if __name__ == "__main__":
    unittest.main()
