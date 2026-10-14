# PoC：原價屋資料取得與規格擷取驗證

對應 [設計審查](../06-design-review.md) 第一節第 3、4 點。在投入前端與規格庫之前，先用最少的程式回答兩個決定架構是否成立的問題。

## 要回答的問題

| # | 問題 | 量測方式 | 成立條件 |
| :-- | :-- | :-- | :-- |
| Q1 | GitHub Actions runner 能否抓到 `evaluate.php`？ | Actions 上實際發出請求，記錄狀態碼、大小、耗時、runner IP 所在地 | HTTP 200 且頁面含零件下拉選單 |
| Q2 | 頁面實際編碼與 DOM 結構？ | 依 Content-Type / meta 解碼，統計 `<select>` / `<optgroup>` / `<option>` | 能穩定定位 8 大類別 |
| Q3 | 品名能自動擷取多少 CSP 必要規格？ | 對每類別計算必要欄位擷取率（見下表） | 決定規格庫是「自動擷取 ＋ 人工確認」還是「全人工」 |
| Q4 | 搭機限定價占比？ | 關鍵字（搭機、限搭、任搭…）比例 | 決定總價計算是否必須處理 `bundle_only` |

各類別必要欄位（`spec_extract.REQUIRED_FIELDS`）：

| 類別 | 必要欄位 |
| :-- | :-- |
| cpu | socket |
| motherboard | socket、memory_type、form_factor |
| ram | memory_type、capacity_gb |
| gpu | length_mm |
| cooler | height_mm 或 radiator_mm |
| case | gpu_clearance_mm、cooler_clearance_mm |
| psu | wattage |

## 檔案

- `coolpc_probe.py`：抓取（或讀本機存檔）→ 解碼 → 解析下拉選單 → 輸出 `out/report.md`、`out/report.json`。只用標準函式庫。
- `spec_extract.py`：相容層。擷取規則已移至 [`pipeline/extract.py`](../pipeline/extract.py)，測試在 [`tests/test_extract.py`](../tests/test_extract.py)。
- `AUDIT-2026-10-12.md`：擷取正確率抽樣核對紀錄。
- `to_catalog.py`：把 `coolpc_probe.py --dump-items` 輸出的品項轉成草稿規格庫與報價檔，並以 [`schema/`](../schema/) 驗證、量測檔案大小。
- `.github/workflows/poc-coolpc-probe.yml`（已移除，2026-10-14）：PoC 期間在 Actions 上實際抓取原價屋並以同一份頁面跑一次正式管線；原始 HTML 以 artifact 保存 14 天，不 commit 進倉庫。PoC 完成後，連線與管線驗證由每日的 `daily-prices.yml` 負責。腳本仍可在本機執行：`python poc/coolpc_probe.py --out poc/out --save-html`。

## 執行

```bash
python -m unittest discover -s tests -t .
python poc/coolpc_probe.py --out poc/out --save-html     # 需能連到 coolpc.com.tw
python poc/coolpc_probe.py --html evaluate.html --out poc/out   # 解析存檔
```

## 禮貌原則

- 每次執行僅請求 `robots.txt` 與 `evaluate.php` 各一次，間隔 2 秒。
- 使用可識別的自訂 User-Agent，不偽裝瀏覽器。
- 原始 HTML 只存在 Actions artifact（14 天），不公開於倉庫。

## 結果（2026-10-12，五輪 Actions 執行）

