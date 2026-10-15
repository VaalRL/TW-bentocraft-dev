import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { lowestUnconditional, priceTrend } from '../engine/pricing';
import type { CpuBench, Model, Offer, PriceHistory } from '../engine/types';
import { formatPrice, modelName } from './format';

// CPU 規格對決：最多 4 顆 CPU 並排比較規格、算圖效能與今天的原價屋價格。
// 規格取自原廠規格頁（規格庫 cpu 分片的比較用欄位）；算圖效能取自 Blender Open Data。
// 網址 #/compare?c=<型號>,<型號>…&f=<快速比較> 可直接分享；列的順序與隱藏設定記在瀏覽器。

export const COMPARE_PREFIX = '#/compare';
export const MAX_CPUS = 4;

export interface Row {
  id: string;
  label: string;
  note?: string;
  value: (m: Model) => ReactNode | null;
  /** 用來判斷哪一欄較好的數值；沒有 better 時只並列不比較 */
  num?: (m: Model) => number | undefined;
  better?: 'higher' | 'lower';
}

const s = <T,>(m: Model, f: string) => m.s[f] as T | undefined;
const unit = (v: number | undefined, u: string) => (v === undefined ? null : `${v}${u}`);

/** 規格列（價格與算圖效能另外依資料產生） */
export const ROWS: Row[] = [
  { id: 'socket', label: '腳位', value: m => s<string>(m, 'socket') ?? null },
  { id: 'arch', label: '架構', value: m => s<string>(m, 'generation') ?? null },
  { id: 'process', label: '製程', value: m => s<string>(m, 'process') ?? null },
  {
    id: 'cores',
    label: '核心／執行緒',
    value: m => {
      const c = s<number>(m, 'cores'), t = s<number>(m, 'threads');
      if (c === undefined) return null;
      const hybrid = s<number>(m, 'p_cores') !== undefined ? `（${s<number>(m, 'p_cores')}P＋${s<number>(m, 'e_cores') ?? 0}E）` : '';
      return `${c} 核／${t ?? '?'} 緒${hybrid}`;
    },
    num: m => s<number>(m, 'threads') ?? s<number>(m, 'cores'),
    better: 'higher',
  },
  { id: 'boost', label: '最高加速時脈', value: m => unit(s(m, 'boost_clock_ghz'), ' GHz'), num: m => s(m, 'boost_clock_ghz'), better: 'higher' },
  { id: 'base', label: '基礎時脈', value: m => unit(s(m, 'base_clock_ghz'), ' GHz'), num: m => s(m, 'base_clock_ghz'), better: 'higher' },
  { id: 'l3', label: 'L3 快取', value: m => unit(s(m, 'l3_cache_mb'), ' MB'), num: m => s(m, 'l3_cache_mb'), better: 'higher' },
  { id: 'l2', label: 'L2 快取', value: m => unit(s(m, 'l2_cache_mb'), ' MB'), num: m => s(m, 'l2_cache_mb'), better: 'higher' },
  { id: 'tdp', label: 'TDP／基礎功耗', value: m => unit(s(m, 'tdp_w'), ' W') },
  { id: 'maxpower', label: '最大功耗（PPT／PL2）', value: m => unit(s(m, 'max_power_w'), ' W') },
  {
    id: 'igpu',
    label: '內建顯示',
    value: m => (s<boolean>(m, 'igpu') === false ? '無（需獨立顯卡）' : s<string>(m, 'igpu_name') ?? (s<boolean>(m, 'igpu') ? '有' : null)),
  },
  {
    id: 'memory',
    label: '記憶體',
    value: m => {
      const d5 = s<number>(m, 'ddr5_mts'), d4 = s<number>(m, 'ddr4_mts');
      const parts = [d5 && `DDR5-${d5}`, d4 && `DDR4-${d4}`].filter(Boolean);
      return parts.length ? parts.join('／') : null;
    },
    num: m => s(m, 'ddr5_mts'),
    better: 'higher',
  },
  {
    id: 'pcie',
    label: 'PCIe',
    value: m => {
      const g = s<number>(m, 'pcie_gen'), l = s<number>(m, 'pcie_lanes');
      return g === undefined ? null : `PCIe ${g}.0${l ? `，${l} 條` : ''}`;
    },
    num: m => s(m, 'pcie_gen'),
    better: 'higher',
  },
  { id: 'unlocked', label: '倍頻', value: m => (s<boolean>(m, 'unlocked') === undefined ? null : s<boolean>(m, 'unlocked') ? '未鎖（可超頻）' : '鎖定') },
  { id: 'cooler', label: '附散熱器', value: m => (s<boolean>(m, 'cooler_included') === undefined ? null : s<boolean>(m, 'cooler_included') ? '有' : '無') },
  { id: 'launch', label: '上市', value: m => s<string>(m, 'launch') ?? null },
];

