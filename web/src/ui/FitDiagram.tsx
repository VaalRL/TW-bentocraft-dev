import { CONDITION_LABEL, spec } from '../engine/constraints';
import type { Check, Selection, Status } from '../engine/types';
import { CaseSchematic } from './CaseSchematic';
import { STATUS_LABEL, checkText } from './format';

// 尺寸比例圖（04 第五節 Phase 2）：以毫米等比例畫出顯卡長度、風冷高度與機殼上限。
// 是否放得下一律採用約束引擎 C4／C5 的結果（已含誤差與條件式上限），圖只負責呈現。

interface Row {
  key: string;
  title: string;
  part: string;
  size?: { value: number; tolerance: number };
  limit: number;
  conditions: [number, string][];
  check?: Check;
}

const W = 320; // viewBox 寬度
const PAD = 8;
const BAR_Y = 14;
const BAR_H = 14;
const H = 46;

const COLOR: Record<Status, string> = {
  pass: 'var(--status-ok)',
  warn: 'var(--status-warn)',
  fail: 'var(--status-error)',
  unknown: 'var(--status-unknown)',
};

function rows(sel: Selection, checks: Check[]): Row[] {
  const { case: c, gpu, cooler } = sel;
  if (!c) return [];
  const out: Row[] = [];
  const gpuLimit = spec<number>(c, 'gpu_clearance_mm');
  if (gpuLimit) {
    const len = gpu && !spec<boolean>(gpu, 'external')?.value ? spec<number>(gpu, 'length_mm') : undefined;
    out.push({
      key: 'gpu', title: '顯卡長度', part: '顯卡',
      size: len && { value: len.value, tolerance: len.tolerance },
      limit: gpuLimit.value, conditions: gpuLimit.conditions,
      check: gpu ? checks.find(k => k.constraint === 'C4') : undefined,
    });
  }
  const coolerLimit = spec<number>(c, 'cooler_clearance_mm');
  if (coolerLimit && (!cooler || spec<string>(cooler, 'cooler_type')?.value === 'air')) {
    const h = cooler ? spec<number>(cooler, 'height_mm') : undefined;
    out.push({
      key: 'cooler', title: '風冷散熱器高度', part: '散熱器',
      size: h && { value: h.value, tolerance: h.tolerance },
      limit: coolerLimit.value, conditions: coolerLimit.conditions,
      check: cooler ? checks.find(k => k.constraint === 'C5') : undefined,
    });
  }
  return out;
}

function caption(r: Row): string {
  if (!r.size) return `機殼上限 ${r.limit} mm（尚未選擇${r.part}或缺少尺寸）`;
  const tol = r.size.tolerance ? `（±${r.size.tolerance}）` : '';
  const room = r.limit - r.size.value;
  const diff = room >= 0 ? `剩 ${room} mm` : `超出 ${-room} mm`;
  return `${r.part} ${r.size.value} mm${tol}／機殼上限 ${r.limit} mm：${diff}`;
}

function Ruler({ r }: { r: Row }) {
  const status: Status = r.check?.status ?? 'unknown';
  const max = Math.max(r.limit, r.size ? r.size.value + r.size.tolerance : 0) * 1.08;
  const x = (mm: number) => PAD + (mm / max) * (W - PAD * 2);
  const describe = r.size
    ? `${r.title}：${caption(r)}，${STATUS_LABEL[status]}`
    : `${r.title}：機殼上限 ${r.limit} mm`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fit-ruler" role="img" aria-label={describe}>
      {/* 機殼可用空間 */}
      <rect x={x(0)} y={BAR_Y - 4} width={x(r.limit) - x(0)} height={BAR_H + 8} rx={4} className="fit-space" />
      {r.size && (
        <g>
          <rect x={x(0)} y={BAR_Y} width={Math.max(x(r.size.value) - x(0), 2)} height={BAR_H} rx={4}
            fill={COLOR[status]} />
          {r.size.tolerance > 0 && (
            <rect x={x(r.size.value - r.size.tolerance)} y={BAR_Y + 3}
              width={x(r.size.value + r.size.tolerance) - x(r.size.value - r.size.tolerance)} height={BAR_H - 6}
              className="fit-tolerance" />
          )}
          <title>{caption(r)}</title>
        </g>
      )}
      {/* 條件式上限（如裝上電源護罩時），畫在零件上方才看得到 */}
      {r.conditions.map(([v, when]) => (
        <g key={`${v}-${when}`}>
          <line x1={x(v)} x2={x(v)} y1={BAR_Y - 6} y2={BAR_Y + BAR_H + 6} className="fit-condition" />
          <title>{`${CONDITION_LABEL[when] ?? when}上限 ${v} mm`}</title>
        </g>
      ))}
      {/* 機殼上限 */}
      <line x1={x(r.limit)} x2={x(r.limit)} y1={BAR_Y - 8} y2={BAR_Y + BAR_H + 8} className="fit-limit" />
      <text x={x(r.limit)} y={H - 1} textAnchor="end" className="fit-tick">{r.limit} mm</text>
      <text x={x(0)} y={H - 1} className="fit-tick">0</text>
    </svg>
  );
}

export function FitDiagram({ selection, checks }: { selection: Selection; checks: Check[] }) {
  const list = rows(selection, checks);
  if (!list.length) return null;
  return (
    <div className="fit" aria-label="尺寸比例">
      <h3>尺寸比例</h3>
      <CaseSchematic selection={selection} checks={checks} />
      {list.map(r => (
        <div key={r.key} className="fit-row">
          <div className="fit-head">
            <span>{r.title}</span>
            {r.check && <span className={`badge status-${r.check.status}`}>{STATUS_LABEL[r.check.status]}</span>}
          </div>
          <Ruler r={r} />
          <p className="fit-caption">
            {caption(r)}
            {r.check && r.check.status !== 'pass' && r.check.message && <><br />{checkText(r.check)}</>}
          </p>
          {r.conditions.length > 0 && (
            <p className="fit-caption muted">
              虛線：{r.conditions.map(([v, when]) => `${CONDITION_LABEL[when] ?? when}上限 ${v} mm`).join('、')}
            </p>
          )}
        </div>
      ))}
      <p className="muted small">依規格數值等比例繪製；淡色區段為規格誤差範圍。</p>
    </div>
  );
}
