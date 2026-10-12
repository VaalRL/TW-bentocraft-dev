# 一手資料來源與研究參考文獻庫 (Sources & Technical References)

本檔案彙整「GitHub Pages ✕ GitHub Actions 零維運成本台灣電腦零組件相容性組裝估價系統 (OpenPCBuilder TW)」之架構設計、資料來源逆向工程分析、國際相容性約束規格與開源授權基準。

---

## 一、台灣零售通路資料結構與逆向工程一手文獻

1. **原價屋線上估價系統 (CoolPC Evaluation API)**
   - 網址：`https://www.coolpc.com.tw/evaluate.php`
   - 資料交換格式：非結構化 HTML Option 字串雜燴與混亂標籤。
   - 資料分類：30 大分類下拉選單（`n1` 到 `n30`），包含品名、現金特價、活動搭機限制、規格簡述。
   - 逆向解析文獻：
     - 工作區前案研究：[`taiwan-pc-hardware-retail-pricing-free-resources-frontier-3.0`](../taiwan-pc-hardware-retail-pricing-free-resources-frontier-3.0/README.md)
     - 開源 MCP 伺服器：`shyuan/coolpc-mcp-server` (GitHub)
     - 歷史報價追蹤器：`coolpc-price-tracker` (GitHub)

2. **欣亞數位線上估價與電商結構 (Sinya PC Builder)**
   - 網址：`https://www.sinya.com.tw/diy`
   - 資料交換：RESTful / JSON 結構化分頁請求，包含標準條碼（EAN/UPC）與品號。

3. **TWBuyer.info 電腦零件價格歷史走勢**
   - 網址：`https://twbuyer.info/`
   - 功用：提供 180 天至 1 年期歷史走勢，可用於驗證快照資料之平滑性與異常波動過濾。

---

## 二、國際硬體相容性約束引擎與規格本體論參考

1. **PCPartPicker System Architecture & Compatibility Notes**
   - 官方網站：`https://pcpartpicker.com/`
   - 核心機制參考：
     - 形式化約束滿足問題（Constraint Satisfaction Problem, CSP）在電腦零組件中的映射。
     - 實體公差與物理干涉模型（Physical Clearance）：顯卡限長、風冷限高、水冷排厚度與冷排架相容性。
     - 功率預算模型（Power Budgeting）：動態 TDP 峰值係數（Peak Power Ratio $\approx 1.25 \sim 1.35$）。
     - 韌體相容性：BIOS Flashback 需求預警（例如：前代主機板支援次代 CPU 需更新 BIOS）。
   - 開源 Python 封裝研究：`py-pcpartpicker` (GitHub)

2. **維基百科與 JEDEC / PCI-SIG 硬體物理規格標準**
   - **JEDEC Solid State Technology Association**：DDR4 (JESD79-4) vs DDR5 (JESD79-5) 針腳與防呆缺口（Key Notch）物理電氣標準。
   - **PCI-SIG (PCI Express Standards)**：PCIe 4.0 / 5.0 頻寬分配、ATX 3.0 / PCIe 5.0 12V-2x6 (12VHPWR) 16-pin 600W 供電規範與安全感測針腳（Sideband Signals）。
   - **Intel / AMD 官方處理器與插槽規格**：
     - Intel LGA1700 (Alder Lake / Raptor Lake / Raptor Lake Refresh) ✕ 600/700 系列晶片組。
     - Intel LGA1851 (Arrow Lake-S) ✕ 800 系列晶片組。
     - AMD Socket AM4 (Zen / Zen+ / Zen 2 / Zen 3) ✕ 300/400/500 系列晶片組。
     - AMD Socket AM5 (Zen 4 / Zen 5) ✕ 600/800 系列晶片組。

---

## 三、GitHub 免費無伺服器基礎設施與運算配額基準

1. **GitHub Pages 託管限制 (GitHub Pages Limits)**
   - 官方文檔：`https://docs.github.com/en/pages`
   - 儲存空間上限：每個倉庫 1 GB（靜態前端專案通常 $< 10\text{ MB}$）。
   - 頻寬上限：每月 100 GB 軟性限制（Soft limit）。
   - 構建次數上限：每小時最多 10 次構建。
   - 路由機制：純靜態 Web 伺服器，對 SPA 路由需使用 `HashRouter`（`#/`）或 `404.html` 重定向跳轉。

2. **GitHub Actions 免費運算時間與 Cron 排程規範**
   - 官方文檔：`https://docs.github.com/en/actions`
   - 公開開源倉庫（Public Repositories）：**享有 100% 免費無上限之 GitHub-hosted runner 分鐘數**（私有倉庫為每月 2,000 分鐘）。
   - Cron 排程精度：POSIX cron 語法，由 GitHub 排程池異步調度，可能存在 5~15 分鐘之延遲。
   - 單次任務上限：每個作業最多執行 6 小時，每日單次爬蟲僅需耗時約 20~35 秒。

3. **Cloudflare Workers 免費層（可選邊緣反向代理階梯）**
   - 官方文檔：`https://developers.cloudflare.com/workers/`
   - 免費配額：每日 100,000 次請求，CPU 運行時間每請求上限 10ms，全球 300+ 邊緣節點零冷啟動。