export const DEFAULT_ORDER = ['price', 'bench', ...ROWS.map(r => r.id)];

/** 快速比較：指定一列與比較方向，標出勝出的 CPU 並把該列移到最上面 */
export interface Quick {
  id: string;
  label: string;
  row: string;
  better: 'higher' | 'lower';
  /** 與該列不同的比較數值（例如功耗列平常不分好壞） */
  num?: (m: Model) => number | undefined;
  note?: string;
}

export const QUICK: Quick[] = [
  { id: 'cheap', label: '最便宜', row: 'price', better: 'lower' },
  { id: 'render', label: '算圖最強', row: 'bench', better: 'higher' },
  { id: 'power', label: '最省電', row: 'maxpower', better: 'lower', num: m => s(m, 'max_power_w'), note: '以最大功耗（PPT／PL2）比較' },
  { id: 'cores', label: '核心最多', row: 'cores', better: 'higher' },
  { id: 'clock', label: '時脈最高', row: 'boost', better: 'higher' },
  { id: 'cache', label: '快取最大', row: 'l3', better: 'higher', note: '以 L3 快取比較' },
];

/** 套用快速比較的列：改用快速比較指定的方向與數值 */
export function focusRow(row: Row, q: Quick): Row {
  return { ...row, better: q.better, num: q.num ?? row.num };
}

/** 某列最好的欄（可能多欄同分）；全部相同或少於兩欄有數值時不標 */
export function best(row: Row, models: Model[]): Set<number> {
  if (!row.better || !row.num) return new Set();
  const nums = models.map(m => row.num!(m));
  const defined = nums.filter((v): v is number => v !== undefined);
  if (defined.length < 2 || defined.every(v => v === defined[0])) return new Set();
  const target = row.better === 'higher' ? Math.max(...defined) : Math.min(...defined);
  return new Set(nums.flatMap((v, i) => (v === target ? [i] : [])));
}

/** 讀取的列順序：沿用存下的順序，新增的列依預設位置補上，已不存在的列丟掉 */
export function mergeOrder(saved: string[] | undefined, defaults: string[] = DEFAULT_ORDER): string[] {
  if (!saved?.length) return defaults;
  const known = saved.filter(id => defaults.includes(id));
  for (const id of defaults) {
    if (known.includes(id)) continue;
    const before = defaults.slice(0, defaults.indexOf(id)).reverse().find(x => known.includes(x));
    known.splice(before ? known.indexOf(before) + 1 : 0, 0, id);
  }
  return known;
}

const PREF_KEY = 'cmp-rows';
function loadPrefs(): { order: string[]; hidden: string[] } {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null');
    return { order: mergeOrder(Array.isArray(p?.order) ? p.order : undefined), hidden: Array.isArray(p?.hidden) ? p.hidden : [] };
  } catch {
    return { order: DEFAULT_ORDER, hidden: [] };
  }
}

function readHash(): { ids: string[]; focus: string | null } {
  const q = new URLSearchParams(location.hash.slice(COMPARE_PREFIX.length).replace(/^\?/, ''));
  const list = q.get('c')?.split(',') ?? [q.get('a'), q.get('b')]; // a／b 是舊版連結
  const focus = q.get('f');
  return { ids: list.filter((x): x is string => !!x), focus: QUICK.some(x => x.id === focus) ? focus : null };
}

