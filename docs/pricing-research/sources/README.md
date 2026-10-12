# 台灣電腦零組件終端售價查詢免費資源與技術工具文獻清單

本研究案全篇基於台灣 DIY 通路報價系統、電商比價平台、GitHub 開源爬蟲與 MCP 工具庫、以及瀏覽器用戶端腳本實測整編。

---

## 一、台灣實體與線上 DIY 通路一手來源 (Primary Retail Portals)

1. **原價屋 CoolPC**
   - **線上估價系統網址**：`https://coolpc.com.tw/evaluate.php`
   - **特性**：台灣電腦 DIY 市場最具指標性之定價參考標準，涵蓋 CPU、主機板、顯示卡、記憶體、硬碟等 30 餘種分類；無官方 API，資料嵌入於 HTML 結構中。
2. **欣亞數位 Sinya (排排購)**
   - **DIY 線上估價網址**：`https://www.sinya.com.tw/diy`
   - **特性**：台灣第二大 DIY 電腦通路，以套裝促銷、組合價見長；前端動態渲染，無公開 REST API。

---

## 二、開源社群工具、MCP 與爬蟲專案 (GitHub Open-Source Projects)

1. **`shyuan/coolpc-mcp-server`**
   - 基於 Model Context Protocol (MCP) 架構的原價屋報價查詢伺服器，內建 `coolpc_parser.py` 解析模組，將非結構化 HTML 轉譯為標準 JSON。
2. **`coolpc-price-tracker` (原價屋價格追蹤)**
   - 基於 GitHub Actions 每日自動排程抓取原價屋全量清單，儲存歷史 JSON 快照並提供網頁端歷史價格漲跌比對功能。
3. **`coolpc-skill` (Claude Code 專用硬體查詢 Skill)**
   - 封裝 Playwright 與 BeautifulSoup 自動化腳本，支援即時抓取價格、規格過濾與預算自動配單。
4. **`py-pcpartpicker` (PCPartPicker 跨國開源爬蟲庫)**
   - 針對全球最權威組裝比價網 PCPartPicker 之 Python 解析庫，支援跨品牌、相容性檢驗與跨國價格對照。

---

## 三、第三方價格追蹤與跨電商比價平台 (Aggregators & Trackers)

1. **TWBuyer.info (台灣電商歷史價格網)**
   - 專門追蹤 PChome 24h、momo 等大型綜合電商電腦零組件歷史價格走勢與歷史低點。
2. **BigGo 比價網 / 飛比價格 Feebee**
   - 跨通路價格搜尋引擎，提供 Chrome 瀏覽器擴充功能，支援在電商與通路線上顯示歷史價格曲線。
3. **Tampermonkey 油猴使用者腳本庫 (Greasy Fork)**
   - 「原價屋估價單助手」、「原價屋 AI 建議估價清單」等客戶端腳本，於瀏覽器端執行 DOM 解析與 CP 值計算。
