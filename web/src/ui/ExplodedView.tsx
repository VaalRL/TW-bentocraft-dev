import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { constraintInvolves, spec } from '../engine/constraints';
import { selectionChecks, worst } from '../engine/engine';
import type { Category, Model, Selection, Status } from '../engine/types';
import { layout } from './CaseSchematic';
import { CATEGORY_LABEL, STATUS_LABEL, modelName } from './format';

// 3D 分解圖：通用外形的電腦零件，點零件開啟該類別的清單。
// 以 CSS 3D transform 繪製（不需 WebGL 或 3D 函式庫）；零件是一般的 <button>，鍵盤與螢幕閱讀器都能操作。
// 尺寸沿用機殼示意圖的版面（layout）：已選零件依規格等比例，未選的用常見尺寸。顏色只取自相容性檢查。
// 座標單位 mm：x 由機殼前方往後方、y 由上往下、z 由主機板往側板（朝向觀看者）。

const DEPTH = 230; // 機殼內部深度（主機板到側板），通用值
const BOARD_Z = -DEPTH / 2 + 20; // 主機板所在平面（離後側板留銅柱高度）

const COLOR: Record<Status, string> = {
  pass: 'var(--status-ok)',
  warn: 'var(--status-warn)',
  fail: 'var(--status-error)',
  unknown: 'var(--status-unknown)',
};

/** 沒選機殼時的通用 ATX 機殼 */
const GENERIC_CASE: Model = {
  id: 'case:generic', c: 'case', b: '', n: '', r: 'a',
  s: { max_mb_form_factor: 'ATX', gpu_clearance_mm: 360, psu_form_factors: ['ATX'] },
};

interface Part {
  cat: Category;
  /** 中心點與尺寸（mm） */
  c: [number, number, number];
  size: [number, number, number];
  /** 分解時往側板方向（z）與往下（y）移動的距離 */
  explode: [number, number];
}

/** 各零件的位置（純函式，方便測試） */
export function parts(sel: Selection): { width: number; height: number; list: Part[] } {
  const L = layout({ ...sel, case: sel.case ?? GENERIC_CASE });
  const cx = (x: number) => x - L.width / 2;
  const cy = (y: number) => y - L.height / 2;
  const b = L.board;
  const socket: [number, number] = [b.x + b.w * 0.45 + 20, b.y + 70];
  const list: Part[] = [
    { cat: 'motherboard', c: [cx(b.x + b.w / 2), cy(b.y + b.h / 2), BOARD_Z], size: [b.w, b.h, 4], explode: [40, 0] },
    { cat: 'cpu', c: [cx(socket[0]), cy(socket[1]), BOARD_Z + 5], size: [40, 40, 6], explode: [110, 0] },
  ];

  const cooler = sel.cooler;
  const aio = cooler && spec<string>(cooler, 'cooler_type')?.value === 'aio';
  if (aio) {
    const rad = spec<number>(cooler, 'radiator_mm')?.value ?? 240;
    // 水冷頭在 CPU 上，冷排畫在機殼頂部
    list.push({ cat: 'cooler', c: [cx(socket[0]), cy(socket[1]), BOARD_Z + 30], size: [60, 60, 40], explode: [190, 0] });
    list.push({ cat: 'cooler', c: [cx(L.rear - 20 - rad / 2), cy(14), 0], size: [rad, 27, 120], explode: [190, -60] });
  } else {
    const h = (cooler && spec<number>(cooler, 'height_mm')?.value) || 155;
    list.push({ cat: 'cooler', c: [cx(socket[0]), cy(socket[1]), BOARD_Z + 8 + h / 2], size: [70, 125, h], explode: [190, 0] });
  }

  const modules = (sel.ram && spec<number>(sel.ram, 'modules')?.value) || 2;
  for (let i = 0; i < Math.min(modules, 4); i++) {
    list.push({ cat: 'ram', c: [cx(socket[0] + 70 + i * 10), cy(socket[1] + 5), BOARD_Z + 20], size: [7, 133, 35], explode: [140, 0] });
  }

  const gpuLen = L.gpuLen?.value ?? 280;
  list.push({ cat: 'gpu', c: [cx(L.rear - gpuLen / 2), cy(L.slotY + 25), BOARD_Z + 65], size: [gpuLen, 50, 120], explode: [300, 0] });
  list.push({ cat: 'ssd', c: [cx(socket[0]), cy(Math.min(L.slotY + 75, b.y + b.h - 15)), BOARD_Z + 4], size: [80, 22, 3], explode: [80, 0] });
  const p = L.psu;
  list.push({ cat: 'psu', c: [cx(p.x + p.w / 2), cy(p.y + p.h / 2), BOARD_Z + 75], size: [p.w, p.h, 150], explode: [260, 0] });
  return { width: L.width, height: L.height, list };
}

