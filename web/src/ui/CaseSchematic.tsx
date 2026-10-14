import { CONDITION_LABEL, spec } from '../engine/constraints';
import type { Check, Model, Selection, Status } from '../engine/types';
import { STATUS_LABEL } from './format';

// 機殼側視示意圖：機殼外形是通用模型（規格庫沒有機殼外部尺寸與內部配置），
// 主機板、顯卡、電源、冷排依規格尺寸等比例畫在裡面。
// 放不放得下一律採用約束引擎的結果（C3 板型、C4 顯卡長度、C5 冷排、C9 電源），圖不自行判斷。
// 座標單位是毫米；從左側板看進去：左邊是機殼前方，右邊是後方（I/O 擋板）。

/** 主機板尺寸（寬 × 高，mm）：ATX 系列規範 */
const BOARD: Record<string, [number, number]> = {
  'Mini-ITX': [170, 170],
  'M-ATX': [244, 244],
  ATX: [244, 305],
  'E-ATX': [277, 330],
};
/** 電源側視尺寸（長 × 高，mm）：ATX 長度依各款而異，取常見的 150 mm */
const PSU: Record<string, [number, number]> = { ATX: [150, 86], SFX: [100, 63.5], 'SFX-L': [130, 63.5] };
const RAD_THICK = 27; // 冷排厚度（常見值，僅供示意）
const WALL = 20; // 主機板與機殼後方、上方的間距
const PSU_GAP = 24; // 主機板與電源艙之間

const COLOR: Record<Status, string> = {
  pass: 'var(--status-ok)',
  warn: 'var(--status-warn)',
  fail: 'var(--status-error)',
  unknown: 'var(--status-unknown)',
};

interface Box { x: number; y: number; w: number; h: number }

const statusOf = (checks: Check[], id: string, picked: unknown): Status | null =>
  picked ? (checks.find(c => c.constraint === id)?.status ?? 'unknown') : null;

/** 依已選零件與機殼規格算出各零件位置（純函式，方便測試） */
export function layout(sel: Selection) {
  const c = sel.case as Model;
  const boardFF = (sel.motherboard && spec<string>(sel.motherboard, 'form_factor')?.value)
    || spec<string>(c, 'max_mb_form_factor')?.value || 'ATX';
  const [bw, bh] = BOARD[boardFF] ?? BOARD.ATX;
  const psuFF = (sel.psu && spec<string>(sel.psu, 'form_factor')?.value)
    || spec<string[]>(c, 'psu_form_factors')?.value[0] || 'ATX';
  const [pw, ph] = PSU[psuFF] ?? PSU.ATX;
  const gpuLimit = spec<number>(c, 'gpu_clearance_mm');
  const gpuLen = sel.gpu && !spec<boolean>(sel.gpu, 'external')?.value ? spec<number>(sel.gpu, 'length_mm') : undefined;

  // 機殼內部寬度：顯卡限長（從後方 I/O 擋板量起）與主機板加前方空間取大者
  const width = Math.max(gpuLimit?.value ?? 0, bw + 90, gpuLen ? gpuLen.value + gpuLen.tolerance : 0) + WALL;
  const height = WALL + bh + PSU_GAP + ph + WALL;
  const rear = width; // 後方 I/O 擋板的 x
  const board: Box = { x: rear - WALL - bw, y: WALL, w: bw, h: bh };
  // 第一條 PCIe x16 約在主機板上緣往下 ATX 規範的第二個槽位（約 board 高度的 45%）
  const slotY = board.y + Math.min(bh * 0.45, bh - 40);
  const gpu: Box | null = gpuLen ? { x: rear - gpuLen.value, y: slotY, w: gpuLen.value, h: 40 } : null;
  const psu: Box = { x: rear - WALL - pw, y: height - WALL - ph, w: pw, h: ph };
  return { boardFF, psuFF, width, height, rear, board, gpu, gpuLen, gpuLimit, psu, slotY };
}