執行紀錄：[run 1](https://github.com/VaalRL/TW-bentocraft/actions/runs/38210957594)、[run 2](https://github.com/VaalRL/TW-bentocraft/actions/runs/38211150159)、[run 3](https://github.com/VaalRL/TW-bentocraft/actions/runs/38211274975)、[run 4](https://github.com/VaalRL/TW-bentocraft/actions/runs/38211720506)、[run 5](https://github.com/VaalRL/TW-bentocraft/actions/runs/38211931219)。

### Q1 可達性：✅ 可行（單日驗證）

| 項目 | 實測 |
| :-- | :-- |
| Runner 出口 | 美國 Azure（AS8075 Microsoft；Phoenix、Boydton 兩個機房） |
| `evaluate.php` | 五次皆 HTTP 200，約 1.07 MB，耗時 2.0 ~ 2.6 秒 |
| `robots.txt` | 僅對 Googlebot 禁止 `/book/`，未限制估價頁 |

海外雲端 IP 目前未被阻擋。這只是同一天的五次請求，長期可達性仍需排程連續觀察一至兩週（排程 workflow 只在預設分支生效）。

### Q2 編碼與 DOM 結構：✅ 穩定可解析

- 編碼為 **Big5**（`Content-Type: text/html; charset=Big5`），以 `cp950` 解碼。
- 共 60 個 `<select>`：`n1` ~ `n30` 為 30 個商品類別，`u1` ~ `u30` 為每類的篩選下拉（無價格，可忽略）。
- **optgroup 標籤本身就帶相容性資訊**，例如 `AMD B650E & B650 / AM5腳位(DDR5)`、`Intel B760 / 1700腳位(DDR4)-12~14代皆支援`、`Intel Core Ultra 200S系列1851 腳位`。主機板的腳位與記憶體世代幾乎全部來自這裡。
- 品名格式：`｛品名｝規格/規格/…, $現價 ◆ ★ [熱賣] [↓任搭N↓]`，金額無千分位。

### Q3 品名規格自動擷取率（第 5 輪）

| 類別 | 範圍內品項 | 排除 | 必要欄位全數擷取 | 各欄位 |
| :-- | --: | --: | --: | :-- |
| cpu | 34 | 9 | **100%** | socket 100% |
| motherboard | 334 | 11 | **99%** | socket 99%、memory_type 100%、form_factor 99% |
| ram | 150 | 37 | **100%** | memory_type 100%、capacity_gb 100% |
| gpu | 196 | 20 | **97%** | length_mm 97% |
| cooler | 399 | 31 | **96%** | height_or_radiator 96% |
| case | 715 | 25 | **92%**（含繼承 **98%**） | gpu_clearance 99%、cooler_clearance 98%（含繼承） |
| psu | 327 | 0 | **100%** | wattage 100% |
| ssd | 165 | 0 | — | （本輪未定義必要欄位） |

「排除」為不在消費級範圍的品項：HEDT／伺服器（Threadripper、Xeon、W790）、筆電與伺服器記憶體、DDR3、顯卡支架、SSD 散熱片、散熱膏、筆電散熱座，以及跨類別合購促銷。

機殼從第 3 輪的 81% 提升，來自三項改動：
- 支援簡寫 `卡長40`、`卡31.5`、`U16`；
- 拆解 36 筆組合列（機殼＋電源 19、＋水冷 11、＋風扇 6）；
- 讓組合列與缺值列從同型號單品繼承規格（40 筆，顏色不影響型號鍵）。

另有 29 筆機殼帶括號條件值（如 `顯卡長33.5(32.5)`），已另存為 `*_alt_mm`。

**正確率**：見 [抽樣核對紀錄](AUDIT-2026-10-12.md)。240 筆抽樣中，修正後擷取值與品名零不符；品名本身的顯卡長度只寫到公分（觀察到高估 5 ~ 7 mm），機殼間隙常省略條件。

### Q4 搭機與促銷：比預期普遍

| 類型 | 寫法 | 出現情形 |
| :-- | :-- | :-- |
| 任搭折抵 | `↓任搭290↓` | 主機板 220 / 334、顯卡 155 / 196 |
| 附條件價 | `~組裝價~`、`【任搭主機板】`、`*任搭優惠價` | 主機板 7、GPU 5、SSD 6、RAM 3、CPU 2 |
| 原價 / 現省 | `原價$1890！`、`現省$1190！` | 特價區常見 |
| 限時下殺 | `▼下殺到 10/31 20:00` | 機殼等 |
| 酷幣 | `↓酷幣100↓` | 少量 |
| 贈品 | `*送 全漢 650W(金牌)`、`送 ESD-T1W外接盒` | 少量；贈品可能是另一個零件 |

「任搭」是**搭配其他零件時再折抵**，不是不能單買。整單總價若要準確，必須實作折抵規則；只有 `bundle_condition` 一個欄位不夠。

### PoC 揭露的新設計問題

1. **一列 ≠ 一個零件**：機殼類有「機殼 ＋ 電源」「機殼 ＋ 水冷」「機殼 ＋ 風扇」組合列；主機板類有 `[合購優惠] 主機板 ＋ CPU`。規格庫需要「組合品 = 多個 canonical_id」的關係。PoC 已能拆出主件並從同型號單品繼承規格（`split_combo`、`model_key`）。
2. **同型號多色**：黑／白各一列、價格不同。需要「型號（規格）→ SKU 變體（顏色、價格）」兩層結構。
3. **間隙值有條件**：`顯卡長33.5(32.5)`、`CPU高3.7(7)`、`U高7.7(4.8)` 這類括號內數值，代表裝前置風扇或其他配置時的限制。設計中單一的 `max_gpu_length_mm` 不足以表達。品名也常完全省略條件，例如 The Tower 300 的 400 mm 是拆掉電源護罩後的值，裝上只有 280 mm。
4. **水冷厚度可直接取得**：`厚:5.2`、`厚:5.5`，可用於冷排與顯卡空間的扣除計算。
5. **散熱器上的 `【WXZ】` 標記**：扣具／腳位支援代碼。2026-10-13 在頁面上找到圖例：W=115X/1200、X=AM4/AM5、Y=sTR4/5、Z=1700/1851，已用於 C6 扣具約束。
6. **品項規模**：8 大類範圍內約 2,300 項，`01` 估計的 `spec_catalog.json` ~120 KB 偏小。
7. **日內變價**：限時下殺標註到「10/31 20:00」，每日一次的快照可能在當天就過期。

### 結論與下一步

- 架構前提成立：Actions 抓得到，頁面可解析，關鍵規格大多能從品名或 optgroup 自動擷取。規格庫可以採「**自動擷取 → 人工確認例外**」，不必全人工建立。
- 已完成：
  1. 人工抽樣核對擷取正確率（[紀錄](AUDIT-2026-10-12.md)）；
  2. 機殼簡寫規則與組合列拆解。
  3. 規格庫 schema（[07-spec-catalog-schema.md](../07-spec-catalog-schema.md)），並以 `to_catalog.py` 把全量品項轉成草稿規格庫驗證通過。
- 下一步：
  1. 在預設分支設定每日排程，連續觀察可達性與 `offer_id` 跨日穩定性一至兩週；
  2. ~~確認 `【WXZ】` 圖例~~（已確認，見上方第 5 點）。
