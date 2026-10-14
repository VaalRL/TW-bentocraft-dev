import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import { constraintInvolves, spec } from '../engine/constraints';
import { selectionChecks, worst } from '../engine/engine';
import type { Category, Model, Selection, Status } from '../engine/types';
import { layout } from './CaseSchematic';
import { CATEGORY_LABEL, STATUS_LABEL, modelName } from './format';
import {
  circlePoints, facing, faces, fan, grille, hatch, hatchV, onFace, projector,
  type Face, type Shape, type Solid, type V3, type View,
} from './isometric';

// 3D 分解圖：等角線稿風格的通用電腦，點零件開啟該類別的清單。
// 零件是長方體加上表面細節，依視角正投影成 SVG（不需 WebGL 或 3D 函式庫）。
// 尺寸沿用機殼示意圖的版面（layout）：已選零件依規格等比例，未選的用常見尺寸。顏色只取自相容性檢查。

const DEPTH = 230; // 機殼內部深度（主機板到側板），通用值
const BOARD_Z = -DEPTH / 2 + 20; // 主機板所在平面（離後側板留銅柱高度）
const DEFAULT_VIEW: View = { yaw: 38, pitch: -26 };

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

export interface Part {
  cat: Category;
  solids: Solid[];
  /** 分解時的位移（mm） */
  explode: V3;
}

