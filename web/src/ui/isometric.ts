// 等角線稿的幾何：零件以長方體加上表面細節（矩形、圓、線）描述，再依視角正投影到平面。
// 座標單位 mm：x 由機殼前方往後方、y 由上往下、z 由主機板往側板（朝向觀看者）。

export type V3 = [number, number, number];
export type FaceId = 'f' | 'k' | 'r' | 'l' | 't' | 'b';

/** 表面細節；u、v 是在該面上的 mm 座標（由面的原點沿兩條邊量起） */
export type Shape =
  | { t: 'rect'; u: number; v: number; w: number; h: number; fill?: boolean }
  | { t: 'circle'; u: number; v: number; r: number; fill?: boolean }
  | { t: 'line'; u1: number; v1: number; u2: number; v2: number };

export interface Solid {
  c: V3; // 中心
  size: V3; // 長寬高（x、y、z）
  deco?: Partial<Record<FaceId, Shape[]>>;
}

export interface Face {
  id: FaceId;
  origin: V3;
  e1: V3; // u 方向的整條邊
  e2: V3; // v 方向的整條邊
  normal: V3;
}

/** 長方體的六個面；u、v 的方向讓每個面從外面看都是「左到右、上到下」 */
export function faces({ c, size }: Solid): Face[] {
  const [w, h, d] = size;
  const x0 = c[0] - w / 2, x1 = c[0] + w / 2, y0 = c[1] - h / 2, y1 = c[1] + h / 2, z0 = c[2] - d / 2, z1 = c[2] + d / 2;
  return [
    { id: 'f', origin: [x0, y0, z1], e1: [w, 0, 0], e2: [0, h, 0], normal: [0, 0, 1] },
    { id: 'k', origin: [x1, y0, z0], e1: [-w, 0, 0], e2: [0, h, 0], normal: [0, 0, -1] },
    { id: 'r', origin: [x1, y0, z1], e1: [0, 0, -d], e2: [0, h, 0], normal: [1, 0, 0] },
    { id: 'l', origin: [x0, y0, z0], e1: [0, 0, d], e2: [0, h, 0], normal: [-1, 0, 0] },
    { id: 't', origin: [x0, y0, z0], e1: [w, 0, 0], e2: [0, 0, d], normal: [0, -1, 0] },
    { id: 'b', origin: [x0, y1, z1], e1: [w, 0, 0], e2: [0, 0, -d], normal: [0, 1, 0] },
  ];
}

const len = (v: V3) => Math.hypot(v[0], v[1], v[2]) || 1;

/** 面上 (u, v) mm 的 3D 座標 */
export function onFace(f: Face, u: number, v: number): V3 {
  const a = u / len(f.e1), b = v / len(f.e2);
  return [
    f.origin[0] + f.e1[0] * a + f.e2[0] * b,
    f.origin[1] + f.e1[1] * a + f.e2[1] * b,
    f.origin[2] + f.e1[2] * a + f.e2[2] * b,
  ];
}

export interface View { yaw: number; pitch: number }

/** 正投影：先繞 y 軸轉 yaw、再繞 x 軸轉 pitch（度）。回傳 [螢幕 x, 螢幕 y, 深度（越大越靠近觀看者）] */
export function projector({ yaw, pitch }: View) {
  const a = (yaw * Math.PI) / 180, b = (pitch * Math.PI) / 180;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  return (p: V3): V3 => {
    const x1 = p[0] * ca + p[2] * sa;
    const z1 = -p[0] * sa + p[2] * ca;
    return [x1, p[1] * cb - z1 * sb, p[1] * sb + z1 * cb];
  };
}

/** 面是否朝向觀看者 */
export function facing(f: Face, view: View): boolean {
  const project = projector(view);
  return project(f.normal)[2] > 1e-6;
}

/** 圓在面上的多邊形頂點（u, v） */
export function circlePoints(u: number, v: number, r: number, n = 28): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [u + r * Math.cos(t), v + r * Math.sin(t)] as [number, number];
  });
}

// ── 常用細節 ──

/** 風扇：外框圓、輪轂與扇葉 */
export function fan(u: number, v: number, r: number): Shape[] {
  const out: Shape[] = [{ t: 'circle', u, v, r, fill: true }, { t: 'circle', u, v, r: r * 0.28, fill: true }];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, b = a + 0.55;
    out.push({ t: 'line', u1: u + r * 0.28 * Math.cos(a), v1: v + r * 0.28 * Math.sin(a), u2: u + r * 0.92 * Math.cos(b), v2: v + r * 0.92 * Math.sin(b) });
  }
  return out;
}

/** 平行線（散熱鰭片、通風孔）：沿 v 方向每隔 gap 一條，從 u0 畫到 u1 */
export function hatch(u0: number, u1: number, v0: number, v1: number, gap: number): Shape[] {
  const out: Shape[] = [];
  for (let v = v0 + gap; v < v1 - gap / 2; v += gap) out.push({ t: 'line', u1: u0, v1: v, u2: u1, v2: v });
  return out;
}

/** 同 hatch，但線沿 v 方向（每隔 gap 一條直線） */
export function hatchV(u0: number, u1: number, v0: number, v1: number, gap: number): Shape[] {
  const out: Shape[] = [];
  for (let u = u0 + gap; u < u1 - gap / 2; u += gap) out.push({ t: 'line', u1: u, v1: v0, u2: u, v2: v1 });
  return out;
}

/** 風扇網：同心圓加十字 */
export function grille(u: number, v: number, r: number): Shape[] {
  return [
    { t: 'circle', u, v, r, fill: true }, { t: 'circle', u, v, r: r * 0.7 }, { t: 'circle', u, v, r: r * 0.4 },
    { t: 'circle', u, v, r: r * 0.15, fill: true },
    { t: 'line', u1: u - r, v1: v, u2: u + r, v2: v }, { t: 'line', u1: u, v1: v - r, u2: u, v2: v + r },
  ];
}
