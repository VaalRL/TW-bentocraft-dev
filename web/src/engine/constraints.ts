// 相容性約束，規則見 02-hardware-compatibility-constraint-engine.md 第二節。
// 規格缺漏時回傳 unknown，不以預設值代替。
import type { Category, Check, Model, Selection, Status } from './types';

const RANK: Record<string, number> = { 'Mini-ITX': 1, 'M-ATX': 2, ATX: 3, 'E-ATX': 4 };

export const CONDITION_LABEL: Record<string, string> = {
  psu_shroud_installed: '裝上電源護罩時',
  front_fan_installed: '裝前置風扇時',
  front_radiator_installed: '前置冷排時',
  top_radiator_installed: '頂部冷排時',
  drive_cage_installed: '裝硬碟架時',
  unspecified: '特定配置下',
};

interface Spec<T> {
  value: T;
  tolerance: number;
  conditions: [number, string][];
  inferred: boolean;
}

export function spec<T>(m: Model, field: string): Spec<T> | undefined {
  if (!(field in m.s)) return undefined;
  const meta = m.x?.[field] ?? {};
  return { value: m.s[field] as T, tolerance: meta.t ?? 0, conditions: meta.k ?? [], inferred: meta.i === 1 };
}

const result = (constraint: string, status: Status, message = '', inferred = false): Check =>
  inferred ? { constraint, status, message, inferred } : { constraint, status, message };

/** 尺寸是否放得下：雙方誤差相加為誤差帶；超過條件式上限時給警告。 */
export function fits(constraint: string, what: string, size?: Spec<number>, limit?: Spec<number>): Check {
  if (!size || !limit) return result(constraint, 'unknown', `${what}規格未確認`);
  const eps = size.tolerance + limit.tolerance;
  if (size.value - eps > limit.value)
    return result(constraint, 'fail', `${what} ${size.value} mm 超過上限 ${limit.value} mm`);
  if (size.value + eps > limit.value)
    return result(constraint, 'warn', `${what} ${size.value} mm 接近上限 ${limit.value} mm（誤差 ±${eps} mm），請以原廠規格確認`);
  const tighter = limit.conditions.filter(([v]) => size.value > v);
  if (tighter.length)
    return result(constraint, 'warn', tighter.map(([v, w]) => `${CONDITION_LABEL[w] ?? w}上限僅 ${v} mm`).join('；'));
  return result(constraint, 'pass');
}

function equal(constraint: string, label: string, a?: Spec<string>, b?: Spec<string>): Check {
  if (!a || !b) return result(constraint, 'unknown', `${label}未確認`);
  const inferred = a.inferred || b.inferred;
  return a.value === b.value
    ? result(constraint, 'pass', '', inferred)
    : result(constraint, 'fail', `${label}不符：${a.value} ≠ ${b.value}`, inferred);
}

export interface PairConstraint {
  id: string;
  between: [Category, Category];
  check(a: Model, b: Model): Check;
}

