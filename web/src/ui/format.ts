import { spec } from '../engine/constraints';
import type { Category, Check, Model, Status } from '../engine/types';

export const CATEGORY_LABEL: Record<Category, string> = {
  cpu: '處理器',
  motherboard: '主機板',
  ram: '記憶體',
  gpu: '顯示卡',
  cooler: '散熱器',
  case: '機殼',
  psu: '電源',
  ssd: '固態硬碟',
};

export const STATUS_LABEL: Record<Status, string> = {
  pass: '相容',
  warn: '注意',
  fail: '不相容',
  unknown: '未確認',
};

export const formatPrice = (n: number) => `$${n.toLocaleString('zh-TW')}`;

export const modelName = (m: Model) => (m.b === 'unknown' ? m.n : `${m.b} ${m.n}`);

const RADIATOR_POSITION: Record<string, string> = { front: '前', top: '頂', side: '側', rear: '後', bottom: '底' };

/** 數值欄位的顯示：有誤差時加「約」，推定值加「(推定)」。 */
function val(m: Model, field: string, unit = '', fmt: (v: never) => string = v => String(v)): string | null {
  const s = spec<never>(m, field);
  if (!s) return null;
  const text = `${s.tolerance ? '約 ' : ''}${fmt(s.value)}${unit}`;
  return s.inferred ? `${text}（推定）` : text;
}

/** 候選清單每列下方的規格摘要。缺少的欄位不顯示，不補預設值。 */
export function specSummary(m: Model): string {
  const parts: (string | null)[] = [];
  switch (m.c) {
    case 'cpu':
      parts.push(val(m, 'socket'));
      if (spec<boolean>(m, 'igpu')) parts.push(m.s.igpu ? '有內顯' : '無內顯');
      if (spec<boolean>(m, 'cooler_included')) parts.push(m.s.cooler_included ? '附散熱器' : '不附散熱器');
      parts.push(val(m, 'tdp_w', ' W'));
      break;
    case 'motherboard':
      parts.push(val(m, 'socket'), val(m, 'chipset'), val(m, 'memory_type'), val(m, 'form_factor'));
      if (m.s.back_connect) parts.push('背插');
      break;
    case 'ram':
      parts.push(val(m, 'memory_type'), val(m, 'capacity_gb', ' GB'), val(m, 'modules', ' 條'), val(m, 'speed_mts', ' MT/s'));
      break;
    case 'gpu':
      if (m.s.external) parts.push('外接式');
      parts.push(val(m, 'length_mm', ' mm'));
      if (m.s.low_profile) parts.push('半高');
      break;
    case 'cooler':
      parts.push(val(m, 'cooler_type', '', (v: string) => (v === 'aio' ? '一體式水冷' : '風冷')));
      parts.push(val(m, 'height_mm', ' mm 高'), val(m, 'radiator_mm', ' mm 冷排'));
      break;
    case 'case':
      parts.push(val(m, 'max_mb_form_factor', ' 以下'));
      parts.push(val(m, 'gpu_clearance_mm', ' mm', v => `顯卡 ≤ ${v}`));
      parts.push(val(m, 'cooler_clearance_mm', ' mm', v => `散熱器 ≤ ${v}`));
      parts.push(val(m, 'psu_form_factors', ' 電源', (v: string[]) => v.join('／')));
      parts.push(val(m, 'radiator_support', '', (v: { position: string; sizes: number[] }[]) =>
        v.length ? `冷排 ${v.map(p => `${RADIATOR_POSITION[p.position] ?? p.position} ${Math.max(...p.sizes)}`).join('／')}` : '不支援冷排'));
      break;
    case 'psu':
      parts.push(val(m, 'wattage', ' W'), val(m, 'form_factor'), val(m, 'efficiency', '', (v: string) => EFFICIENCY[v] ?? v));
      break;
    case 'ssd':
      parts.push(val(m, 'interface', '', (v: string) => INTERFACE[v] ?? v), val(m, 'form_factor'), val(m, 'capacity_gb', ' GB'));
      break;
  }
  return parts.filter(Boolean).join(' · ');
}

const EFFICIENCY: Record<string, string> = {
  white: '白牌', bronze: '銅牌', silver: '銀牌', gold: '金牌', platinum: '白金', titanium: '鈦金',
};
const INTERFACE: Record<string, string> = { sata: 'SATA', pcie3: 'PCIe 3.0', pcie4: 'PCIe 4.0', pcie5: 'PCIe 5.0' };

/** 檢查結果的文字：依賴推定值的結果註明「推定」。 */
export const checkText = (c: Check) => (c.inferred ? `${c.message}（依推定規格）` : c.message);

export function formatDate(iso: string | null): string {
  if (!iso) return '尚無資料';
  return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, dateStyle: 'medium', timeStyle: 'short' });
}

export function daysSince(iso: string | null): number | null {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}
