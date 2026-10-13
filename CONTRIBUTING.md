# 參與貢獻：規格庫審查指南

這份指南給審查規格庫 PR 與手動修正規格的人。資料格式的完整定義見 [`07-spec-catalog-schema.md`](07-spec-catalog-schema.md)，約束規則見 [`02-hardware-compatibility-constraint-engine.md`](02-hardware-compatibility-constraint-engine.md)。

## 規格庫怎麼長出來的

1. **每週一自動新增**：[`catalog-bootstrap.yml`](.github/workflows/catalog-bootstrap.yml) 讀當天的原價屋估價頁，找出規格庫還沒有的型號，開一個「規格庫：新增 … 原價屋新型號」的 PR。
2. **自動擷取**：規格從品名（`title`）與通路分類標籤（`optgroup`）擷取；功耗等品名不寫的值由對照表 [`data/reference/specs.json`](data/reference/specs.json) 補上；散熱器的 `【WXZ】` 依原價屋圖例轉成支援腳位。
3. **人工審查**：就是這份指南要做的事。審查通過、合併後，每日報價就會對應到新型號。

既有型號不會被自動流程修改，只有人工 PR 能改。

## 審查一個新增型號的 PR

PR 內文有 bootstrap 的報告（新增幾個、ID 碰撞、規格衝突）。依序檢查：

### 1. 型號 ID 與名稱

ID 格式為 `<類別>:<品牌>:<型號>`，例如 `gpu:msi:rtx5080-16g-ventus-3x-oc`。**ID 一經合併到 main、網站部署後就不得改名**（分享連結只存 ID），所以這是最後一次能免費改名的機會。

- **結尾是 4 碼雜湊**（如 `-a3d4`）：中文的系列、版本或顏色名稱被濾掉後撞號。改成看得懂的名稱：版本用英文或拼音（`the-tower-300-matcha`、`xiaojudan-mesh`），附散熱片的 SSD 加 `-heatsink`。
- **只是顏色不同**（白化版、黑色）：不要開新型號，把它的 `aliases.model_keys` 併入原型號，並在 `variants` 加上顏色。同一型號不同顏色的規格一定相同。
- **品牌是 `unknown`**：通常是品名格式特殊（漏打括號、前面多了促銷字樣）。手動補品牌，並考慮在 [`pipeline/catalog.py`](pipeline/catalog.py) 補解析規則，附上測試。
- 名稱只描述型號，不含顏色與促銷字樣。記憶體等以容量區分的商品，名稱要寫出容量與條數。

### 2. 規格衝突（`review.status: draft`）

同型號不同列的值不一致時，型號會標為 `draft`，報告會列出衝突，例如 `cooler_clearance_mm: 166.0 vs 160.0`。

- 查原廠規格。查得到就填原廠值，來源改為 `vendor_spec` 並附 `ref`。
- 查不到時取**較保守的值**（間隙取小、尺寸取大），在 `note` 寫明兩個數字，例如「原價屋兩列分別寫 166 與 160 mm，取較小值」。
- 兩列其實是不同 SKU、品名又分不出來時（例如同名記憶體有 6000 與 6400 兩種），刪掉無法確定的欄位，不要猜。
- 處理完把 `review.status` 改為 `auto`。

### 3. 抽查近似值與推定值

不必逐一核對所有欄位，優先看會影響相容性判斷的：

| 欄位 | 為什麼要看 |
| :-- | :-- |
| 顯卡 `length_mm` | 品名只寫到公分（已帶 `tolerance: 10`），長卡配小機殼時最容易誤判 |
| 機殼 `gpu_clearance_mm`、`cooler_clearance_mm` | 品名常省略條件，例如拆掉電源護罩才有的長度；查到條件就加進 `conditions` |
| 機殼與電源的 `psu_form_factors`／`form_factor`（`inferred`） | 品名沒寫 SFX 的一律推定為 ATX；小機殼與 SFX 電源特別要看 |
| 散熱器 `height_mm`、`sockets` | 塔扇高度與扣具直接決定裝不裝得上 |

## 欄位值與來源

每個值都必須帶 `source`，**缺少的欄位就是「未知」，不要補預設值**（例如不要因為大多數 ATX 主機板有 4 條插槽就填 4）。

| `source` | 何時用 | 附加要求 |
| :-- | :-- | :-- |
| `title` | 從通路品名擷取 | — |
| `optgroup` | 從通路分類標籤擷取（如 `AM5腳位(DDR5)`） | — |
| `inherited` | 由同型號其他列取得 | `inherited_from` |
| `inferred` | 規則推定，例如依顯卡晶片推定功耗 | 介面會註明「依推定規格」 |
| `retailer_spec` | 零售商規格表 | `ref` 網址 |
| `vendor_spec` | 原廠規格頁或規格書 | `ref` 網址 |
| `manual` | 人工判定，例如依原廠規則換算的值 | `ref` 或 `note` |

- 已知誤差寫在 `tolerance`；只在特定配置下成立的上限寫在 `conditions`（`when` 見 `07` 第三節之 3）。
- 改用更可靠的來源時，直接覆寫 `value` 與 `source`，在 `note` 留下原本的值供日後查證。

## 標為已確認（`verified`）

`verified` 代表有人以原廠規格確認過該類別的**必要欄位**，schema 會強制這些欄位存在：

| 類別 | 必要欄位 |
| :-- | :-- |
| cpu | `socket`、`igpu` |
| motherboard | `socket`、`memory_type`、`form_factor` |
| ram | `memory_type`、`capacity_gb`、`modules` |
| gpu | `length_mm` |
| cooler | `cooler_type`（風冷還要 `height_mm`，水冷還要 `radiator_mm`） |
| case | `max_mb_form_factor`、`gpu_clearance_mm`、`cooler_clearance_mm`、`psu_form_factors` |
| psu | `wattage`、`form_factor` |

```json
"review": { "status": "verified", "by": "你的 GitHub 帳號", "at": "2026-10-13" }
```

確認時把核對過的欄位來源改為 `vendor_spec` 並附 `ref`。`verified` 的型號不會再被對照表或自動流程補值，之後的修改都要人工 PR。

## 對照表（`data/reference/specs.json`）

品名不寫、但由型號決定的值放在這裡，例如 CPU 功耗、顯卡晶片的參考功耗與接頭。

- 每條規則以 `match`（不分大小寫的正規表示式）比對型號名稱，**第一條相符者生效**，所以較具體的規則要放前面（`RTX 5070 Ti` 在 `RTX 5070` 之前）。
- 每個值都要有 `note` 寫明依據；來源說法不一致的值寧可不填。
- 新增規則後執行 `python scripts/apply_reference.py` 回填既有型號；CI 會以 `--check` 確認沒有漏跑。

## 修正錯誤的 ID（網站上線後）

不能直接改名。把舊型號改為 `"status": "deprecated"` 並以 `"replaced_by"` 指向新 ID，舊的分享連結會自動轉址。轉址只能一層，不可串接。

## 提交前

```bash
pip install -r requirements.txt
python -m unittest discover -s tests -t .
(cd schema && python -m unittest test_schema)
python schema/validate.py --catalog data/catalog/*.json
python scripts/apply_reference.py --check
```

改到前端時另外執行：

```bash
cd web && npm ci && npm test && npm run build && npm run test:e2e
```

PR 會自動跑 [`ci.yml`](.github/workflows/ci.yml)（Python 與規格庫）與 [`deploy.yml`](.github/workflows/deploy.yml) 的建置與測試。由 GitHub Actions 自動開的規格庫 PR 不會觸發 CI，但 bootstrap 流程本身已通過 schema 驗證。