export const PAIR_CONSTRAINTS: PairConstraint[] = [
  { id: 'C1', between: ['cpu', 'motherboard'], check: (c, m) => equal('C1', '腳位', spec(c, 'socket'), spec(m, 'socket')) },
  {
    id: 'C2', between: ['ram', 'motherboard'], check: (r, m) => {
      const gen = equal('C2', '記憶體世代', spec(r, 'memory_type'), spec(m, 'memory_type'));
      if (gen.status !== 'pass') return gen;
      const n = spec<number>(r, 'modules'), slots = spec<number>(m, 'dimm_slots');
      if (!n || !slots) return result('C2', 'unknown', '記憶體條數或主機板插槽數未確認');
      return n.value > slots.value
        ? result('C2', 'fail', `${n.value} 條超過 ${slots.value} 個插槽`, n.inferred || slots.inferred)
        : gen;
    },
  },
  {
    id: 'C3', between: ['motherboard', 'case'], check: (m, c) => {
      const ff = spec<string>(m, 'form_factor'), max = spec<string>(c, 'max_mb_form_factor');
      if (!ff || !max) return result('C3', 'unknown', '板型未確認');
      return RANK[ff.value] > RANK[max.value]
        ? result('C3', 'fail', `機殼最大支援 ${max.value}，無法裝入 ${ff.value}`)
        : result('C3', 'pass');
    },
  },
  {
    id: 'C4', between: ['gpu', 'case'], check: (g, c) =>
      spec<boolean>(g, 'external')?.value ? result('C4', 'pass') : fits('C4', '顯卡長度', spec(g, 'length_mm'), spec(c, 'gpu_clearance_mm')),
  },
  {
    id: 'C5', between: ['cooler', 'case'], check: (k, c) => {
      const type = spec<string>(k, 'cooler_type');
      if (type?.value === 'air') {
        const r = fits('C5', '散熱器高度', spec(k, 'height_mm'), spec(c, 'cooler_clearance_mm'));
        return type.inferred && r.status !== 'pass' ? { ...r, inferred: true } : r;
      }
      if (type?.value === 'aio') {
        const size = spec<number>(k, 'radiator_mm');
        const support = spec<{ sizes: number[] }[]>(c, 'radiator_support');
        if (!size || !support) return result('C5', 'unknown', '冷排尺寸或機殼冷排位未確認');
        if (support.value.some(p => p.sizes.includes(size.value))) return result('C5', 'pass');
        // 原廠常只列最大尺寸（「頂部 360/420」）：比某個冷排位的上限小、只是沒被列出時不判不相容
        const largest = Math.max(...support.value.flatMap(p => p.sizes));
        return size.value < largest
          ? result('C5', 'warn', `原廠未列出 ${size.value} mm 冷排，較大的冷排位通常也能裝，請確認`)
          : result('C5', 'fail', `機殼不支援 ${size.value} mm 冷排`);
      }
      return result('C5', 'unknown', '散熱器類型未確認');
    },
  },
  {
    id: 'C6', between: ['cooler', 'cpu'], check: (k, c) => {
      const sockets = spec<string[]>(k, 'sockets'), socket = spec<string>(c, 'socket');
      if (!sockets || !socket) return result('C6', 'unknown', '散熱器扣具支援未確認');
      return sockets.value.includes(socket.value)
        ? result('C6', 'pass')
        : result('C6', 'fail', `散熱器扣具不支援 ${socket.value}`);
    },
  },
  {
    id: 'C8', between: ['gpu', 'psu'], check: (g, p) => {
      const needs = spec<string[]>(g, 'power_connectors')?.value.includes('12V-2x6');
      const has = spec<number>(p, 'pcie_12v2x6');
      if (!needs || !has) return result('C8', 'pass');
      return has.value === 0 ? result('C8', 'warn', '電源沒有原生 12V-2x6 接頭，需使用轉接線') : result('C8', 'pass');
    },
  },
  {
    id: 'C9', between: ['psu', 'case'], check: (p, c) => {
      const ff = spec<string>(p, 'form_factor'), allowed = spec<string[]>(c, 'psu_form_factors');
      if (!ff || !allowed) return result('C9', 'unknown', '電源規格未確認');
      const inferred = ff.inferred || allowed.inferred;
      if (allowed.value.includes(ff.value)) return result('C9', 'pass', '', inferred);
      // SFX 系列比 ATX 小：裝進 ATX 電源位要轉接架；SFX-L 比 SFX 長，SFX 電源位不一定放得下
      if (ff.value.startsWith('SFX') && allowed.value.includes('ATX'))
        return result('C9', 'warn', `${ff.value} 電源裝入 ATX 電源位需要轉接架（部分電源有附）`, inferred);
      if (ff.value === 'SFX-L' && allowed.value.includes('SFX'))
        return result('C9', 'warn', 'SFX-L 比 SFX 長約 30 mm，請確認機殼的電源位放得下', inferred);
      return result('C9', 'fail', `機殼只能裝 ${allowed.value.join('／')} 電源，這是 ${ff.value}`, inferred);
    },
  },
  {
    id: 'C11', between: ['motherboard', 'case'], check: (m, c) => {
      if (!spec<boolean>(m, 'back_connect')?.value) return result('C11', 'pass');
      const ff = spec<string>(m, 'form_factor'), max = spec<string>(c, 'back_connect_max_form_factor');
      if (!ff || !max) return result('C11', 'unknown', '機殼是否支援背插主機板未確認');
      return RANK[ff.value] <= RANK[max.value]
        ? result('C11', 'pass')
        : result('C11', 'fail', '機殼不支援此板型的背插主機板');
    },
  },
];

