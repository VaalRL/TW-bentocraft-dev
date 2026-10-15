import type { Category, Model } from '../engine/types';
import { EFFICIENCY, INTERFACE } from './format';

// 選配清單的篩選與排序設定：每個類別各自的條件。
// 篩選：同一組條件內任一符合即可（或），不同組之間都要符合（且）。

export type Facet =
  /** 分組：每個型號可有一或多個值（例如散熱器支援多種腳位），選項少時用按鈕、多時用下拉選單 */
  | { kind: 'group'; id: string; label: string; values: (m: Model) => (string | number)[]; format?: (v: string) => string; order?: 'count' | 'numeric' | string[] }
  /** 條件：勾選後只留下符合的型號 */
  | { kind: 'flag'; id: string; label: string; test: (m: Model) => boolean }
  /** 門檻：數值至少（min）或至多（max）某個值；沒有該數值的型號在設定門檻後不顯示 */
  | { kind: 'min' | 'max'; id: string; label: string; value: (m: Model) => number | undefined; steps: number[]; unit: string };

export interface SortContext {
  /** 今天的最低無條件價 */
  price?: number;
  /** CPU 算圖跑分 */
  score?: number;
}

export interface SortDef {
  id: string;
  label: string;
  key: (m: Model, c: SortContext) => number | undefined;
  desc?: boolean;
  /** 選這個排序時在每個型號顯示的數值 */
  show?: (v: number) => string;
}

const num = (m: Model, f: string) => (typeof m.s[f] === 'number' ? (m.s[f] as number) : undefined);
const str = (m: Model, f: string) => (typeof m.s[f] === 'string' ? [m.s[f] as string] : []);
const per = (price: number | undefined, amount: number | undefined) => (price && amount ? price / amount : undefined);
const money = (v: number) => `$${Math.round(v).toLocaleString('zh-TW')}`;

const brand: Facet = { kind: 'group', id: 'brand', label: '品牌', values: m => [m.b] };
const socket: Facet = { kind: 'group', id: 'socket', label: '腳位', values: m => str(m, 'socket') };
const FORM_FACTORS = ['E-ATX', 'ATX', 'M-ATX', 'Mini-ITX'];
const memoryType: Facet = { kind: 'group', id: 'memory', label: '記憶體', values: m => str(m, 'memory_type'), order: ['DDR5', 'DDR4'] };
const capacity = (m: Model) => num(m, 'capacity_gb');
/** 固態硬碟標稱容量級距：960 GB、1024 GB 都算 1 TB 級，240、256 GB 算 250 GB 級 */
const SSD_TIERS = [250, 500, 1000, 2000, 4000, 8000];
export const ssdTier = (gb: number) => SSD_TIERS.reduce((a, b) => (Math.abs(Math.log(b / gb)) < Math.abs(Math.log(a / gb)) ? b : a));
const tierText = (gb: number) => (gb >= 1000 ? `${gb / 1000} TB` : `${gb} GB 級`);

/** 顯示卡晶片（從型號名稱取出），例如「DUAL-RTX5060TI-O16G」→「RTX 5060 Ti」 */
export function gpuChip(name: string): string | undefined {
  const m = name.toUpperCase().match(/(?:^|[^A-Z0-9])(RTX\s?\d{4}(?:\s?TI)?(?:\s?SUPER)?|GTX\s?\d{3,4}(?:\s?TI)?|RX\s?\d{4}(?:\s?(?:XTX|XT|GRE))?|ARC\s?[AB]\d{3}|GT\s?\d{3,4})(?![0-9])/);
  if (!m) return undefined;
  const code = m[1].replace(/\s+/g, '');
  const arc = code.match(/^ARC([AB]\d{3})$/);
  if (arc) return `Arc ${arc[1]}`;
  const [, prefix, digits, rest] = code.match(/^([A-Z]+?)(\d+)(.*)$/)!;
  const suffix = (rest.match(/TI|SUPER|XTX|XT|GRE/g) ?? []).map(s => (s === 'TI' ? 'Ti' : s));
  return [prefix, digits, ...suffix].join(' ');
}

