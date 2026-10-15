// 名詞解釋：名詞解釋頁與電腦版懸停說明共用的詞庫。
// 說明為本站自行撰寫；aliases 是在畫面文字中要標註的寫法（區分大小寫），沒有 aliases 的名詞只出現在名詞解釋頁。

export type GlossaryGroup = 'cpu' | 'board' | 'gpu' | 'power' | 'site';

export const GROUP_LABEL: Record<GlossaryGroup, string> = {
  cpu: '處理器',
  board: '主機板與記憶體',
  gpu: '顯示卡與儲存',
  power: '電源、散熱與機殼',
  site: '本站用語',
};

export interface GlossaryEntry {
  id: string;
  term: string;
  group: GlossaryGroup;
  aliases: string[];
  /** 是什麼 */
  short: string;
  /** 選購時注意 */
  tip?: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  // ── 處理器 ──
  {
    id: 'socket', term: '腳位（Socket）', group: 'cpu',
    aliases: ['腳位', 'AM5', 'AM4', 'LGA1851', 'LGA1700', 'LGA1200', 'LGA1151'],
    short: 'CPU 裝在主機板上的插座規格。AMD 目前是 AM5（Ryzen 7000／9000 系列）與舊平台 AM4；Intel 是 LGA1851（Core Ultra 200 系列）與 LGA1700（第 12～14 代 Core）。',
    tip: 'CPU 與主機板的腳位必須相同；散熱器也要有對應腳位的扣具。',
  },
  {
    id: 'cores', term: '核心／執行緒', group: 'cpu',
    aliases: ['執行緒'],
    short: '核心是實際運算的單元；執行緒是作業系統看到能同時處理的工作數。支援同步多執行緒（SMT／Hyper-Threading）的核心，一顆可以跑兩個執行緒。',
    tip: '核心多對算圖、轉檔、編譯有幫助；遊戲通常 6～8 核就夠，更看重單核效能與快取。',
  },
  {
    id: 'hybrid', term: 'P 核／E 核', group: 'cpu',
    aliases: [],
    short: 'Intel 從第 12 代起採用大小核設計：P 核（效能核心）負責重度工作，E 核（節能核心）處理背景與多工。規格寫「8P＋12E」就是 8 顆 P 核加 12 顆 E 核。',
  },
  {
    id: 'clock', term: '時脈（GHz）', group: 'cpu',
    aliases: ['加速時脈', '基礎時脈', '時脈'],
    short: 'CPU 每秒運作的週期數。基礎時脈是長時間保證的頻率；加速時脈是溫度與功耗允許時，少數核心能達到的最高頻率。',
    tip: '不同架構每個時脈能做的事不同，只有同一代之間比時脈才有意義。',
  },
  {
    id: 'cache', term: '快取（L2／L3）', group: 'cpu',
    aliases: ['L3 快取', 'L2 快取', '快取'],
    short: 'CPU 內建的高速記憶體，存放常用資料，減少向主記憶體讀取的等待。L3 是所有核心共用的最後一層快取。',
    tip: '大容量 L3 對遊戲幫助明顯；AMD 型號有「X3D」的就是多堆疊了一層 L3 快取（3D V-Cache）。',
  },
  {
    id: 'tdp', term: 'TDP／基礎功耗', group: 'cpu',
    aliases: ['TDP', '基礎功耗'],
    short: '原廠標示的散熱設計功耗：AMD 稱 TDP，Intel 稱基礎功耗（Processor Base Power）。是長時間運作的參考值，不是實際最高耗電。',
    tip: '挑電源與散熱器時請看最大功耗（PPT／PL2）；兩家的計算方式不同，TDP 不能直接互比。',
  },
  {
    id: 'maxpower', term: '最大功耗（PPT／PL2）', group: 'cpu',
    aliases: ['最大功耗', 'PPT', 'PL2', '耗電'],
    short: 'CPU 預設允許的最高持續耗電：AMD 稱 PPT（Package Power Tracking），Intel 稱 PL2 或最大加速功耗（Maximum Turbo Power）。',
    tip: '本站清單的「耗電」與電源瓦數估算都用這個數值；主機板若解除功耗限制，實際耗電可能更高。',
  },
  {
    id: 'igpu', term: '內顯', group: 'cpu',
    aliases: ['內顯', '內建顯示'],
    short: 'CPU 內建的顯示晶片，不裝顯示卡也能接螢幕。Intel 型號帶 F、以及部分 AMD 型號（例如 7500F、8400F）沒有內顯。',
    tip: '沒有內顯的 CPU 一定要搭配顯示卡才有畫面；有內顯則在顯示卡故障時也能先用。',
  },
  {
    id: 'unlocked', term: '倍頻／可超頻', group: 'cpu',
    aliases: ['倍頻', '可超頻', '未鎖'],
    short: '倍頻未鎖的 CPU 可以自行調高頻率（超頻）。Intel 型號帶 K 的才能超頻；AMD Ryzen 大多不鎖倍頻。',
    tip: '超頻還需要支援的主機板晶片組：Intel 要 Z 系列；AMD 要 B 或 X 系列（A 系列不支援）。',
  },
  {
    id: 'process', term: '製程', group: 'cpu',
    aliases: ['製程'],
    short: '製造晶片的技術世代，例如 TSMC 4nm、Intel 7。數字越小通常代表電晶體越密、越省電，但各家的命名方式不同，不能只看數字比較。',
  },
  {
    id: 'render', term: '算力（算圖分數）', group: 'cpu',
    aliases: ['算力', '算圖效能'],
    short: '本站取自 Blender Open Data：使用者以 Blender 官方跑分工具實測的 CPU 算圖成績（三個場景每分鐘樣本數的總和），每個型號取中位數，每週更新。',
    tip: '只代表多核心算圖這類工作，不代表遊戲效能；不同 Blender 版本的分數不能互比。',
  },
  {
    id: 'value', term: '每千元算力', group: 'cpu',
    aliases: ['每千元算力'],
    short: '算力除以今天的原價屋價格再乘以 1,000，代表每花一千元買到多少算圖效能，用來比較 CP 值。',
    tip: '只算 CPU 本身，沒有算進主機板、散熱器等平台成本。',
  },