/** 整機檢查涉及的類別（成對約束的類別寫在 PAIR_CONSTRAINTS.between）。 */
const BUILD_CHECK_CATEGORIES: Record<string, Category[]> = { C7: ['psu', 'cpu', 'gpu'], C10: ['cpu'], C12: ['cpu'] };

/** 某條約束是否涉及某類別：用於把檢查結果歸到各類別。 */
export function constraintInvolves(constraint: string, cat: Category): boolean {
  const pair = PAIR_CONSTRAINTS.find(c => c.id === constraint);
  return pair ? pair.between.includes(cat) : (BUILD_CHECK_CATEGORIES[constraint] ?? []).includes(cat);
}

export const recommendedWattage = (load: number) => Math.ceil((load * 1.25) / 50) * 50;

export interface Load {
  watts: number;
  /** 顯卡功耗是依晶片參考值推定的 */
  inferred: boolean;
}

/**
 * 估計整機滿載功耗。未選 CPU 或必要功耗欄位缺少時回傳 null（未知），不以預設值估算。
 * 未選顯卡、或顯卡是自帶電源的外接顯卡盒時，不計顯卡功耗。
 */
export function estimateLoad(sel: Selection): Load | null {
  if (!sel.cpu) return null;
  const cpuW = spec<number>(sel.cpu, 'max_power_w');
  if (!cpuW) return null;
  let gpuW = 0, inferred = cpuW.inferred;
  if (sel.gpu && !spec<boolean>(sel.gpu, 'external')?.value) {
    const g = spec<number>(sel.gpu, 'board_power_w');
    if (!g) return null;
    gpuW = g.value;
    inferred ||= g.inferred;
  }
  const pump = sel.cooler && spec<string>(sel.cooler, 'cooler_type')?.value === 'aio' ? 15 : 0;
  return { watts: cpuW.value + gpuW + 50 + pump, inferred };
}

/** 整機層級的檢查（功耗、缺少必要零件）。 */
export function buildChecks(sel: Selection): Check[] {
  const checks: Check[] = [];
  const { cpu, gpu, cooler, psu } = sel;
  if (cpu && !gpu && spec<boolean>(cpu, 'igpu')?.value === false)
    checks.push(result('C10', 'warn', '這顆 CPU 沒有內顯，需要搭配顯示卡才能輸出畫面'));
  if (cpu && !cooler && spec<boolean>(cpu, 'cooler_included')?.value === false)
    checks.push(result('C12', 'warn', '這顆 CPU 不附散熱器'));
  if (psu) {
    const load = estimateLoad(sel);
    const watt = spec<number>(psu, 'wattage');
    if (!cpu) checks.push(result('C7', 'unknown', '尚未選擇 CPU，無法估算電源瓦數'));
    else if (load === null || !watt) checks.push(result('C7', 'unknown', 'CPU 或顯卡功耗未確認，無法估算電源瓦數'));
    else if (watt.value < load.watts)
      checks.push(result('C7', 'fail', `額定 ${watt.value} W 低於估計滿載 ${load.watts} W`, load.inferred));
    else if (watt.value < recommendedWattage(load.watts))
      checks.push(result('C7', 'warn', `估計滿載 ${load.watts} W，建議至少 ${recommendedWattage(load.watts)} W`, load.inferred));
    else checks.push(result('C7', 'pass', '', load.inferred));
  }
  return checks;
}