/** 各零件的形狀與位置（純函式，方便測試） */
export function parts(sel: Selection): { width: number; height: number; list: Part[] } {
  const L = layout({ ...sel, case: sel.case ?? GENERIC_CASE });
  const W = L.width, H = L.height;
  const cx = (x: number) => x - W / 2;
  const cy = (y: number) => y - H / 2;
  const b = L.board;
  const sock: [number, number] = [b.w * 0.45 + 20, 70]; // 腳座在主機板上的位置
  const slotV = L.slotY - b.y;
  const list: Part[] = [];

  // 主機板：腳座、記憶體插槽、PCIe 插槽、晶片組、I/O 護蓋、螺絲孔
  const board: Shape[] = [
    { t: 'rect', u: sock[0] - 28, v: sock[1] - 28, w: 56, h: 56 },
    { t: 'rect', u: sock[0] - 22, v: sock[1] - 22, w: 44, h: 44 },
    { t: 'rect', u: sock[0] - 75, v: 12, w: 40, h: 22, fill: true },
    { t: 'rect', u: sock[0] - 30, v: 12, w: 70, h: 14, fill: true },
    { t: 'rect', u: b.w - 34, v: 10, w: 26, h: 110, fill: true },
    { t: 'rect', u: b.w * 0.5, v: Math.min(slotV + 45, b.h - 40), w: 30, h: 30, fill: true },
  ];
  for (let i = 0; i < 4; i++) board.push({ t: 'rect', u: sock[0] + 45 + i * 9, v: sock[1] - 62, w: 5, h: 133 });
  for (const dv of [0, 60]) if (slotV + dv < b.h - 12) board.push({ t: 'rect', u: b.w - 130, v: slotV + dv, w: 89, h: 6 });
  for (const [u, v] of [[8, 8], [b.w - 8, 8], [8, b.h - 8], [b.w - 8, b.h - 8], [sock[0], b.h - 8]] as [number, number][]) {
    board.push({ t: 'circle', u, v, r: 3.5 });
  }
  const bc: V3 = [cx(b.x + b.w / 2), cy(b.y + b.h / 2), BOARD_Z];
  list.push({ cat: 'motherboard', solids: [{ c: bc, size: [b.w, b.h, 4], deco: { f: board } }], explode: [0, 0, 90] });

  // 螺絲（分解時浮在主機板與機殼之間，屬於主機板）
  const screws: Solid[] = [[8, 8], [b.w - 8, 8], [8, b.h - 8], [b.w - 8, b.h - 8]].map(([u, v]) => ({
    c: [cx(b.x + u), cy(b.y + v), BOARD_Z - 8] as V3, size: [6, 6, 8] as V3,
    deco: { f: [{ t: 'line', u1: 1, v1: 3, u2: 5, v2: 3 }] as Shape[] },
  }));
  list.push({ cat: 'motherboard', solids: screws, explode: [0, 0, 45] });

  const sx = cx(b.x + sock[0]), sy = cy(b.y + sock[1]);
  list.push({
    cat: 'cpu',
    solids: [{ c: [sx, sy, BOARD_Z + 5], size: [40, 40, 6], deco: { f: [{ t: 'rect', u: 5, v: 5, w: 30, h: 30 }] } }],
    explode: [0, -10, 190],
  });

  const cooler = sel.cooler;
  if (cooler && spec<string>(cooler, 'cooler_type')?.value === 'aio') {
    const rad = spec<number>(cooler, 'radiator_mm')?.value ?? 240;
    const n = Math.max(1, Math.round(rad / 120));
    const fans: Shape[] = [];
    for (let i = 0; i < n; i++) fans.push(...fan(rad / n * (i + 0.5), 60, Math.min(rad / n, 120) / 2 - 4));
    list.push({
      cat: 'cooler',
      solids: [
        { c: [sx, sy, BOARD_Z + 26], size: [60, 60, 36], deco: { f: [{ t: 'circle', u: 30, v: 30, r: 24, fill: true }, { t: 'circle', u: 30, v: 30, r: 14 }] } },
        { c: [cx(L.rear - 20 - rad / 2), cy(16), 0], size: [rad, 27, 120], deco: { t: hatchV(0, rad, 0, 120, 6), f: hatchV(0, rad, 0, 27, 6), b: fans } },
      ],
      explode: [-30, -150, 330],
    });
  } else {
    // 塔散：鰭片平行主機板、沿 z 疊起；風扇裝在朝機殼前方的面
    const h = (cooler && spec<number>(cooler, 'height_mm')?.value) || 155;
    list.push({
      cat: 'cooler',
      solids: [{
        c: [sx, sy, BOARD_Z + 8 + h / 2], size: [70, 125, h],
        deco: {
          t: hatch(0, 70, 0, h, 4), r: hatchV(0, h, 0, 125, 4), b: hatch(0, 70, 0, h, 4),
          l: [...hatchV(0, h, 0, 125, 4), ...fan(h / 2, 62.5, Math.min(h, 125) / 2 - 4)],
          f: [{ t: 'rect', u: 4, v: 4, w: 62, h: 117 }, ...[20, 30, 40, 50].map(u => ({ t: 'circle', u, v: 62, r: 3 }) as Shape)],
        },
      }],
      explode: [-60, -90, 360],
    });
  }

  const modules = (sel.ram && spec<number>(sel.ram, 'modules')?.value) || 2;
  const sticks: Solid[] = [];
  for (let i = 0; i < Math.min(modules, 4); i++) {
    sticks.push({
      c: [cx(b.x + sock[0] + 47 + i * 9), cy(b.y + sock[1] + 4), BOARD_Z + 22], size: [5, 133, 34],
      deco: { l: [0, 1, 2, 3].map(k => ({ t: 'rect', u: 4, v: 8 + k * 31, w: 22, h: 24, fill: true }) as Shape) },
    });
  }
  list.push({ cat: 'ram', solids: sticks, explode: [70, -70, 230] });

  // 顯示卡：與主機板垂直；上面是背板，下面是風扇，朝側板的面有燈條，後端是擋板
  const g = L.gpuLen?.value ?? 280;
  const gfans: Shape[] = [];
  const nf = g > 240 ? 3 : 2;
  for (let i = 0; i < nf; i++) gfans.push(...fan((g / nf) * (i + 0.5), 60, Math.min(g / nf, 110) / 2 - 3));
  list.push({
    cat: 'gpu',
    solids: [{
      c: [cx(L.rear - g / 2), cy(L.slotY + 25), BOARD_Z + 66], size: [g, 50, 120],
      deco: {
        t: [{ t: 'rect', u: 6, v: 6, w: g - 12, h: 108 }, ...hatchV(g * 0.55, g - 12, 20, 100, 8)],
        f: [{ t: 'rect', u: 10, v: 16, w: g * 0.45, h: 8, fill: true }, { t: 'rect', u: g * 0.62, v: 6, w: 24, h: 10 }],
        b: gfans,
        r: [{ t: 'rect', u: 10, v: 8, w: 22, h: 10 }, { t: 'rect', u: 40, v: 8, w: 22, h: 10 }, { t: 'rect', u: 70, v: 8, w: 30, h: 10 }],
      },
    }],
    explode: [0, 70, 420],
  });

  list.push({
    cat: 'ssd',
    solids: [{
      c: [sx, cy(Math.min(L.slotY + 82, b.y + b.h - 16)), BOARD_Z + 4], size: [80, 22, 3],
      deco: { f: [{ t: 'rect', u: 6, v: 4, w: 22, h: 14, fill: true }, { t: 'rect', u: 34, v: 4, w: 22, h: 14, fill: true }, { t: 'rect', u: 72, v: 3, w: 6, h: 16 }] },
    }],
    explode: [0, 40, 160],
  });

  const p = L.psu;
  list.push({
    cat: 'psu',
    solids: [{
      c: [cx(p.x + p.w / 2), cy(p.y + p.h / 2), BOARD_Z + 75], size: [p.w, p.h, 150],
      deco: {
        t: grille(p.w / 2, 75, Math.min(p.w, 150) / 2 - 12),
        l: [...[0, 1, 2].flatMap(r => [0, 1, 2, 3].map(c => ({ t: 'rect', u: 20 + c * 28, v: 14 + r * 22, w: 20, h: 14 }) as Shape))],
        f: [{ t: 'rect', u: 10, v: 10, w: p.w - 20, h: p.h - 20 }],
        r: [...hatchV(0, 150, 8, p.h - 8, 6), { t: 'rect', u: 100, v: 12, w: 34, h: 24, fill: true }],
      },
    }],
    explode: [0, 170, 330],
  });

  return { width: W, height: H, list };
}