  // ── 主機板與記憶體 ──
  {
    id: 'chipset', term: '晶片組', group: 'board',
    aliases: ['晶片組'],
    short: '主機板上負責擴充功能的晶片，決定能不能超頻、有多少 PCIe 與 USB 等。AMD 如 B850、X870，Intel 如 B860、Z890。',
    tip: '晶片組要對應 CPU 的腳位；想超頻 Intel K 版 CPU 要選 Z 系列。',
  },
  {
    id: 'formfactor', term: '板型（ATX／M-ATX／Mini-ITX）', group: 'board',
    aliases: ['E-ATX', 'M-ATX', 'Mini-ITX', 'ATX', '板型'],
    short: '主機板的尺寸規格：ATX 約 30.5 × 24.4 cm、M-ATX 約 24.4 × 24.4 cm、Mini-ITX 約 17 × 17 cm，E-ATX 比 ATX 更寬。電源也沿用 ATX 這個名稱表示標準尺寸。',
    tip: '機殼要支援主機板的板型；能裝大板型的機殼通常也能裝較小的板型。',
  },
  {
    id: 'backconnect', term: '背插主機板', group: 'board',
    aliases: ['背插'],
    short: '把接頭移到主機板背面的設計（例如華碩 BTF、微星 Project Zero），正面看不到線材，外觀更整齊。',
    tip: '需要機殼背板有對應開孔才能安裝，一般機殼裝不進去。',
  },
  {
    id: 'ddr', term: 'DDR4／DDR5', group: 'board',
    aliases: ['DDR5', 'DDR4'],
    short: '記憶體的世代。DDR5 頻寬較高，是目前新平台（AM5、LGA1851）的標準；DDR4 用在較舊的平台。',
    tip: '記憶體世代必須與主機板相同，兩者插槽互不相容。LGA1700 同時有 DDR4 和 DDR5 的主機板，購買時要看清楚。',
  },
  {
    id: 'mts', term: 'MT/s（記憶體速度）', group: 'board',
    aliases: ['MT/s'],
    short: '記憶體每秒的傳輸次數，例如 DDR5-6000 就是 6000 MT/s，數字越高頻寬越大。',
    tip: '超過 CPU 官方支援的速度要在 BIOS 開啟 XMP（Intel）或 EXPO（AMD），能否穩定運作取決於主機板與 CPU。',
  },
  {
    id: 'channel', term: '雙通道', group: 'board',
    aliases: ['雙通道', '單條'],
    short: '兩條記憶體插在主機板指定的插槽上組成雙通道，頻寬是單條的兩倍。',
    tip: '建議買兩條一組的套裝；只插一條會損失效能，對內顯的影響尤其明顯。',
  },
  {
    id: 'dimm', term: '記憶體插槽', group: 'board',
    aliases: ['記憶體插槽', '插槽'],
    short: '主機板上插記憶體的插槽，一般主機板有 2 或 4 條。',
    tip: '4 條插槽方便日後擴充，但 DDR5 插滿 4 條時，能穩定運作的速度通常會降低。',
  },