export const FACETS: Record<Category, Facet[]> = {
  cpu: [
    brand,
    socket,
    { kind: 'flag', id: 'igpu', label: '有內顯', test: m => m.s.igpu === true },
    { kind: 'flag', id: 'cooler', label: '附散熱器', test: m => m.s.cooler_included === true },
    { kind: 'flag', id: 'unlocked', label: '可超頻', test: m => m.s.unlocked === true },
  ],
  motherboard: [
    brand,
    socket,
    { kind: 'group', id: 'chipset', label: '晶片組', values: m => str(m, 'chipset') },
    memoryType,
    { kind: 'group', id: 'form', label: '尺寸', values: m => str(m, 'form_factor'), order: FORM_FACTORS },
    { kind: 'flag', id: 'dimm4', label: '4 條記憶體插槽', test: m => m.s.dimm_slots === 4 },
    { kind: 'flag', id: 'back', label: '背插', test: m => m.s.back_connect === true },
  ],
  ram: [
    brand,
    memoryType,
    { kind: 'group', id: 'capacity', label: '總容量', values: m => (capacity(m) ? [capacity(m)!] : []), order: 'numeric', format: v => `${v} GB` },
    { kind: 'group', id: 'modules', label: '條數', values: m => (num(m, 'modules') ? [num(m, 'modules')!] : []), order: 'numeric', format: v => ({ 1: '單條', 2: '雙通道（2 條）', 4: '4 條' })[v] ?? `${v} 條` },
    { kind: 'min', id: 'speed', label: '速度', value: m => num(m, 'speed_mts'), steps: [3200, 4800, 5600, 6000, 6400], unit: ' MT/s' },
  ],
  gpu: [
    brand,
    { kind: 'group', id: 'chip', label: '晶片', values: m => { const c = gpuChip(m.n); return c ? [c] : []; }, order: 'numeric' },
    { kind: 'max', id: 'length', label: '長度', value: m => num(m, 'length_mm'), steps: [200, 250, 280, 300, 330], unit: ' mm' },
    { kind: 'flag', id: 'low', label: '半高', test: m => m.s.low_profile === true },
  ],
  cooler: [
    brand,
    { kind: 'group', id: 'type', label: '類型', values: m => str(m, 'cooler_type'), order: ['air', 'aio'], format: v => (v === 'aio' ? '一體式水冷' : '風冷') },
    { kind: 'group', id: 'radiator', label: '冷排', values: m => (num(m, 'radiator_mm') ? [num(m, 'radiator_mm')!] : []), order: 'numeric', format: v => `${v} mm` },
    { kind: 'group', id: 'sockets', label: '腳位', values: m => (Array.isArray(m.s.sockets) ? (m.s.sockets as string[]) : []), order: ['AM5', 'AM4', 'LGA1851', 'LGA1700', 'LGA1200', 'LGA1151'] },
    { kind: 'max', id: 'height', label: '高度', value: m => num(m, 'height_mm'), steps: [70, 150, 155, 160, 165], unit: ' mm' },
  ],
  case: [
    brand,
    {
      kind: 'group', id: 'mb', label: '可裝主機板', order: FORM_FACTORS,
      values: m => { const i = FORM_FACTORS.indexOf(m.s.max_mb_form_factor as string); return i < 0 ? [] : FORM_FACTORS.slice(i); },
    },
    { kind: 'group', id: 'psu', label: '電源規格', values: m => (Array.isArray(m.s.psu_form_factors) ? (m.s.psu_form_factors as string[]) : []), order: ['ATX', 'SFX'] },
    {
      kind: 'group', id: 'radiator', label: '可裝冷排', order: 'numeric', format: v => `${v} mm`,
      values: m => [...new Set((Array.isArray(m.s.radiator_support) ? (m.s.radiator_support as { sizes: number[] }[]) : []).flatMap(p => p.sizes).filter(s => s >= 240))],
    },
    { kind: 'min', id: 'gpu', label: '顯卡長度上限', value: m => num(m, 'gpu_clearance_mm'), steps: [300, 330, 360, 400], unit: ' mm' },
    { kind: 'min', id: 'cooler', label: '散熱器高度上限', value: m => num(m, 'cooler_clearance_mm'), steps: [150, 160, 165, 170], unit: ' mm' },
    { kind: 'flag', id: 'back', label: '支援背插主機板', test: m => typeof m.s.back_connect_max_form_factor === 'string' },
  ],
  psu: [
    brand,
    { kind: 'min', id: 'watt', label: '瓦數', value: m => num(m, 'wattage'), steps: [550, 650, 750, 850, 1000, 1200], unit: ' W' },
    { kind: 'group', id: 'eff', label: '認證', values: m => str(m, 'efficiency'), order: ['white', 'bronze', 'silver', 'gold', 'platinum', 'titanium'], format: v => EFFICIENCY[v] ?? v },
    { kind: 'group', id: 'form', label: '尺寸', values: m => str(m, 'form_factor'), order: ['ATX', 'SFX', 'SFX-L'] },
    { kind: 'flag', id: '12v2x6', label: '原生 12V-2x6', test: m => (num(m, 'pcie_12v2x6') ?? 0) >= 1 },
    { kind: 'flag', id: 'atx31', label: 'ATX 3.1', test: m => m.s.atx_version === '3.1' },
  ],
  ssd: [
    brand,
    { kind: 'group', id: 'interface', label: '介面', values: m => str(m, 'interface'), order: ['pcie5', 'pcie4', 'pcie3', 'sata'], format: v => INTERFACE[v] ?? v },
    { kind: 'group', id: 'capacity', label: '容量', values: m => (capacity(m) ? [ssdTier(capacity(m)!)] : []), order: 'numeric', format: v => tierText(Number(v)) },
  ],
};

