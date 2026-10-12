# 第三章：工程落地架構、防爬蟲風控避坑與資料正規化實戰指南

---

## 3.1 為什麼絕對不要做「即時線上爬取」？（架構反模式 Anti-Pattern）

許多初學者在設計比價工具時，常犯下「使用者每搜尋一次硬體，後端就發起一次 HTTP 請求去爬原價屋」的架構錯誤：

```
【致命架構反模式：即時線上爬取 (Real-Time Scraping)】
使用者搜尋 ──► 你的服務 ──(即時發起 HTTP 請求)──► 原價屋伺服器
  • 缺點 1：延遲極高（每次解析 1MB HTML 耗時 2~5 秒）
  • 缺點 2：觸發原價屋防火牆封鎖（多個使用者同時搜尋，你的伺服器 IP 當場被封閉）
  • 缺點 3：伺服器遭受單點故障（原價屋維護時，你的系統完全癱瘓）
```

### 原價屋防爬蟲風控機制
- **頻率限制 (Rate Limiting)**：短時間內（如 1 分鐘內）發起超過數十次請求，原價屋伺服器會暫時將該來源 IP 列入黑名單，回傳連線逾時、403 Forbidden 或重定向至錯誤頁面。
- **流量開銷**：每次估價頁完整載入需傳輸數百 KB 至 1 MB 以上之 HTML 檔案，頻繁請求會對目標伺服器造成不道德的無效負載。

---

## 3.2 黃金工程範式：「定時快照 (Daily Snapshot) ＋ 本地快取 (SQLite)」

在業界標準實踐中，建構硬體比價系統的最佳架構為**「定時離峰快照 ＋ 本地 SQLite 快取」**：

```mermaid
flowchart TD
    subgraph NightlyBatch [每日凌晨排程管線 (Cron Job)]
        T[每日 03:00 觸發] --> C[單次抓取原價屋全量清單]
        C --> P[資料清洗與正則結構化 Pipeline]
        P --> DB[(本機 SQLite 資料庫 / 快照 JSON)]
    end

    subgraph UserServing [使用者查詢服務 (Serving Layer)]
        U[使用者發起查詢] --> API[自研 API / AI Agent / Web]
        API -->|毫秒級極速查詢| DB
        DB -->|回傳結構化硬體清單| U
    end

    style NightlyBatch fill:#f0fdf4,stroke:#22c55e,stroke-width:2px;
    style UserServing fill:#eff6ff,stroke:#3b82f6,stroke-width:2px;
    style DB fill:#fef3c7,stroke:#f59e0b,stroke-width:2px;
```

### 此架構的壓倒性優勢：
1. **0% 封鎖風險**：每天全系統僅對原價屋發送 **1 次** HTTP 請求，完全符合禮貌爬蟲規範，永不觸發防火牆。
2. **極致響應速度**：使用者查詢直接讀取本地 SQLite 索引，查詢延遲縮減至 **$< 1\text{ms}$**，支援複雜的 SQL 排序、價格區間篩選與全文檢索。
3. **天然具備歷史價格追蹤能力**：每次抓取將日期作為版本記錄，即可自動累積出全台最完整的零組件價格時間序列資料庫。

---

## 3.3 非結構化命名清洗管線 (Data Normalization Pipeline)

原價屋商品文字極其混雜，標準清洗管線分為三個階段：

```
  原始字串: "微星 RTX4060 VENTUS 2X BLACK 8G OC(2490MHz/19.9cm/雙風扇/註四年) 促銷搭機價 $8990"
                           │
                           ▼ 【第一階段：正則標記剝離 (Regex Stripping)】
  - 價格提取: 8990 元
  - 特殊限制提取: "促銷搭機價"
  - 括號特徵提取: "2490MHz/19.9cm/雙風扇/註四年"
                           │
                           ▼ 【第二階段：核心實體字典比對 (Entity Dictionary Matching)】
  - 品牌對齊: "微星" ➔ "MSI"
  - 晶片對齊: "RTX4060" ➔ "GeForce RTX 4060"
  - 顯存對齊: "8G" ➔ "8GB GDDR6"
                           │
                           ▼ 【第三階段：結構化 JSON 輸出 (Structured Output)】
  {
    "vendor": "MSI",
    "chipset": "RTX 4060",
    "model": "VENTUS 2X BLACK OC",
    "vram_gb": 8,
    "warranty_years": 4,
    "length_cm": 19.9,
    "is_bundle_only": true,
    "price_twd": 8990
  }
```

---

## 3.4 爬蟲道德規範與法律邊界指南 (Scraping Ethics)

在開發電腦零組件比價工具時，建議遵守以下工程守則：

1. **頻率節制**：若需抓取多個類別頁面，務必在請求之間加入 `time.sleep(1.5)` 隨機延遲，絕不進行並發爆破。
2. **User-Agent 規範**：在請求標頭中填入合法的 User-Agent 識別字串，避免偽造惡意特徵。
3. **智慧財產與合理使用 (Fair Use)**：商品公開售價本身屬於**客觀事實（Fact）**，不受著作權法保護；個人學習、比價參考或開源工具分享屬合理使用範疇。但切忌惡意複製通路之專利排版、商標外觀，或將爬取資料用於分散式阻斷服務攻擊 (DDoS)。