  // ── 顯示卡與儲存 ──
  {
    id: 'pcie', term: 'PCIe', group: 'gpu',
    aliases: ['PCIe'],
    short: '顯示卡、M.2 SSD 等裝置與 CPU 溝通的介面。世代（4.0、5.0）每升一代頻寬約加倍；通道數（x16、x4）越多頻寬越大。CPU 規格中的「28 條」是 CPU 提供的 PCIe 通道總數。',
    tip: '新舊世代互相相容，只是以較低的速度運作；目前顯示卡在 PCIe 4.0 和 5.0 上的效能差距很小。',
  },
  {
    id: 'gpulength', term: '顯卡長度', group: 'gpu',
    aliases: ['顯卡長度'],
    short: '顯示卡從擋板到末端的長度。機殼規格會寫可裝的顯卡長度上限。',
    tip: '前置風扇或冷排會占用空間，本站會標出這類條件式上限。',
  },
  {
    id: 'boardpower', term: '顯卡功耗', group: 'gpu',
    aliases: ['顯卡功耗'],
    short: '整張顯示卡的耗電（Total Board Power）。本站估算電源瓦數時使用；部分型號未標示，會依同晶片的參考值推定。',
  },
  {
    id: 'lowprofile', term: '半高顯示卡', group: 'gpu',
    aliases: ['半高'],
    short: '高度較矮的顯示卡（Low Profile），用於小型或薄型機殼，安裝時要換上附贈的半高擋板。',
  },
  {
    id: 'm2', term: 'M.2', group: 'gpu',
    aliases: ['M.2', 'm2-2280', 'm2-2230', 'm2-2242'],
    short: 'SSD 常見的外形，條狀直接插在主機板上。2280 指寬 22 mm、長 80 mm；2230、2242 是較短的版本，常用於掌機與筆電。',
    tip: 'M.2 插槽可能走 PCIe（NVMe）或 SATA，購買前確認主機板支援的類型。',
  },
  {
    id: 'nvme', term: 'NVMe', group: 'gpu',
    aliases: ['NVMe'],
    short: '透過 PCIe 傳輸的 SSD 協定，速度遠高於 SATA。規格寫 PCIe 4.0、5.0 的 SSD 都是 NVMe。',
  },
  {
    id: 'sata', term: 'SATA', group: 'gpu',
    aliases: ['SATA', '2.5in'],
    short: '較舊的儲存介面，速度上限約 600 MB/s，常見於 2.5 吋 SSD 與傳統硬碟。',
    tip: '價格便宜，適合當大容量資料碟；系統碟建議用 NVMe。',
  },

