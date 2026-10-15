import { useEffect, useMemo, useState } from 'react';
import { lowestUnconditional, priceTrend } from '../engine/pricing';
import type { Model, Offer, PriceHistory } from '../engine/types';
import { formatPrice, modelName } from './format';

// CPU 規格對決：兩顆 CPU 並排比較規格與今天的原價屋價格。
// 規格取自原廠規格頁（規格庫 cpu 分片的比較用欄位），不做效能分數。
// 網址 #/compare?a=<型號>&b=<型號> 可直接分享。

export const COMPARE_PREFIX = '#/compare';

type Better = 'higher' | 'lower' | null;

interface Row {
  label: string;
  value: (m: Model) => string | null;
  /** 用來判斷哪一邊較好的數值；better 為 null 時只並列不比較 */
  num?: (m: Model) => number | undefined;
  better?: Better;
}

const s = <T,>(m: Model, f: string) => m.s[f] as T | undefined;
const unit = (v: number | undefined, u: string) => (v === undefined ? null : `${v}${u}`);

export const ROWS: Row[] = [
  { label: '腳位', value: m => s<string>(m, 'socket') ?? null },
  { label: '架構', value: m => s<string>(m, 'generation') ?? null },
  { label: '製程', value: m => s<string>(m, 'process') ?? null },
  {
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
  { label: '最高加速時脈', value: m => unit(s(m, 'boost_clock_ghz'), ' GHz'), num: m => s(m, 'boost_clock_ghz'), better: 'higher' },
  { label: '基礎時脈', value: m => unit(s(m, 'base_clock_ghz'), ' GHz'), num: m => s(m, 'base_clock_ghz'), better: 'higher' },
  { label: 'L3 快取', value: m => unit(s(m, 'l3_cache_mb'), ' MB'), num: m => s(m, 'l3_cache_mb'), better: 'higher' },
  { label: 'L2 快取', value: m => unit(s(m, 'l2_cache_mb'), ' MB'), num: m => s(m, 'l2_cache_mb'), better: 'higher' },
  { label: 'TDP／基礎功耗', value: m => unit(s(m, 'tdp_w'), ' W') },
  { label: '最大功耗（PPT／PL2）', value: m => unit(s(m, 'max_power_w'), ' W') },
  {
    label: '內建顯示',
    value: m => (s<boolean>(m, 'igpu') === false ? '無（需獨立顯卡）' : s<string>(m, 'igpu_name') ?? (s<boolean>(m, 'igpu') ? '有' : null)),
  },
  {
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
    label: 'PCIe',
    value: m => {
      const g = s<number>(m, 'pcie_gen'), l = s<number>(m, 'pcie_lanes');
      return g === undefined ? null : `PCIe ${g}.0${l ? `，${l} 條` : ''}`;
    },
    num: m => s(m, 'pcie_gen'),
    better: 'higher',
  },
  { label: '倍頻', value: m => (s<boolean>(m, 'unlocked') === undefined ? null : s<boolean>(m, 'unlocked') ? '未鎖（可超頻）' : '鎖定') },
  { label: '附散熱器', value: m => (s<boolean>(m, 'cooler_included') === undefined ? null : s<boolean>(m, 'cooler_included') ? '有' : '無') },
  { label: '上市', value: m => s<string>(m, 'launch') ?? null },
];

/** 某列哪一邊較好：'a'、'b' 或 null（相同、無法比較） */
export function winner(row: Row, a: Model, b: Model): 'a' | 'b' | null {
  if (!row.better || !row.num) return null;
  const x = row.num(a), y = row.num(b);
  if (x === undefined || y === undefined || x === y) return null;
  return (x > y) === (row.better === 'higher') ? 'a' : 'b';
}

function readHash(): [string | null, string | null] {
  const q = new URLSearchParams(location.hash.slice(COMPARE_PREFIX.length).replace(/^\?/, ''));
  return [q.get('a'), q.get('b')];
}

export function CpuCompare({ cpus, offers, history, current, onUse }: {
  cpus: Model[];
  offers: Map<string, Offer[]>;
  history?: PriceHistory;
  /** 配單中已選的 CPU，作為預設的左邊 */
  current?: Model;
  onUse: (m: Model) => void;
}) {
  const byId = useMemo(() => new Map(cpus.map(m => [m.id, m])), [cpus]);
  const sorted = useMemo(() => [...cpus].sort((x, y) => modelName(x).localeCompare(modelName(y), 'zh-Hant', { numeric: true })), [cpus]);
  const [ids, setIds] = useState<[string | null, string | null]>(() => {
    const [a, b] = readHash();
    return [a && byId.has(a) ? a : current?.id ?? null, b && byId.has(b) ? b : null];
  });

  // 比較的型號寫進網址，網址本身就是分享連結
  useEffect(() => {
    const q = new URLSearchParams();
    if (ids[0]) q.set('a', ids[0]);
    if (ids[1]) q.set('b', ids[1]);
    const query = q.toString();
    replaceHash(`${COMPARE_PREFIX}${query ? `?${query}` : ''}`);
  }, [ids]);

  const [a, b] = ids.map(id => (id ? byId.get(id) : undefined));
  const price = (m: Model) => lowestUnconditional(offers.get(m.id))?.p;
  const side = (m: Model | undefined, i: 0 | 1) => (
    <div className="cmp-pick">
      <label>
        <span className="visually-hidden">{i === 0 ? '左邊的 CPU' : '右邊的 CPU'}</span>
        <select value={m?.id ?? ''} onChange={e => setIds(v => (i === 0 ? [e.target.value || null, v[1]] : [v[0], e.target.value || null]))}>
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
      {m && (
        <div className="cmp-price">
          <span className="cmp-price-value">{price(m) ? formatPrice(price(m)!) : '無報價'}</span>
          <button type="button" className="link" onClick={() => onUse(m)}>放入配單</button>
        </div>
      )}
    </div>
  );

  const priceA = a && price(a), priceB = b && price(b);
  const diff = priceA && priceB ? priceA - priceB : null;
  const trend = (m: Model | undefined) => {
    const t = m && priceTrend(history, m.id, lowestUnconditional(offers.get(m.id)));
    return t ? `近 ${t.days} 天最低 ${formatPrice(t.low)}` : null;
  };

  return (
    <section className="cmp" aria-labelledby="cmp-title">
      <div className="cmp-head">
        <h2 id="cmp-title">CPU 規格對決</h2>
        <p className="muted small">規格取自 AMD、Intel 原廠規格頁；價格為今天的原價屋報價。不含效能跑分。</p>
      </div>
      <div className="cmp-picks">
        {side(a, 0)}
        <span className="cmp-vs" aria-hidden="true">VS</span>
        {side(b, 1)}
      </div>
      {a && b ? (
        <>
          {diff !== null && diff !== 0 && (
            <p className="cmp-diff" role="status">
              {diff > 0 ? `${a.n} 比 ${b.n} 貴 ${formatPrice(diff)}` : `${a.n} 比 ${b.n} 便宜 ${formatPrice(-diff)}`}
            </p>
          )}
          <table className="cmp-table">
            <thead>
              <tr><th scope="col">規格</th><th scope="col">{a.n}</th><th scope="col">{b.n}</th></tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">價格</th>
                {[a, b].map((m, i) => (
                  <td key={i} className={diff && (diff > 0) === (i === 1) ? 'is-better' : ''}>
                    {price(m) ? formatPrice(price(m)!) : '無報價'}
                    {trend(m) && <span className="cmp-note">{trend(m)}</span>}
                  </td>
                ))}
              </tr>
              {ROWS.map(row => {
                const w = winner(row, a, b);
                return (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {[a, b].map((m, i) => {
                      const better = w === (i === 0 ? 'a' : 'b');
                      return (
                        <td key={i} className={better ? 'is-better' : ''}>
                          {row.value(m) ?? <span className="muted">—</span>}
                          {better && <span className="visually-hidden">（較高）</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small">
            標色的是數值較高的一邊（價格為較便宜的一邊）；時脈、核心數不等於實際效能，不同架構之間只能參考。
            「—」表示原廠未標示或尚未補上。
            規格出處：{[a, b].map((m, i) => (
              <span key={m.id}>{i > 0 && '、'}{m.u ? <a href={m.u} target="_blank" rel="noreferrer">{m.n}</a> : m.n}</span>
            ))}
          </p>
        </>
      ) : (
        <p className="muted">選兩顆 CPU 開始比較。</p>
      )}
    </section>
  );
}

function replaceHash(hash: string) {
  window.history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
}