/** 機殼：後側板、後方擋板、底板（內面）與頂板、前板（外框） */
function caseSolid(W: number, H: number): Solid {
  // 後方擋板（r 面的 u 由側板量向主機板）：I/O 開孔、後置風扇、擴充槽
  const slots: Shape[] = [];
  for (let i = 0; i < 7; i++) slots.push({ t: 'rect', u: DEPTH - 50, v: H * 0.42 + i * 20, w: 30, h: 5 });
  return {
    c: [0, 0, 0], size: [W, H, DEPTH],
    deco: {
      r: [{ t: 'rect', u: DEPTH - 50, v: 26, w: 30, h: 120 }, ...slots, ...grille(DEPTH / 2 - 30, 90, 55)],
      l: hatch(40, DEPTH - 40, 30, H - 30, 14),
      t: hatchV(60, W - 60, 40, DEPTH - 40, 14),
    },
  };
}

type P2 = [number, number];

function Drawing({ solid, view, project, offset, cls, only }: {
  solid: Solid; view: View; project: (p: V3) => V3; offset: V3;
  cls?: string; only?: 'front' | 'back';
}) {
  const pt = (p: V3): P2 => {
    const q = project([p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]]);
    return [q[0], q[1]];
  };
  const str = (ps: P2[]) => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const out: ReactElement[] = [];
  for (const f of faces(solid)) {
    const front = facing(f, view);
    if (only === 'back' ? front : !front) continue;
    if (only === 'front' && f.id === 'f') continue; // 機殼側板拿掉，才看得到內部
    const [w, h] = [Math.hypot(...f.e1), Math.hypot(...f.e2)];
    out.push(<polygon key={f.id} className={`iso-face iso-${f.id} ${cls ?? ''}`} points={str([[0, 0], [w, 0], [w, h], [0, h]].map(([u, v]) => pt(onFace(f, u, v))))} />);
    (solid.deco?.[f.id] ?? []).forEach((s, i) => out.push(shape(f, s, `${f.id}${i}`)));
  }
  return <>{out}</>;

  function shape(f: Face, s: Shape, key: string) {
    const at = (u: number, v: number) => pt(onFace(f, u, v));
    if (s.t === 'line') {
      const [a, b] = [at(s.u1, s.v1), at(s.u2, s.v2)];
      return <line key={key} className="iso-deco" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
    }
    const ps = s.t === 'rect'
      ? [[s.u, s.v], [s.u + s.w, s.v], [s.u + s.w, s.v + s.h], [s.u, s.v + s.h]] as P2[]
      : circlePoints(s.u, s.v, s.r);
    return <polygon key={key} className={`iso-deco iso-${f.id} ${s.fill ? 'is-filled' : ''}`} points={str(ps.map(([u, v]) => at(u, v)))} />;
  }
}