/** 機殼可裝冷排的位置（側視只畫得出前、上、後、下） */
function radiatorSlots(c: Model, L: ReturnType<typeof layout>) {
  const support = spec<{ position: string; sizes: number[] }[]>(c, 'radiator_support')?.value ?? [];
  const out: { position: string; size: number; box: Box }[] = [];
  for (const p of support) {
    const size = Math.max(...p.sizes);
    if (p.position === 'front') out.push({ position: p.position, size, box: { x: 4, y: WALL, w: RAD_THICK, h: Math.min(size, L.height - WALL * 2) } });
    if (p.position === 'top') out.push({ position: p.position, size, box: { x: Math.max(L.rear - WALL - size, 4), y: 2, w: Math.min(size, L.width - 8), h: RAD_THICK * 0.6 } });
    if (p.position === 'rear') out.push({ position: p.position, size, box: { x: L.rear - RAD_THICK * 0.6 - 2, y: WALL + 10, w: RAD_THICK * 0.6, h: size } });
    if (p.position === 'bottom') out.push({ position: p.position, size, box: { x: 4, y: L.height - RAD_THICK * 0.6 - 2, w: Math.min(size, L.width - L.psu.w - 30), h: RAD_THICK * 0.6 } });
  }
  return out;
}

const POSITION_LABEL: Record<string, string> = { front: '前', top: '頂', rear: '後', bottom: '底', side: '側' };

