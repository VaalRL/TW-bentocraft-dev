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
- `spec_extract.py`：品名字串的價格與規格擷取規則（啟發式，擷取不到回傳 `None`，不填預設值）。
- `test_spec_extract.py`：擷取規則單元測試（字串取自規格文件範例，不代表真實頁面格式）。
- `.github/workflows/poc-coolpc-probe.yml`：推送 `poc/**` 時在 Actions 上執行；原始 HTML 以 artifact 保存 7 天，不 commit 進倉庫。

## 執行

```bash
python -m unittest discover -s poc -p 'test_*.py'
python poc/coolpc_probe.py --out poc/out --save-html     # 需能連到 coolpc.com.tw
python poc/coolpc_probe.py --html evaluate.html --out poc/out   # 解析存檔
```

## 禮貌原則

- 每次執行僅請求 `robots.txt` 與 `evaluate.php` 各一次，間隔 2 秒。
- 使用可識別的自訂 User-Agent，不偽裝瀏覽器。
- 原始 HTML 只存在 Actions artifact（7 天），不公開於倉庫。

## 結果

尚未取得。第一輪結果會記錄於此。
