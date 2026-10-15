import { useMemo } from 'react';
import type { Model } from '../engine/types';
import { Drawing } from './ExplodedView';
import { fan, hatch, hatchV, projector, type Shape, type Solid, type V3, type View } from './isometric';

// 機殼示意縮圖：依規格（可裝主機板、顯卡長度與散熱器高度上限、冷排位置）畫等角線稿。
// 規格庫沒有機殼外觀尺寸，外型由內部空間推估，只用來比較大小與配置，不是實品外觀。
// 所有縮圖用同一比例，小機殼看起來就比較小。

const VIEW: View = { yaw: 38, pitch: -26 };
const project = projector(VIEW);

/** 主機板尺寸（mm，寬 × 高）與機殼高度的推估值 */
const BOARD: Record<string, { w: number; h: number; caseH: number }> = {
  'E-ATX': { w: 330, h: 305, caseH: 500 },
  ATX: { w: 244, h: 305, caseH: 460 },
  'M-ATX': { w: 244, h: 244, caseH: 400 },
  'Mini-ITX': { w: 170, h: 170, caseH: 330 },
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MAX: V3 = [600, 500, 280];

/** 由規格推估的外型（x：前到後、y：高、z：寬） */
export function caseShape(m: Model): { size: V3; board: { w: number; h: number }; sfx: boolean; front: number; top: boolean } {
  const s = m.s;
  const board = BOARD[s.max_mb_form_factor as string] ?? BOARD.ATX;
  const gpu = typeof s.gpu_clearance_mm === 'number' ? s.gpu_clearance_mm : 380;
  const cooler = typeof s.cooler_clearance_mm === 'number' ? s.cooler_clearance_mm : 160;
  const psus = Array.isArray(s.psu_form_factors) ? (s.psu_form_factors as string[]) : ['ATX'];
  const sfx = !psus.includes('ATX');
  const radiators = Array.isArray(s.radiator_support) ? (s.radiator_support as { position: string; sizes: number[] }[]) : [];
  const largest = (pos: string) => Math.max(0, ...radiators.filter(r => r.position === pos).flatMap(r => r.sizes));
  const depth = clamp(Math.max(gpu + 70, board.w + 120), 260, MAX[0]);
  const height = clamp(board.caseH - (sfx ? 40 : 0), 300, MAX[1]);
  const width = clamp(cooler + 60, 110, MAX[2]);
  return { size: [depth, height, width], board, sfx, front: largest('front'), top: largest('top') >= 240 };
}

function solid(m: Model): Solid {
  const { size: [d, h, w], board, sfx, front, top } = caseShape(m);
  // 側板（f：u 由前到後、v 由上到下）：玻璃側透外框、主機板位置、電源倉
  const side: Shape[] = [
    { t: 'rect', u: 14, v: 14, w: d - 28, h: h - 28 },
    { t: 'rect', u: d - 26 - board.w * 0.9, v: 26, w: board.w * 0.9, h: board.h * 0.9, fill: true },
  ];
  if (!sfx && h - 26 - board.h * 0.9 > 110) side.push({ t: 'line', u1: 14, v1: h - 95, u2: d - 14, v2: h - 95 });
  // 前板（l：u 由左到右、v 由上到下）：可裝前置冷排時畫風扇，否則畫進風孔
  const fans = front >= 240 && w >= 140 ? Math.min(3, Math.floor(front / 120), Math.floor((h - 40) / 130)) : 0;
  const frontPanel: Shape[] = fans
    ? Array.from({ length: fans }, (_, i) => fan(w / 2, 30 + 60 + i * 128, Math.min(56, w / 2 - 12))).flat()
    : hatch(20, w - 20, 30, h - 30, 18);
  return {
    c: [0, -h / 2, 0],
    size: [d, h, w],
    deco: { f: side, l: frontPanel, t: top ? hatchV(40, d - 40, 20, w - 20, 16) : [] },
  };
}

/** 固定的畫面範圍：最大的機殼剛好放得下，底部對齊 */
const VIEWBOX = (() => {
  const [d, h, w] = MAX;
  const pts: V3[] = [];
  for (const x of [-d / 2, d / 2]) for (const y of [-h, 0]) for (const z of [-w / 2, w / 2]) pts.push(project([x, y, z]));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const pad = 12;
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + pad * 2, Math.max(...ys) - Math.min(...ys) + pad * 2].map(v => v.toFixed(1)).join(' ');
})();

export function CaseThumb({ model }: { model: Model }) {
  const s = useMemo(() => solid(model), [model]);
  return (
    <svg className="case-thumb" viewBox={VIEWBOX} aria-hidden="true" focusable="false">
      <Drawing solid={s} view={VIEW} project={project} offset={[0, 0, 0]} />
    </svg>
  );
}