export function ExplodedView({ selection, active, onSelect }: {
  selection: Selection;
  active: Category;
  onSelect: (c: Category) => void;
}) {
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [explodeTo, setExplodeTo] = useState(1);
  const [t, setT] = useState(1); // 分解程度 0～1（動畫用）
  const [hover, setHover] = useState<Category | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
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

  // 分解／組合動畫；偏好減少動態效果時直接切換
  useEffect(() => {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setT(explodeTo);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = t;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 350);
      setT(from + (explodeTo - from) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [explodeTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const { width, height, list } = parts(selection);
  const project = projector(view);
  const checks = selectionChecks(selection);
  const status = (cat: Category): Status | null =>
    selection[cat] ? worst(checks.filter(c => constraintInvolves(c.constraint, cat))) : null;
  const describe = (cat: Category) => {
    const m = selection[cat];
    const s = status(cat);
    return m ? `${CATEGORY_LABEL[cat]}：${modelName(m)}（${s === 'pass' ? '相容' : STATUS_LABEL[s!]}）` : `${CATEGORY_LABEL[cat]}：未選擇`;
  };

  const box = caseSolid(width, height);
  const zero: V3 = [0, 0, 0];
  const offset = (p: Part): V3 => [p.explode[0] * t, p.explode[1] * t, p.explode[2] * t];
  // 視窗：目前視角下所有頂點的外框
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [solid, off] of [[box, zero] as [Solid, V3], ...list.flatMap(p => p.solids.map(q => [q, offset(p)] as [Solid, V3]))]) {
    const [w, h, d] = solid.size;
    for (const dx of [-w / 2, w / 2]) for (const dy of [-h / 2, h / 2]) for (const dz of [-d / 2, d / 2]) {
      const q = project([solid.c[0] + dx + off[0], solid.c[1] + dy + off[1], solid.c[2] + dz + off[2]]);
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    }
  }
  const vb = `${(x0 - 12).toFixed(0)} ${(y0 - 12).toFixed(0)} ${(x1 - x0 + 24).toFixed(0)} ${(y1 - y0 + 24).toFixed(0)}`;
  // 由遠到近畫（畫家演算法）：以零件中心的深度排序
  const order = list
    .map((p, i) => ({ p, i, depth: project(add(p.solids[0].c, offset(p)))[2] }))
    .sort((a, b) => a.depth - b.depth);

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
    setView(v => ({ yaw: clamp(v.yaw - dx * 0.4, -10, 85), pitch: clamp(v.pitch - dy * 0.3, -60, 5) }));
    d.x = e.clientX;
    d.y = e.clientY;
  };
  const onPointerUp = () => {
    // 拖曳結束後的 click 不算點選零件
    setTimeout(() => { drag.current = null; }, 0);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const step: Record<string, [number, number]> = { ArrowLeft: [10, 0], ArrowRight: [-10, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] };
    const s = step[e.key];
    if (!s || e.target !== e.currentTarget) return;
    e.preventDefault();
    setView(v => ({ yaw: clamp(v.yaw + s[0], -10, 85), pitch: clamp(v.pitch + s[1], -60, 5) }));
  };
  const pick = (cat: Category) => {
    if (drag.current?.moved) return;
    onSelect(cat);
  };
  const partProps = (cat: Category) => {
    const s = status(cat);
    return {
      role: 'button',
      tabIndex: 0,
      'aria-label': `${describe(cat)}，點選開啟${CATEGORY_LABEL[cat]}清單`,
      className: `iso-part iso-${cat} ${s ? 'is-picked' : ''} ${active === cat ? 'is-active' : ''}`,
      style: { '--part': s ? COLOR[s] : 'var(--text-muted)' } as CSSProperties,
      onClick: () => pick(cat),
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(cat);
        }
      },
      onPointerEnter: () => setHover(cat), onPointerLeave: () => setHover(null),
      onFocus: () => setHover(cat), onBlur: () => setHover(null),
    };
  };

  // 同一類別的零件（例如水冷頭與冷排）合成一個按鈕；依最近的一塊排序
  const groups: { cat: Category; items: typeof order }[] = [];
  for (const o of order) {
    const g = groups.find(x => x.cat === o.p.cat && x === groups[groups.length - 1]);
    if (g) g.items.push(o);
    else groups.push({ cat: o.p.cat, items: [o] });
  }

  return (
    <figure className="x3d">
      <div className="x3d-toolbar">
        <span className="x3d-title">3D 分解圖</span>
        {open && <button type="button" className="link" onClick={() => setExplodeTo(v => (v ? 0 : 1))}>{explodeTo ? '組合' : '分解'}</button>}
        {open && <button type="button" className="link" onClick={() => setView(DEFAULT_VIEW)}>重設視角</button>}
        <button type="button" className="link" aria-expanded={open} onClick={toggle}>{open ? '收合' : '展開'}</button>
      </div>
      {open && <>
        <div className="x3d-stage" tabIndex={0} role="group"
          aria-label="3D 分解圖：點零件開啟對應清單；拖曳或用方向鍵旋轉"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}>
          <svg viewBox={vb} className="iso">
            {/* 機殼內面先畫，零件在中間，機殼外框最後 */}
            <g {...partProps('case')}>
              <Drawing solid={box} view={view} project={project} offset={zero} only="back" />
            </g>
            {t > 0.05 && list.map((p, i) => {
              const a = project(p.solids[0].c), z = project(add(p.solids[0].c, offset(p)));
              return <line key={i} className="iso-guide" x1={a[0]} y1={a[1]} x2={z[0]} y2={z[1]} />;
            })}
            {groups.map(({ cat, items }, gi) => (
              <g key={`${cat}-${gi}`} {...partProps(cat)}>
                {items.flatMap(({ p, i }) => p.solids.map((s, k) => (
                  <Drawing key={`${i}-${k}`} solid={s} view={view} project={project} offset={offset(p)} />
                )))}
              </g>
            ))}
            <g className="iso-shell" aria-hidden="true">
              <Drawing solid={box} view={view} project={project} offset={zero} only="front" cls="is-outline" />
            </g>
          </svg>
        </div>
        <figcaption className="x3d-caption" aria-live="polite">
          {hover ? describe(hover) : '點零件開啟對應清單；拖曳可旋轉。外形為通用模型，已選零件依規格尺寸等比例。'}
        </figcaption>
      </>}
    </figure>
  );
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
