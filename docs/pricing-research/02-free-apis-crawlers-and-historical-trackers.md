# 第二章：免費資源全景矩陣：開源爬蟲、歷史追蹤庫、瀏覽器腳本與跨國資料庫

---

## 2.1 四大免費獲取途徑架構矩陣

雖然原價屋與欣亞等實體通路未釋出官方 API，但開源社群與第三方開發者圍繞「電腦零組件即時報價與歷史走勢」，已經建立起四套高度成熟且完全免費的資料獲取管道：

```
                    【四大免費電腦硬體報價查詢途徑】
  
  ┌────────────────────────────────────────────────────────┐
  │ 途徑一：現成開源歷史價格庫 (免寫程式，開箱即查)         │
  │ • CoolPC Price Tracker (GitHub 每日快照比對)           │
  │ • TWBuyer.info (主流電商 180 天歷史價格趨勢)            │
  └────────────────────────────────────────────────────────┘
  ┌────────────────────────────────────────────────────────┐
  │ 途徑二：開發者專用開源爬蟲與 MCP 工具 (自動化與 AI Agent)│
  │ • shyuan/coolpc-mcp-server (Model Context Protocol 整合)│
  │ • coolpc-skill (Claude Code 專用即時爬蟲與配單腳本)     │
  │ • 自建 Python requests + BeautifulSoup 輕量爬蟲管道     │
  └────────────────────────────────────────────────────────┘
  ┌────────────────────────────────────────────────────────┐
  │ 途徑三：瀏覽器端油猴腳本 (Tampermonkey，客戶端無伺服器) │
  │ • 原價屋估價單助手 / 原價屋 AI 建議清單                 │
  │ • 直接在 DOM 層擴充，免維護後端，免防爬蟲封鎖          │
  └────────────────────────────────────────────────────────┘
  ┌────────────────────────────────────────────────────────┐
  │ 途徑四：跨電商搜尋引擎與國際權威資料庫 (規格與全網比價) │
  │ • BigGo / 飛比價格 (跨電商歷史低點外掛)                │
  │ • PCPartPicker + py-pcpartpicker (全球硬體規格與相容性) │
  └────────────────────────────────────────────────────────┘
```

---

## 2.2 途徑一：現成開源歷史價格追蹤庫 (免寫爬蟲，直接取用)

### 1. CoolPC Price Tracker (原價屋價格追蹤)
* **架構機制**：
  - 開發者利用 **GitHub Actions** 設定每日定時排程（Cron Job），自動抓取原價屋全量清單，經過格式化後將 JSON 資料快照 Commit 至 GitHub 倉庫。
  - 前端基於 **GitHub Pages** 提供純靜態查詢介面。
* **核心功能**：
  - **任選兩天快照比對**：使用者可選取兩個不同時間節點（例如 2024 年 1 月 vs 2026 年 10 月），系統自動 Diff 出此期間所有零組件的**「漲價金額、降價金額、新上架產品、已停售下架產品」**。
  - **完全免費、永久免維護**：由於使用者只讀取 GitHub Pages 上的靜態 JSON，**完全不需要向原價屋伺服器發送請求，零封鎖風險**。
* **網址與專案**：可於 GitHub 搜尋 `coolpc-price-tracker` 開源倉庫。

### 2. TWBuyer.info (台灣電商歷史價格網)
* **定位**：專門追蹤大型綜合電商（PChome 24h、momo 購物網、Yahoo 購物中心）電腦零組件之歷史價格。
* **特色**：繪製 90 天至 180 天之價格波動折線圖，協助判定電商「降價促銷」是否為「先漲後降」的虛假折扣。

---

## 2.3 途徑二：開發者專用開源爬蟲與 MCP Server (AI Agent 與自動化)

對於希望在自己的程式或 AI 助理中整合即時報價的開發者，以下為社群主流開源解決方案：