export function CpuCompare({ cpus, offers, history, bench, current, onUse }: {
  cpus: Model[];
  offers: Map<string, Offer[]>;
  history?: PriceHistory;
  /** Blender Open Data 的算圖跑分；沒有資料時不顯示這一列 */
  bench?: CpuBench;
  /** 配單中已選的 CPU，作為預設的第一欄 */
  current?: Model;
  onUse: (m: Model) => void;
}) {
  const byId = useMemo(() => new Map(cpus.map(m => [m.id, m])), [cpus]);
  const sorted = useMemo(() => [...cpus].sort((x, y) => modelName(x).localeCompare(modelName(y), 'zh-Hant', { numeric: true })), [cpus]);
  // 每一欄選的型號；空字串表示還沒選
  const [ids, setIds] = useState<string[]>(() => {
    const fromUrl = readHash().ids.filter(id => byId.has(id)).slice(0, MAX_CPUS);
    const start = fromUrl.length ? fromUrl : current ? [current.id] : [];
    return [...start, ...Array(Math.max(0, 2 - start.length)).fill('')];
  });
  const [prefs, setPrefs] = useState(loadPrefs);
  const [focus, setFocus] = useState<string | null>(() => readHash().focus);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 比較的型號與快速比較寫進網址，網址本身就是分享連結
  useEffect(() => {
    const chosen = ids.filter(Boolean);
    const params = [chosen.length && `c=${chosen.map(encodeURIComponent).join(',')}`, focus && `f=${focus}`].filter(Boolean);
    replaceHash(`${COMPARE_PREFIX}${params.length ? `?${params.join('&')}` : ''}`);
  }, [ids, focus]);

  // 窄螢幕時勝出的欄可能在畫面外：表格水平捲到該欄
  useEffect(() => {
    const box = scrollRef.current;
    const th = box?.querySelector<HTMLElement>('thead th.is-winner');
    if (!box || !th) return;
    const label = box.querySelector<HTMLElement>('thead th')?.offsetWidth ?? 0;
    if (th.offsetLeft < box.scrollLeft + label || th.offsetLeft + th.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollTo({ left: th.offsetLeft - label, behavior: 'smooth' });
    }
  }, [focus, ids]);

  const savePrefs = (next: { order: string[]; hidden: string[] }) => {
    setPrefs(next);
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* 無痕模式等情況存不了，只影響下次開啟 */ }
  };
  const move = (id: string, to: number) => {
    const order = prefs.order.filter(x => x !== id);
    order.splice(Math.max(0, Math.min(to, order.length)), 0, id);
    savePrefs({ ...prefs, order });
  };
  const toggleHidden = (id: string) =>
    savePrefs({ ...prefs, hidden: prefs.hidden.includes(id) ? prefs.hidden.filter(x => x !== id) : [...prefs.hidden, id] });

  const price = (m: Model) => lowestUnconditional(offers.get(m.id))?.p;
  const models = ids.map(id => byId.get(id)).filter((m): m is Model => !!m);

  const rows = new Map<string, Row>(ROWS.map(r => [r.id, r]));
  const cheapest = Math.min(...models.map(m => price(m) ?? Infinity));
  rows.set('price', {
    id: 'price',
    label: '價格',
    num: price,
    better: 'lower',
    value: m => {
      const p = price(m);
      const t = priceTrend(history, m.id, lowestUnconditional(offers.get(m.id)));
      return p === undefined ? null : (
        <>
          {formatPrice(p)}
          {models.length > 1 && Number.isFinite(cheapest) && p > cheapest && <span className="cmp-pct">（+{formatPrice(p - cheapest)}）</span>}
          {t && <span className="cmp-note">近 {t.days} 天最低 {formatPrice(t.low)}</span>}
        </>
      );
    },
  });
  if (bench) {
    const top = Math.max(0, ...models.map(m => bench.m[m.id]?.[0] ?? 0));
    rows.set('bench', {
      id: 'bench',
      label: '算圖效能',
      note: `Blender ${bench.v}`,
      num: m => bench.m[m.id]?.[0],
      better: 'higher',
      value: m => {
        const v = bench.m[m.id];
        if (!v) return <span className="muted">樣本不足</span>;
        const pct = top ? Math.round((v[0] / top) * 100) : 100;
        return (
          <>
            {Math.round(v[0]).toLocaleString('zh-TW')}
            {pct < 100 && <span className="cmp-pct">（{pct}%）</span>}
            <span className="cmp-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
            <span className="cmp-note">{v[1]} 筆結果的中位數</span>
          </>
        );
      },
    });
  }
  const order = prefs.order.filter(id => rows.has(id));
  const visible = order.filter(id => !prefs.hidden.includes(id));
  const quicks = QUICK.filter(q => rows.has(q.row));
  const quick = editing ? undefined : quicks.find(q => q.id === focus);
  const rowFor = (id: string) => (quick?.row === id ? focusRow(rows.get(id)!, quick) : rows.get(id)!);
  // 快速比較的列放在最上面（即使被隱藏也顯示）
  const shown = editing ? order : quick ? [quick.row, ...visible.filter(id => id !== quick.row)] : visible;
  const winners = quick ? best(rowFor(quick.row), models) : new Set<number>();
  const verdict = () => {
    if (!quick) return null;
    const row = rowFor(quick.row);
    const count = models.filter(m => row.num?.(m) !== undefined).length;
    if (winners.size) {
      return <>{quick.label}：<strong>{[...winners].map(i => models[i].n).join('、')}</strong>（「{row.label}」已移到最上面{quick.note ? `，${quick.note}` : ''}）</>;
    }
    return count < 2 ? `「${row.label}」有資料的不到兩顆，無法比較。` : `所選 CPU 的「${row.label}」相同。`;
  };

  const picker = (id: string, i: number) => {
    const m = byId.get(id);
    return (
      <div className="cmp-pick" key={i}>
        <div className="cmp-pick-row">
          <label>
            <span className="visually-hidden">第 {i + 1} 顆 CPU</span>
            <select value={id} onChange={e => setIds(v => v.map((x, j) => (j === i ? e.target.value : x)))}>
              <option value="">選擇 CPU…</option>
              {(['AMD', 'Intel'] as const).map(brand => (
                <optgroup key={brand} label={brand}>
                  {sorted.filter(c => c.b === brand).map(c => {
                    const p = price(c);
                    return <option key={c.id} value={c.id}>{c.n}{p ? `　${formatPrice(p)}` : ''}</option>;
                  })}
                </optgroup>
              ))}
            </select>
          </label>
          {ids.length > 2 && (
            <button type="button" className="cmp-remove" aria-label={`移除第 ${i + 1} 欄`}
              onClick={() => setIds(v => v.filter((_, j) => j !== i))}>×</button>
          )}
        </div>
        {m && (
          <div className="cmp-price">
            <span className="cmp-price-value">{price(m) ? formatPrice(price(m)!) : '無報價'}</span>
            <button type="button" className="link" onClick={() => onUse(m)}>放入配單</button>
          </div>
        )}
      </div>
    );
  };

  const onDrop = (target: string) => (e: DragEvent) => {
    e.preventDefault();
    if (dragging && dragging !== target) move(dragging, order.filter(x => x !== dragging).indexOf(target));
    setDragging(null);
  };

  return (
    <section className="cmp" aria-labelledby="cmp-title">
      <div className="cmp-head">
        <h2 id="cmp-title">CPU 規格對決</h2>
        <p className="muted small">
          最多比較 {MAX_CPUS} 顆。規格取自 AMD、Intel 原廠規格頁；價格為今天的原價屋報價。{bench ? '算圖效能取自 Blender Open Data。' : '不含效能跑分。'}
        </p>
      </div>
      <div className="cmp-picks" style={{ '--cols': ids.length + (ids.length < MAX_CPUS ? 1 : 0) } as CSSProperties}>
        {ids.map(picker)}
        {ids.length < MAX_CPUS && (
          <button type="button" className="cmp-add" onClick={() => setIds(v => [...v, ''])}>＋ 加入比較</button>
        )}
      </div>
      {models.length >= 2 ? (
        <>
          <div className="cmp-quick" role="group" aria-label="快速比較">
            <span className="cmp-quick-label">快速比較</span>
            {quicks.map(q => (
              <button type="button" key={q.id} aria-pressed={focus === q.id} disabled={editing}
                onClick={() => setFocus(f => (f === q.id ? null : q.id))}>{q.label}</button>
            ))}
          </div>
          <p className="cmp-verdict" role="status">{verdict()}</p>
          <div className="cmp-tools">
            <button type="button" className="link" aria-pressed={editing} onClick={() => setEditing(v => !v)}>
              {editing ? '完成' : '調整欄位順序'}
            </button>
            {editing && (
              <button type="button" className="link" onClick={() => savePrefs({ order: DEFAULT_ORDER, hidden: [] })}>恢復預設</button>
            )}
          </div>
          {editing && <p className="muted small">拖曳列標題，或用 ↑ ↓ 調整順序；取消勾選可隱藏該列。設定會記在這個瀏覽器。</p>}
          <div className="cmp-scroll" ref={scrollRef}>
            <table className={`cmp-table ${editing ? 'is-editing' : ''}`}>
              <thead>
                <tr>
                  <th scope="col">規格</th>
                  {models.map((m, i) => (
                    <th scope="col" key={m.id} className={winners.has(i) ? 'is-winner' : ''}>
                      {m.n}
                      {winners.has(i) && quick && <span className="cmp-badge">{quick.label}</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((id, idx) => {
                  const row = rowFor(id);
                  const hidden = prefs.hidden.includes(id);
                  const top = best(row, models);
                  return (
                    <tr key={id} className={`${hidden && editing ? 'is-hidden' : ''} ${dragging === id ? 'is-dragging' : ''} ${quick?.row === id ? 'is-focus' : ''}`}
                      draggable={editing} onDragStart={() => setDragging(id)} onDragEnd={() => setDragging(null)}
                      onDragOver={e => editing && e.preventDefault()} onDrop={onDrop(id)}>
                      <th scope="row">
                        {editing && (
                          <span className="cmp-row-tools">
                            <input type="checkbox" checked={!hidden} onChange={() => toggleHidden(id)} aria-label={`顯示「${row.label}」`} />
                            <button type="button" disabled={idx === 0} onClick={() => move(id, idx - 1)} aria-label={`「${row.label}」上移`}>↑</button>
                            <button type="button" disabled={idx === order.length - 1} onClick={() => move(id, idx + 1)} aria-label={`「${row.label}」下移`}>↓</button>
                          </span>
                        )}
                        {row.label}
                        {row.note && <span className="cmp-note">{row.note}</span>}
                      </th>
                      {models.map((m, i) => {
                        const isBest = top.has(i);
                        return (
                          <td key={m.id} className={isBest ? 'is-better' : ''}>
                            {row.value(m) ?? <span className="muted">—</span>}
                            {isBest && <span className="visually-hidden">（{row.better === 'lower' ? '最低' : '最高'}）</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            標色的是該列數值最高的一欄（價格為最便宜的一欄），價格後的「+$」是比最便宜的貴多少；
            時脈、核心數不等於實際效能，不同架構之間只能參考。「—」表示原廠未標示或尚未補上。
            {bench && <>
              算圖效能是 <a href="https://opendata.blender.org/" target="_blank" rel="noreferrer">Blender Open Data</a>（CC0）
              使用者回傳的 Blender {bench.v} CPU 算圖成績（三個場景每分鐘樣本數的總和）取中位數，括號內是相對最高者的百分比；
              只代表多核心算圖這類工作，不代表遊戲效能；樣本不足 5 筆的型號不顯示。
            </>}
            規格出處：{models.map((m, i) => (
              <span key={m.id}>{i > 0 && '、'}{m.u ? <a href={m.u} target="_blank" rel="noreferrer">{m.n}</a> : m.n}</span>
            ))}
          </p>
        </>
      ) : (
        <p className="muted">至少選兩顆 CPU 開始比較。</p>
      )}
    </section>
  );
}

function replaceHash(hash: string) {
  window.history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
}