/** 價格排序之外，各類別額外的排序方式 */
export const SORTS: Record<Category, SortDef[]> = {
  cpu: [
    { id: 'score', label: '算力高到低', key: (_, c) => c.score, desc: true },
    { id: 'power', label: '耗電低到高', key: m => num(m, 'max_power_w') },
    { id: 'value', label: '每千元算力高到低', key: (_, c) => (c.score && c.price ? (c.score / c.price) * 1000 : undefined), desc: true, show: v => `每千元算力 ${v.toFixed(1)}` },
  ],
  motherboard: [{ id: 'memory', label: '最大記憶體高到低', key: m => num(m, 'max_memory_gb'), desc: true }],
  ram: [
    { id: 'capacity', label: '容量大到小', key: capacity, desc: true },
    { id: 'speed', label: '速度高到低', key: m => num(m, 'speed_mts'), desc: true },
    { id: 'per-gb', label: '每 GB 價格低到高', key: (m, c) => per(c.price, capacity(m)), show: v => `每 GB ${money(v)}` },
  ],
  gpu: [
    { id: 'length', label: '長度短到長', key: m => num(m, 'length_mm') },
    { id: 'power', label: '功耗低到高', key: m => num(m, 'board_power_w') },
  ],
  cooler: [
    { id: 'height', label: '高度低到高', key: m => num(m, 'height_mm') },
    { id: 'tdp', label: '解熱瓦數高到低', key: m => num(m, 'tdp_rating_w'), desc: true },
  ],
  case: [
    { id: 'gpu', label: '顯卡長度上限大到小', key: m => num(m, 'gpu_clearance_mm'), desc: true },
    { id: 'cooler', label: '散熱器高度上限大到小', key: m => num(m, 'cooler_clearance_mm'), desc: true },
  ],
  psu: [
    { id: 'watt', label: '瓦數高到低', key: m => num(m, 'wattage'), desc: true },
    { id: 'per-w', label: '每瓦價格低到高', key: (m, c) => per(c.price, num(m, 'wattage')), show: v => `每瓦 $${v.toFixed(1)}` },
  ],
  ssd: [
    { id: 'capacity', label: '容量大到小', key: capacity, desc: true },
    { id: 'per-tb', label: '每 TB 價格低到高', key: (m, c) => per(c.price, capacity(m) && capacity(m)! / 1000), show: v => `每 TB ${money(v)}` },
  ],
};

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

/** 分組條件的選項（依設定的順序），附各選項的型號數 */
export function facetOptions(facet: Extract<Facet, { kind: 'group' }>, models: Model[]): FacetOption[] {
  const counts = new Map<string, number>();
  for (const m of models) for (const v of new Set(facet.values(m).map(String))) counts.set(v, (counts.get(v) ?? 0) + 1);
  const order = facet.order ?? 'count';
  const entries = [...counts];
  entries.sort((a, b) =>
    Array.isArray(order) ? rank(order, a[0]) - rank(order, b[0]) :
    order === 'numeric' ? a[0].localeCompare(b[0], 'zh-TW', { numeric: true }) :
    b[1] - a[1] || a[0].localeCompare(b[0], 'zh-TW'),
  );
  return entries.map(([value, count]) => ({ value, count, label: facet.format ? facet.format(value) : value }));
}
const rank = (order: string[], v: string) => (order.includes(v) ? order.indexOf(v) : order.length);

/** 門檻條件中有型號符合的選項 */
export function thresholdSteps(facet: Extract<Facet, { kind: 'min' | 'max' }>, models: Model[]): number[] {
  const values = models.map(facet.value).filter((v): v is number => v !== undefined);
  return facet.steps.filter(s => values.some(v => (facet.kind === 'min' ? v >= s : v <= s)));
}

/** 型號是否符合目前的篩選（selected：條件 id → 選取的值） */
export function matches(m: Model, facets: Facet[], selected: Record<string, string[]>): boolean {
  return facets.every(f => {
    const sel = selected[f.id];
    if (!sel?.length) return true;
    if (f.kind === 'flag') return f.test(m);
    if (f.kind === 'group') return f.values(m).some(v => sel.includes(String(v)));
    const v = f.value(m), limit = Number(sel[0]);
    return v !== undefined && (f.kind === 'min' ? v >= limit : v <= limit);
  });
}