function Faces({ w, h, d, omitFront = false, label }: { w: number; h: number; d: number; omitFront?: boolean; label?: string }) {
  const face = (cls: string, style: CSSProperties) => <span className={`x3d-face ${cls}`} style={style} />;
  return (
    <>
      {!omitFront && (
        <span className="x3d-face f" style={{ width: w, height: h, transform: `translateZ(${d / 2}px)` }}>
          {label && w >= 34 && h >= 14 && <span className="x3d-label">{label}</span>}
        </span>
      )}
      {face('k', { width: w, height: h, transform: `rotateY(180deg) translateZ(${d / 2}px)` })}
      {face('r', { width: d, height: h, left: (w - d) / 2, transform: `rotateY(90deg) translateZ(${w / 2}px)` })}
      {face('l', { width: d, height: h, left: (w - d) / 2, transform: `rotateY(-90deg) translateZ(${w / 2}px)` })}
      {face('t', { width: w, height: d, top: (h - d) / 2, transform: `rotateX(90deg) translateZ(${h / 2}px)` })}
      {face('b', { width: w, height: d, top: (h - d) / 2, transform: `rotateX(-90deg) translateZ(${h / 2}px)` })}
    </>
  );
}

export function ExplodedView({ selection, active, onSelect }: {
  selection: Selection;
  active: Category;
  onSelect: (c: Category) => void;
}) {
  const [yaw, setYaw] = useState(-42);
  const [pitch, setPitch] = useState(-16);
  const [exploded, setExploded] = useState(true);
  const [hover, setHover] = useState<Category | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(320);
  // 收合狀態記在瀏覽器（無痕模式可能丟例外）；手機預設收合，避免把清單推到下面
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('x3d-open');
      if (saved) return saved === '1';
    } catch { /* 忽略 */ }
    return typeof matchMedia === 'undefined' || !matchMedia('(max-width: 700px)').matches;
  });
  const toggle = () => setOpen(v => {
    try { localStorage.setItem('x3d-open', v ? '0' : '1'); } catch { /* 忽略 */ }
    return !v;
  });

  // 依容器寬度縮放
  useEffect(() => {
    const el = box.current;
    if (!open) return;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setFit(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const { width, height, list } = parts(selection);
  const scale = Math.min(fit / (width + DEPTH + 420), 330 / (height + 170));
  const checks = selectionChecks(selection);
  const status = (cat: Category): Status | null =>
    selection[cat] ? worst(checks.filter(c => constraintInvolves(c.constraint, cat))) : null;
  const describe = (cat: Category) => {
    const m = selection[cat];
    const s = status(cat);
    return m ? `${CATEGORY_LABEL[cat]}：${modelName(m)}（${s === 'pass' ? '相容' : STATUS_LABEL[s!]}）` : `${CATEGORY_LABEL[cat]}：未選擇`;
  };

  const onPointerDown = (e: PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    d.moved = true;
    setYaw(v => Math.max(-80, Math.min(80, v + dx * 0.4)));
    setPitch(v => Math.max(-45, Math.min(20, v - dy * 0.3)));
    d.x = e.clientX;
    d.y = e.clientY;
  };
  const onPointerUp = () => {
    // 拖曳結束後的 click 不算點選零件
    setTimeout(() => { drag.current = null; }, 0);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step: Record<string, [number, number]> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] };
    const s = step[e.key];
    if (!s || e.target !== e.currentTarget) return;
    e.preventDefault();
    setYaw(v => Math.max(-80, Math.min(80, v + s[0])));
    setPitch(v => Math.max(-45, Math.min(20, v + s[1])));
  };
  const pick = (cat: Category) => {
    if (drag.current?.moved) return;
    onSelect(cat);
  };

  const partButton = (p: Part, key: string) => {
    const [w, h, d] = p.size.map(v => v * scale);
    const [x, y, z] = p.c.map(v => v * scale);
    const [ez, ey] = exploded ? p.explode.map(v => v * scale) : [0, 0];
    const s = status(p.cat);
    const style = {
      width: w, height: h,
      transform: `translate3d(${x - w / 2}px, ${y - h / 2 + ey}px, ${z + ez}px)`,
      '--part': s ? COLOR[s] : 'var(--x3d-empty)',
    } as CSSProperties;
    return (
      <button key={key} type="button"
        className={`x3d-part x3d-${p.cat} ${s ? 'is-picked' : ''} ${active === p.cat ? 'is-active' : ''}`}
        style={style} aria-label={`${describe(p.cat)}，點選開啟${CATEGORY_LABEL[p.cat]}清單`}
        onClick={() => pick(p.cat)}
        onPointerEnter={() => setHover(p.cat)} onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(p.cat)} onBlur={() => setHover(null)}>
        <Faces w={w} h={h} d={d} label={CATEGORY_LABEL[p.cat]} />
      </button>
    );
  };

  const caseW = width * scale, caseH = height * scale, caseD = DEPTH * scale;
  const caseStatus = status('case');
  return (
    <figure className="x3d">
      <div className="x3d-toolbar">
        <span className="x3d-title">3D 分解圖</span>
        {open && <button type="button" className="link" onClick={() => setExploded(v => !v)}>{exploded ? '組合' : '分解'}</button>}
        {open && <button type="button" className="link" onClick={() => { setYaw(-42); setPitch(-16); }}>重設視角</button>}
        <button type="button" className="link" aria-expanded={open} onClick={toggle}>{open ? '收合' : '展開'}</button>
      </div>
      {open && <>
      <div ref={box} className="x3d-stage" tabIndex={0} role="group" style={{ height: Math.round((height + 170) * scale) + 30 }}
        aria-label="3D 分解圖：點零件開啟對應清單；拖曳或用方向鍵旋轉"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}>
        <div className="x3d-scene" style={{ transform: `rotateX(${pitch}deg) rotateY(${yaw}deg)` }}>
          <button type="button"
            className={`x3d-part x3d-case ${caseStatus ? 'is-picked' : ''} ${active === 'case' ? 'is-active' : ''}`}
            style={{
              width: caseW, height: caseH,
              transform: `translate3d(${-caseW / 2}px, ${-caseH / 2}px, 0)`,
              '--part': caseStatus ? COLOR[caseStatus] : 'var(--x3d-empty)',
            } as CSSProperties}
            aria-label={`${describe('case')}，點選開啟機殼清單`}
            onClick={() => pick('case')}
            onPointerEnter={() => setHover('case')} onPointerLeave={() => setHover(null)}
            onFocus={() => setHover('case')} onBlur={() => setHover(null)}>
            <Faces w={caseW} h={caseH} d={caseD} omitFront />
          </button>
          {list.map((p, i) => partButton(p, `${p.cat}-${i}`))}
        </div>
      </div>
      <figcaption className="x3d-caption" aria-live="polite">
        {hover ? describe(hover) : '點零件開啟對應清單；拖曳可旋轉。外形為通用模型，已選零件依規格尺寸等比例。'}
      </figcaption>
      </>}
    </figure>
  );
}