### 1. `shyuan/coolpc-mcp-server`
* **標準協議**：基於 Anthropic 主導之 **Model Context Protocol (MCP)** 架構。
* **核心模組 (`coolpc_parser.py`)**：
  - 封裝了對 `coolpc.com.tw/evaluate.php` 的 HTTP 抓取與 DOM 樹抽取。
  - 能夠將長字串自動分解為 `category`、`name`、`spec`、`price` 等結構化欄位。
* **適用環境**：可直接掛載於 Claude Desktop、Cursor、Antigravity CLI 或自研 Agent 系統，讓 AI 能在對話中直接調用 `query_hardware_price(category="gpu")` 工具。

### 2. `coolpc-skill` (Coding Agent 專用工具)
* **特色**：專為 Claude Code 開發之 Skill，結合 Playwright 自動化無頭瀏覽器與 BeautifulSoup，支援自動爬取最新價格、依預算自動搭配硬體、並自動填入估價單生成分享連結。

### 3. 20 行 Python 輕量自建爬蟲範例 (Requests + BS4)
若只需要抓取特定硬體類別（如顯示卡），使用 Python 即可快速完成本機原型：

```python
import requests
from bs4 import BeautifulSoup
import re

def fetch_coolpc_gpus():
    url = "https://coolpc.com.tw/evaluate.php"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    resp = requests.get(url, headers=headers)
    resp.encoding = "big5"  # 原價屋傳統頁面多採用 Big5 或特定編碼
    
    soup = BeautifulSoup(resp.text, "html.parser")
    # 尋找顯示卡對應之 select 欄位 (通常分類 ID 介於 12~14 之間)
    gpu_select = soup.find("select", {"name": "n12"})
    
    items = []
    if gpu_select:
        for opt in gpu_select.find_all("option"):
            text = opt.text.strip()
            # 正規表達式提取末端價格
            match = re.search(r'\$(\d+)', text)
            if match:
                price = int(match.group(1))
                items.append({"raw_text": text, "price": price})
    return items

# 測試輸出
if __name__ == "__main__":
    gpus = fetch_coolpc_gpus()
    print(f"成功抓取 {len(gpus)} 檔顯示卡報價！")
```

---

## 2.4 途徑三：用戶端瀏覽器油猴腳本 (Tampermonkey，零伺服器負擔)

若不想自己架設伺服器或寫腳本，可在 Chrome / Edge 安裝 **Tampermonkey (油猴插件)**，並在 Greasy Fork 搜尋安裝社群維護的使用者腳本：
1. **「原價屋估價單助手」**：
   - 在估價單上方動態新增搜尋過濾框、即時瓦數功耗試算、以及一鍵複製規格清單至 PTT / 巴哈姆特討論區。
2. **「原價屋 AI 建議估價清單」**：
   - 直接在瀏覽器前端載入跑分資料庫，在每張顯示卡旁邊標註 3DMark 跑分比值（CP 值 = 跑分 / 售價），高亮最佳性價比選擇。

---

## 2.5 途徑四：跨電商聚合與國際級 DIY 資料庫

### 1. BigGo / 飛比價格 (Feebee)
* **優勢**：涵蓋 PChome、momo、Yahoo、蝦皮商城等跨平台搜尋。
* **實踐**：安裝其官方 Chrome 擴充功能，在瀏覽任何購物網站時，側邊欄會自動跳出同型號零件在其他商城的即時低價與歷史走勢。

### 2. PCPartPicker (`pcpartpicker.com`) & `py-pcpartpicker`
* **全球公認最頂級的 DIY 硬體數據庫**：
  - 具備百萬級別的硬體規格庫，其最大價值在於**「物理相容性驗證演算法」**（例如：檢查水冷排是否卡到高馬甲記憶體、電源長度是否會頂到硬碟架、CPU 與主機板 BIOS 版本相容性）。
* **開源 Python 庫 (`py-pcpartpicker`)**：
  - 開發者可透過此開源庫查詢全球硬體規格標準命名、各國零售價格趨勢，適合作為硬體名稱標準化 (Mapping) 的基礎資料庫。