export function CaseSchematic({ selection, checks }: { selection: Selection; checks: Check[] }) {
  const c = selection.case;
  if (!c) return null;
  const L = layout(selection);
  const pad = 14;
  const vbW = L.width + pad * 2, vbH = L.height + pad * 2 + 14;

  const boardStatus = statusOf(checks, 'C3', selection.motherboard);
  const gpuStatus = statusOf(checks, 'C4', selection.gpu);
  const psuStatus = statusOf(checks, 'C9', selection.psu);
  const cooler = selection.cooler;
  const aio = cooler && spec<string>(cooler, 'cooler_type')?.value === 'aio' ? cooler : undefined;
  const radSize = aio ? spec<number>(aio, 'radiator_mm')?.value : undefined;
  const radStatus = statusOf(checks, 'C5', aio);
  const slots = radiatorSlots(c, L);
  // 選了一體式水冷：畫在第一個列出該尺寸的冷排位；沒有就不畫（C5 會說明原因）
  const radSlot = radSize ? slots.find(s => (spec<{ position: string; sizes: number[] }[]>(c, 'radiator_support')?.value ?? [])
    .some(p => p.position === s.position && p.sizes.includes(radSize))) : undefined;
  const sideOnly = (spec<{ position: string }[]>(c, 'radiator_support')?.value ?? []).filter(p => p.position === 'side');

  // 用 style 而非 fill 屬性：CSS 類別的 fill 會蓋過 SVG 屬性
  const fill = (s: Status | null) => (s ? { fill: COLOR[s] } : undefined);
  const cls = (s: Status | null) => (s ? 'schem-part is-picked' : 'schem-part');
  const label = [
    `機殼側視示意圖（通用外形）`,
    `主機板 ${L.boardFF}${boardStatus ? `：${STATUS_LABEL[boardStatus]}` : ''}`,
    L.gpuLimit && `顯卡限長 ${L.gpuLimit.value} mm${L.gpuLen ? `，顯卡 ${L.gpuLen.value} mm：${STATUS_LABEL[gpuStatus!]}` : ''}`,
    `電源 ${L.psuFF}${psuStatus ? `：${STATUS_LABEL[psuStatus]}` : ''}`,
    radSize && `${radSize} mm 冷排${radStatus ? `：${STATUS_LABEL[radStatus]}` : ''}`,
  ].filter(Boolean).join('；');

  return (
    <figure className="schem">
      <svg viewBox={`${-pad} ${-pad} ${vbW} ${vbH}`} role="img" aria-label={label}>
        {/* 機殼（通用外形） */}
        <rect x={0} y={0} width={L.width} height={L.height} rx={6} className="schem-case" />
        <line x1={0} x2={L.width} y1={L.psu.y - 8} y2={L.psu.y - 8} className="schem-shroud" />
        <text x={6} y={L.height + 13} className="schem-tick">前</text>
        <text x={L.width - 6} y={L.height + 13} textAnchor="end" className="schem-tick">後（I/O）</text>

        {/* 可裝冷排的位置 */}
        {slots.map(s => (
          <g key={s.position}>
            <rect {...xywh(s.box)} rx={2} className="schem-slot" />
            <title>{`${POSITION_LABEL[s.position]}置冷排位：最大 ${s.size} mm`}</title>
          </g>
        ))}
        {radSlot && radStatus && (
          <g>
            <rect {...xywh(radSlot.box)} rx={2} style={fill(radStatus)} className="schem-part is-picked" />
            <title>{`${radSize} mm 冷排（${POSITION_LABEL[radSlot.position]}置）`}</title>
          </g>
        )}

        {/* 主機板 */}
        <rect {...xywh(L.board)} rx={3} style={fill(boardStatus)} className={`${cls(boardStatus)} schem-board`} />
        <text x={L.board.x + 8} y={L.board.y + 16} className="schem-label">{L.boardFF}</text>
        {/* CPU 與散熱器位置 */}
        <rect x={L.board.x + L.board.w * 0.45} y={L.board.y + 50} width={40} height={40} rx={3} className="schem-socket" />

        {/* 顯卡限長與條件式上限 */}
        {L.gpuLimit && (
          <g>
            {L.gpuLimit.conditions.map(([v, when]) => (
              <g key={`${v}-${when}`}>
                <line x1={L.rear - v} x2={L.rear - v} y1={L.slotY - 14} y2={L.slotY + 54} className="schem-condition" />
                <title>{`${CONDITION_LABEL[when] ?? when}顯卡上限 ${v} mm`}</title>
              </g>
            ))}
            <line x1={L.rear - L.gpuLimit.value} x2={L.rear - L.gpuLimit.value} y1={L.slotY - 18} y2={L.slotY + 58} className="schem-limit" />
            <text x={L.rear - L.gpuLimit.value + 4} y={L.slotY - 8} className="schem-tick">顯卡限長 {L.gpuLimit.value}</text>
          </g>
        )}
        {L.gpu && gpuStatus && (
          <g>
            <rect {...xywh(L.gpu)} rx={4} style={fill(gpuStatus)} className="schem-part is-picked" />
            {L.gpuLen!.tolerance > 0 && (
              <rect x={L.rear - L.gpuLen!.value - L.gpuLen!.tolerance} y={L.gpu.y + 8} width={L.gpuLen!.tolerance * 2} height={L.gpu.h - 16}
                className="schem-tolerance" />
            )}
            <text x={L.gpu.x + 8} y={L.gpu.y + 25} className="schem-label on-part">顯卡 {L.gpuLen!.value} mm</text>
          </g>
        )}

        {/* 電源 */}
        <rect {...xywh(L.psu)} rx={3} style={fill(psuStatus)} className={cls(psuStatus)} />
        <text x={L.psu.x + 6} y={L.psu.y + L.psu.h / 2 + 4} className={`schem-label ${psuStatus ? 'on-part' : ''}`}>{L.psuFF} 電源</text>
      </svg>
      <figcaption className="muted small">
        示意圖：機殼外形為通用模型，主機板、顯卡、電源與冷排依規格尺寸等比例繪製；顏色取自相容性檢查。
        {sideOnly.length > 0 && '側面冷排位在此視角看不到。'}
      </figcaption>
    </figure>
  );
}

const xywh = (b: Box) => ({ x: b.x, y: b.y, width: b.w, height: b.h });