  // ── 電源、散熱與機殼 ──
  {
    id: '80plus', term: '80 PLUS 認證', group: 'power',
    aliases: ['80 PLUS', '白牌', '銅牌', '銀牌', '金牌', '白金', '鈦金'],
    short: '電源轉換效率的認證，由低到高為白牌、銅牌、銀牌、金牌、白金、鈦金。效率越高，浪費成熱的電越少。',
    tip: '認證只代表效率，不代表用料、保固或穩定性。',
  },
  {
    id: 'atx3', term: 'ATX 3.0／3.1', group: 'power',
    aliases: ['ATX 3.1', 'ATX 3.0'],
    short: 'Intel 制定的新版電源規格，加強對顯示卡瞬間高耗電的承受能力，並提供 16-pin 顯示卡供電接頭（3.1 版改用 12V-2x6）。',
    tip: '搭配新一代高階顯示卡時，建議選 ATX 3.1 電源。',
  },
  {
    id: '12v2x6', term: '12V-2x6', group: 'power',
    aliases: ['12V-2x6', '12VHPWR'],
    short: '新一代顯示卡的 16-pin 供電接頭，是 12VHPWR 的改良版，一條線最高可供 600 W。',
    tip: '電源沒有原生接頭時要用轉接線合併多個 8-pin；不論哪種，接頭都要確實插到底。',
  },
  {
    id: 'sfx', term: 'SFX／SFX-L', group: 'power',
    aliases: ['SFX-L', 'SFX'],
    short: '小型電源的尺寸規格：SFX 約 12.5 × 6.35 × 10 cm，SFX-L 長約 13 cm，用於 ITX 等小機殼。',
    tip: 'SFX 電源可透過轉接架裝進 ATX 電源位；反過來，ATX 電源裝不進只支援 SFX 的機殼。',
  },
  {
    id: 'load', term: '估計滿載', group: 'power',
    aliases: ['估計滿載'],
    short: '本站估算的整機滿載耗電：CPU 最大功耗 ＋ 顯示卡功耗 ＋ 50 W（主機板、記憶體、儲存、風扇），使用一體式水冷再加 15 W。',
    tip: '建議電源瓦數是估計滿載 × 1.25 再進位到 50 W，讓電源保留餘裕、在較有效率的負載區間運作。',
  },
  {
    id: 'aio', term: '一體式水冷', group: 'power',
    aliases: ['一體式水冷'],
    short: '水冷頭、水管、冷排與水泵出廠就組好的封閉式水冷，不需要自己加水。',
    tip: '要確認機殼有對應尺寸的冷排安裝位置。',
  },
  {
    id: 'radiator', term: '冷排', group: 'power',
    aliases: ['冷排'],
    short: '水冷的散熱鰭片，尺寸依可裝的風扇而定：240 是 2 顆 12 cm 風扇、360 是 3 顆；280、420 則是 14 cm 風扇。',
    tip: '機殼規格會列出前、頂、側、底各位置可裝的冷排尺寸。',
  },
  {
    id: 'aircooler', term: '風冷', group: 'power',
    aliases: ['風冷'],
    short: '以散熱鰭片加風扇組成的塔式散熱器，構造簡單、耐用。',
    tip: '高度不能超過機殼的散熱器高度上限，也要留意是否擋到記憶體。',
  },
  {
    id: 'coolerheight', term: '散熱器高度', group: 'power',
    aliases: ['散熱器高度'],
    short: '塔式風冷從主機板表面算起的高度；機殼規格會寫可裝的上限。',
  },
  {
    id: 'mount', term: '扣具', group: 'power',
    aliases: ['扣具'],
    short: '把散熱器固定在主機板上的金屬件，每種腳位的孔距不同。',
    tip: 'AM5 大多沿用 AM4 的扣具，LGA1851 沿用 LGA1700 的扣具；舊散熱器要確認有對應的扣具。',
  },
  {
    id: 'tdprating', term: '解熱瓦數', group: 'power',
    aliases: ['解熱瓦數'],
    short: '散熱器原廠標示能處理的熱量（W）。各家測試條件不同，只能大略參考。',
  },
  {
    id: 'shroud', term: '電源護罩', group: 'power',
    aliases: ['電源護罩'],
    short: '機殼底部遮住電源與線材的隔板。裝上後通常會縮短可裝的顯卡長度或冷排空間。',
  },

  // ── 本站用語 ──
  {
    id: 'status', term: '相容／注意／不相容／未確認', group: 'site',
    aliases: [],
    short: '本站的檢查結果。相容：依規格沒有衝突；注意：可以使用但有條件，例如需要轉接線或接近上限；不相容：依規格裝不上或無法運作；未確認：缺少規格資料，無法判斷。',
  },
  {
    id: 'inferred', term: '推定規格', group: 'site',
    aliases: ['推定'],
    short: '原廠沒有明確標示、由品名或同系列產品推得的規格，例如品名沒寫 SFX 就推定為 ATX 電源。依推定規格得出的檢查結果會加註。',
  },
  {
    id: 'conditional', term: '條件式上限', group: 'site',
    aliases: ['條件式上限'],
    short: '只在特定配置下成立的上限，例如「裝前置風扇時」顯卡長度上限較短。本站的檢查與尺寸比例圖會標出這類上限。',
  },
];

export const GLOSSARY_BY_ID = new Map(GLOSSARY.map(e => [e.id, e]));

/** 別名 → 名詞；比對時長的優先（M-ATX 先於 ATX、SFX-L 先於 SFX） */
const ALIAS = new Map(GLOSSARY.flatMap(e => e.aliases.map(a => [a, e.id] as const)));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERN = new RegExp(
  [...ALIAS.keys()].sort((a, b) => b.length - a.length)
    // 英數字的名詞前後不能緊接英數字（避免 ATX 比對到 TATX、DDR5 比對到 GDDR5）
    .map(a => (/^[\w.-]/.test(a) ? `(?<![A-Za-z0-9])${escape(a)}(?![A-Za-z0-9])` : escape(a)))
    .join('|'),
  'g',
);

export interface Segment {
  text: string;
  term?: string;
}

/** 把文字切成一般文字與名詞；同一段文字中每個名詞只標第一次出現 */
export function annotate(text: string): Segment[] {
  const out: Segment[] = [];
  const seen = new Set<string>();
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const id = ALIAS.get(m[0])!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], term: id });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** 名詞解釋頁的搜尋：名詞、別名與說明都比對 */
export function searchGlossary(query: string): GlossaryEntry[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return GLOSSARY;
  return GLOSSARY.filter(e => {
    const hay = [e.term, ...e.aliases, e.short, e.tip ?? ''].join(' ').toLowerCase();
    return terms.every(t => hay.includes(t));
  });
}
