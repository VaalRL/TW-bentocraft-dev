"""擷取規則單元測試。字串格式取自 2026-10-12 PoC 實測抓到的原價屋品名。"""
import unittest

from pipeline.extract import classify_category, extract, extract_prices, is_in_scope, model_key, split_combo


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

    def test_note_rows_are_not_products(self):
        self.assertIsNone(extract_prices("↪ 買華碩 GT502+Prime MR120 ARGB(3+1)組合,送GT502 磁吸燈條套件(黑) 市價$1290！ ★"))
        self.assertIsNone(extract_prices("【提醒】NH-U12/NH-U14/NH-D15/NH-D15S,搭ROG Strix 系列主機板,請查詢相容列表, $1 ◆ ★ 熱賣"))

    def test_markdown_arrow(self):
        self.assertEqual(extract_prices("X, $4590↘$4290 ◆")["price"], 4290)


class ExtractTest(unittest.TestCase):
    def test_cpu(self):
        f = extract("cpu", "｛Intel Core Ultra 5 245KF｝【14核】4.2G(↑5.2G) /24M /無內顯 /無風扇【代理盒裝】, $6300 ◆ ★",
                    group_label="Intel Core Ultra 200S系列1851 腳位【內建 NPU 支援 AI】")
        self.assertEqual(f["socket"], "LGA1851")
        self.assertIs(f["igpu"], False)
        self.assertFalse(f["bundle_only"])
        f = extract("cpu", "｛Intel Core Ultra 5 225｝【10核】/內顯Xe-core【代理盒裝】~組裝價~, $5280 ◆ ★")
        self.assertTrue(f["bundle_only"])

    def test_igpu_tristate(self):
        # 2026-10-12 抽樣核對時漏判的兩種情況：F 型號後緊接中文字、品名未說明內顯
        self.assertIs(extract("cpu", "｛AMD R5 8400F盒｝【6核/12緒】4.2G(↑4.7G)65W, $4950 ◆ ★")["igpu"], False)
        self.assertIs(extract("cpu", "｛AMD R5 8600G盒｝【6核/12緒】/RDNA 3內顯, $6550")["igpu"], True)
        self.assertIs(extract("cpu", "｛Intel i5-14400｝/UHD730 /65W 【代理盒裝】, $7250")["igpu"], True)
        self.assertIs(extract("cpu", "｛AMD R9 9900X｝代理盒裝【12核/24緒】120W /具內顯, $14450")["igpu"], True)
        self.assertIsNone(extract("cpu", "｛AMD R5 5600X MPK｝(含風扇)【6核/12緒】3.7G(↑4.6G), $4890 ★")["igpu"])
        self.assertIsNone(extract("cpu", "｛AMD R7 5800X3D｝十週年紀念版【8核/16緒】105W/7nm, $11790 ★")["igpu"])

    def test_conditional_price_and_gift(self):
        self.assertTrue(extract("cpu", "｛AMD R5 8400F盒｝65W【任搭主機板】, $4450 ◆ ★ ↓酷幣200↓")["bundle_only"])
        self.assertTrue(extract("motherboard", "｛華碩 B860M-E-CSM｝M-ATX/6+1+1+1相 *任搭優惠價, $3390 ◆ ★")["bundle_only"])
        self.assertFalse(extract("motherboard", "｛X｝ATX, $10990 ◆ ★ ↓任搭290↓")["bundle_only"])
        self.assertTrue(extract("ssd", "任搭價｛Acer RE100 512GB｝/2.5吋, $2390 ◆ ★")["bundle_only"])
        self.assertEqual(extract("gpu", "｛ZOTAC RTX3060 Twin Edge｝1777MHz/23cm/雙風扇/註四年 *送 全漢 650W(金牌), $15890 ◆ ★ 熱賣 ↓任搭190↓")["gift"],
                         "全漢 650W(金牌)")
        self.assertEqual(extract("psu", "｛華碩 ROG STRIX 1000W(白色)｝全模/ATX3.1(PCIe 5.1) 送 ESD-T1W外接盒▼下殺到 10/31 20:00, $6590 ◆ ★")["gift"],
                         "ESD-T1W外接盒")
        self.assertIsNone(extract("psu", "｛X 750W｝雙8/金牌/全模/送修到府, $1990")["gift"])

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

    def test_case_single_digit_clearance(self):
        f = extract("case", "｛聯力 A4-H2O 黑｝PCIe 5.0/顯卡長32.2/CPU高5.5/鋁合金/ITX【SFX】, $4700 ◆ ★")
        self.assertEqual((f["gpu_clearance_mm"], f["cooler_clearance_mm"]), (322.0, 55.0))
        self.assertEqual(extract("case", "｛Mavoly M16 黑｝顯卡長20/U高7/內附400W電源, $1390")["cooler_clearance_mm"], 70.0)

    def test_case_abbreviations(self):
        f = extract("case", "｛華碩 ProArt PA401 Wood 黑色 透側版｝卡31.5/U16/玻璃透側/ATX 送 ESD-A1A(灰)外接盒▼下殺到 10/31 20:00, $2990 ◆ ★")
        self.assertEqual((f["gpu_clearance_mm"], f["cooler_clearance_mm"]), (315.0, 160.0))
        f = extract("case", "｛華碩 TUF Gaming GT502 Horizon｝無界版 卡長40/U高16.3/分艙設計/全景玻璃透側/ATX, $4690 ◆ ★")
        self.assertEqual((f["gpu_clearance_mm"], f["cooler_clearance_mm"]), (400.0, 163.0))

    def test_case_u_not_inside_words(self):
        f = extract("case", "華碩 TUF Gaming GT302 ARGB 黑/E-ATX+TUF GAMING LC III 360 ARGB LCD(黑)水冷, $8180 ◆ ★")
        self.assertIsNone(f["cooler_clearance_mm"])
        self.assertIsNone(extract("case", "｛X｝USB*4/ATX, $1990")["cooler_clearance_mm"])

    def test_case_conditional_values(self):
        f = extract("case", "｛Fractal Design Ridge 黑｝顯卡長33.5(32.5)/厚8.2(5.7)/高13.7(12.5)/CPU高7/ITX【SFX】, $4890 ◆ ★")
        self.assertEqual((f["gpu_clearance_mm"], f["gpu_clearance_alt_mm"]), (335.0, 325.0))
        self.assertEqual(f["cooler_clearance_mm"], 70.0)
        f = extract("case", "｛銀欣 ML09 黑｝顯卡長17.5(LP)/CPU高3.7(7)/ITX(ML09B)【SFX】【客訂】, $2040 ◆ ★")
        self.assertEqual((f["cooler_clearance_mm"], f["cooler_clearance_alt_mm"]), (37.0, 70.0))
        self.assertIsNone(f["gpu_clearance_alt_mm"])

    def test_combo_split(self):
        parts = split_combo("華碩 A31 PLUS 黑 /全景玻璃/支援背插/ATX+華碩 TUF GAMING 750W EVO 銅牌/全模, $3990 ◆ ★ 熱賣")
        self.assertEqual([p["kind"] for p in parts], ["main", "psu"])
        parts = split_combo("Montech HS02 PRO(黑) 玻璃透側/ATX+Montech PureFlow 360 ARGB(黑)水冷 現省$1190！, $3790 ◆ ★")
        self.assertEqual(parts[1]["kind"], "aio")
        parts = split_combo("華碩 TUF Gaming GT502 Horizon/ATX+Prime MR120 ARGB(黑)反向扇(三入)+正向(單顆), $5689 ◆ ★ 熱賣")
        self.assertEqual(parts[1]["kind"], "fans")
        parts = split_combo("[合購優惠] 華碩 PRIME B550M-K WIFI + AMD R5 5600X MPK【6核/12緒】, $7380 ★")
        self.assertEqual((parts[0]["text"], parts[1]["kind"]), ("華碩 PRIME B550M-K WIFI", "cpu"))
        self.assertIsNone(split_combo("｛華碩 PRO WS W680M-ACE SE｝M-ATX/雙2.5G+LAN 1G *支援BMC遠端管理, $13990 ◆ ★"))
        self.assertIsNone(split_combo("｛技嘉 B650M GAMING X AX｝6+2+1相電源, $4690"))

    def test_model_key_ignores_color(self):
        self.assertEqual(model_key("華碩 A31 PLUS 黑 /全景玻璃/支援背插/ATX"), model_key("｛華碩 A31 PLUS 白｝顯卡長40/U高17/ATX"))
        self.assertEqual(model_key("｛華碩 ProArt PA401 Wood 黑色 透側版｝卡31.5"), model_key("｛華碩 ProArt PA401 Wood 燕麥色 網狀版｝卡31.5"))

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

    def test_cooler_height_without_unit(self):
        f = extract("cooler", "｛利民 Phantom Spirit 120 EVO｝7導管(6mm)/雙塔雙扇(ARGB)/高15.7/全黑化【WXZ】, $1890 ◆ ★")
        self.assertEqual(f["height_mm"], 157.0)
        self.assertEqual(extract("cooler", "｛ID-COOLING IS-40X 散熱器｝下吹式/4導管/高4.5/TDP:100W, $790")["height_mm"], 45.0)

    def test_aio_radiator_from_select_label(self):
        f = extract("cooler", "｛恩傑 NZXT Kraken Elite 360 RGB｝LCD, $8990 ◆", group_label="恩傑 NZXT", select_label="封閉式｜開放式水冷")
        self.assertEqual(f["radiator_mm"], 360)
        self.assertIsNone(extract("cooler", "｛X｝TDP:240W, $1", select_label="封閉式｜開放式水冷")["radiator_mm"])
        f = extract("cooler", "｛利民 PA120｝高15.5, $1", group_label="利民", select_label="散熱器｜散熱墊｜散熱膏")
        self.assertTrue(f["in_scope"])

    def test_promo_combo_out_of_scope(self):
        self.assertFalse(extract("motherboard", "[合購優惠] 華碩 PRIME B550M-K WIFI + AMD R5 5600X MPK, $7380 ★")["in_scope"])

    def test_cooler_scope(self):
        self.assertFalse(extract("cooler", "｛利民 HR-09 2280｝SSD 固態硬碟散熱器, $550", group_label="M.2 SSD散熱片")["in_scope"])
        self.assertEqual(extract("cooler", "NZXT Kraken 360 水冷, $5990")["radiator_mm"], 360)
        self.assertFalse(extract("cooler", "｛Raymii RNF-K6｝大風扇RGB散熱筆電架, $999",
                                 group_label="筆記型專用散熱座")["in_scope"])
        self.assertFalse(extract("cooler", "｛酷碼 LGA1700 空冷專用扣具(A)｝, $99",
                                 group_label="CoolerMaster 酷碼散熱器")["in_scope"])
        for name in ("銀欣 XE02-2066 散熱器", "酷碼 MasterLiquid PL360 TR5-SP6 水冷", "銀欣 XED120 4U散熱器",
                     "貓頭鷹 NL-ACF1 VRM 風扇", "曜越 T1000 透明水冷液"):
            self.assertFalse(extract("cooler", f"｛{name}｝, $1990")["in_scope"], name)
        self.assertTrue(extract("cooler", "｛貓頭鷹 NH-U12A｝高15.8/支援LGA2066, $3990")["in_scope"])
        # 品名外提到扣具（附贈、相容說明）的仍是散熱器
        self.assertTrue(extract("cooler", "｛利民 PA120｝雙塔/高15.5cm/附1700扣具【WXZ】, $1290",
                                group_label="Thermalright 利民散熱器")["in_scope"])

    def test_classify(self):
        self.assertEqual(classify_category("處理器 CPU"), "cpu")
        self.assertEqual(classify_category("CASE 機殼(+電源)"), "case")
        self.assertIsNone(classify_category("機殼風扇｜機殼配件"))
        self.assertEqual(classify_category("封閉式｜開放式水冷"), "cooler")
        self.assertIsNone(classify_category("滑鼠｜鼠墊｜數位板"))
        self.assertTrue(is_in_scope("psu", "", "x"))


if __name__ == "__main__":
    unittest.main()
