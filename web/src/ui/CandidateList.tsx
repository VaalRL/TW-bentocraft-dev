import { useMemo, useState } from 'react';
import { buildChecks, constraintInvolves } from '../engine/constraints';
import { deadEndChecker, pairChecks, worst } from '../engine/engine';
import { lowestUnconditional, priceTrend, type PriceTrend } from '../engine/pricing';
import type { Category, Check, CpuBench, Model, Offer, PriceHistory, Selection, Status } from '../engine/types';
import { CATEGORY_LABEL, STATUS_LABEL, checkText, formatPrice, modelName, specSummary } from './format';

interface Row {
  model: Model;
  status: Status;
  checks: Check[];
  deadEnds: Category[];
  offer: Offer | null;
  trend: PriceTrend | null;
}

const ORDER: Record<Status, number> = { pass: 0, unknown: 1, warn: 2, fail: 3 };
const PAGE = 60;
/** 品牌數不超過這個數量時用按鈕，否則用下拉選單 */
const BRAND_CHIPS = 6;

/** CPU 的篩選條件（勾選的條件全部都要符合） */
const CPU_FLAGS: { id: string; label: string; test: (m: Model) => boolean }[] = [
  { id: 'igpu', label: '有內顯', test: m => m.s.igpu === true },
  { id: 'cooler', label: '附散熱器', test: m => m.s.cooler_included === true },
  { id: 'unlocked', label: '可超頻', test: m => m.s.unlocked === true },
];

type SortKey = 'default' | 'price' | 'price-desc' | 'score' | 'power' | 'value';
const SORT_LABEL: Record<SortKey, string> = {
  default: '相容優先',
  price: '價格低到高',
  'price-desc': '價格高到低',
  score: '算力高到低',
  power: '耗電低到高',
  value: '每千元算力高到低',
};

export function CandidateList({ category, models, catalog, selection, offers, history, bench, onPick, onStartWithCase, onCompare }: {
  category: Category;
  models: Model[];
  catalog: Record<Category, Model[]>;
  selection: Selection;
  offers: Map<string, Offer[]>;
  history?: PriceHistory;
  /** CPU 清單顯示的算圖跑分（Blender Open Data） */
  bench?: CpuBench;
  onPick: (m: Model) => void;
  /** 有值時在清單上方提示小機殼可先選機殼（還沒選任何零件時） */
  onStartWithCase?: () => void;
  /** 有值時在工具列顯示「規格對決」入口（目前只有 CPU） */
  onCompare?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [hideIncompatible, setHideIncompatible] = useState(true);
  const [limit, setLimit] = useState(PAGE);
  const [brands, setBrands] = useState<string[]>([]);
  const [sockets, setSockets] = useState<string[]>([]);
  const [flags, setFlags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>('default');

  const rows: Row[] = useMemo(() => {
    const deadEnds = deadEndChecker(category, selection, catalog);
    return models
      .map(model => {
        // 成對檢查全部列出；整機檢查只列出與此類別有關、且不是「未確認」的結果。
        // 例如「CPU 或顯卡功耗未確認」與個別電源無關，只在估價單顯示一次，不在每一列重複。
        const trial: Selection = { ...selection, [category]: model };
        const checks = [
          ...pairChecks(model, selection),
          ...buildChecks(trial).filter(c => c.status !== 'unknown' && constraintInvolves(c.constraint, category)),
        ].filter(c => c.status !== 'pass');
        const status = worst(checks);
        const offer = lowestUnconditional(offers.get(model.id));
        return { model, status, checks, deadEnds: status === 'fail' ? [] : deadEnds(model), offer, trend: priceTrend(history, model.id, offer) };
      })
      .sort((a, b) =>
        (ORDER[a.status] + (a.deadEnds.length ? 2.5 : 0)) - (ORDER[b.status] + (b.deadEnds.length ? 2.5 : 0)) ||
        (a.offer ? 0 : 1) - (b.offer ? 0 : 1) ||
        (a.offer?.p ?? 0) - (b.offer?.p ?? 0) ||
        modelName(a.model).localeCompare(modelName(b.model), 'zh-TW'),
      );
  }, [category, models, catalog, selection, offers, history]);

  // CPU 的算力條以清單中最高分為 100%
  const cpuBench = category === 'cpu' ? bench : undefined;
  const topScore = cpuBench ? Math.max(0, ...models.map(m => cpuBench.m[m.id]?.[0] ?? 0)) : 0;

  const isCpu = category === 'cpu';
  const brandOptions = useMemo(() => countBy(models.map(m => m.b)), [models]);
  // 腳位：CPU 與主機板都有
  const socketOptions = useMemo(
    () => (isCpu || category === 'motherboard' ? countBy(models.map(m => m.s.socket as string | undefined)) : []),
    [models, isCpu, category],
  );
  const sorts: SortKey[] = isCpu ? ['default', 'price', 'price-desc', 'score', 'power', 'value'] : ['default', 'price', 'price-desc'];
  const filtering = brands.length + sockets.length + flags.length > 0;
  const toggle = (set: (f: (v: string[]) => string[]) => void, value: string) => {
    set(v => (v.includes(value) ? v.filter(x => x !== value) : [...v, value]));
    setLimit(PAGE);
  };
  const score = (m: Model) => cpuBench?.m[m.id]?.[0];
  const value = (r: Row) => (r.offer && score(r.model) !== undefined ? (score(r.model)! / r.offer.p) * 1000 : undefined);

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matching = sortRows(rows.filter(r => {
    const hay = `${modelName(r.model)} ${specSummary(r.model)}`.toLowerCase();
    return terms.every(t => hay.includes(t)) &&
      (!brands.length || brands.includes(r.model.b)) &&
      (!sockets.length || sockets.includes(r.model.s.socket as string)) &&
      CPU_FLAGS.every(f => !flags.includes(f.id) || f.test(r.model));
  }), sort, {
    price: r => r.offer?.p,
    'price-desc': r => (r.offer ? -r.offer.p : undefined),
    score: r => { const v = score(r.model); return v === undefined ? undefined : -v; },
    power: r => r.model.s.max_power_w as number | undefined,
    value: r => { const v = value(r); return v === undefined ? undefined : -v; },
  });
  const isHidden = (r: Row) => r.status === 'fail' && selection[category]?.id !== r.model.id;
  const filtered = hideIncompatible ? matching.filter(r => !isHidden(r)) : matching;
  const hidden = matching.filter(isHidden).length; // 只算符合搜尋條件、因不相容而隱藏的數量

  return (
    <section className="candidates" aria-label={`${CATEGORY_LABEL[category]}候選清單`}>
      <div className="candidates-toolbar">
        <h2>{CATEGORY_LABEL[category]}</h2>
        <input
          type="search"
          placeholder="搜尋型號、規格（如 4070、AM5、ITX）"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          aria-label="搜尋"
        />
        <label className="toggle">
          <input type="checkbox" checked={hideIncompatible} onChange={e => setHideIncompatible(e.target.checked)} />
          隱藏不相容（{hidden}）
        </label>
        <label className="toggle">
          排序
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)}>
            {sorts.map(k => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
        </label>
        {onCompare && <button type="button" className="link" onClick={onCompare}>規格對決</button>}
      </div>
      <div className="candidate-filters" role="group" aria-label="篩選">
        {brandOptions.length > 1 && (brandOptions.length <= BRAND_CHIPS ? (
          <span className="chip-group" role="group" aria-label="品牌">
            {brandOptions.map(([b, n]) => (
              <button type="button" key={b} className="chip" aria-pressed={brands.includes(b)} onClick={() => toggle(setBrands, b)}>
                {b}<span className="chip-count">{n}</span>
              </button>
            ))}
          </span>
        ) : (
          <label className="toggle">
            <span className="visually-hidden">品牌</span>
            <select value={brands[0] ?? ''} onChange={e => { setBrands(e.target.value ? [e.target.value] : []); setLimit(PAGE); }}>
              <option value="">全部品牌</option>
              {brandOptions.map(([b, n]) => <option key={b} value={b}>{b}（{n}）</option>)}
            </select>
          </label>
        ))}
        {socketOptions.length > 1 && (
          <span className="chip-group" role="group" aria-label="腳位">
            {socketOptions.map(([s, n]) => (
              <button type="button" key={s} className="chip" aria-pressed={sockets.includes(s)} onClick={() => toggle(setSockets, s)}>
                {s}<span className="chip-count">{n}</span>
              </button>
            ))}
          </span>
        )}
        {isCpu && (
          <span className="chip-group" role="group" aria-label="條件">
            {CPU_FLAGS.map(f => (
              <button type="button" key={f.id} className="chip" aria-pressed={flags.includes(f.id)} onClick={() => toggle(setFlags, f.id)}>
                {f.label}
              </button>
            ))}
          </span>
        )}
        {filtering && (
          <button type="button" className="link" onClick={() => { setBrands([]); setSockets([]); setFlags([]); }}>清除篩選</button>
        )}
      </div>
      {onStartWithCase && (
        <p className="candidates-tip">
          想組小機殼（ITX）？建議先選機殼，其他零件會依它的顯卡長度、散熱器高度與電源規格自動篩選。
          <button className="link" onClick={onStartWithCase}>先選機殼</button>
        </p>
      )}
      <p className="candidates-count">
        {filtered.length} 個型號{filtered.length > limit ? `，顯示前 ${limit} 個` : ''}
        {category === 'cpu' && (
          <>。耗電為原廠標示的最大功耗（AMD PPT／Intel PL2）{cpuBench && `；算力為 Blender ${cpuBench.v} 多核心算圖分數的中位數（Blender Open Data），不代表遊戲效能`}</>
        )}
      </p>
      <ul className="candidate-list">
        {filtered.slice(0, limit).map(r => {
          const picked = selection[category]?.id === r.model.id;
          return (
            <li key={r.model.id}>
              <button
                className={`candidate status-${r.status} ${picked ? 'is-picked' : ''}`}
                aria-pressed={picked}
                onClick={() => onPick(r.model)}
              >
                <span className="candidate-main">
                  <span className="candidate-name">
                    {modelName(r.model)}
                    {r.model.r === 'd' && <span className="tag tag-warn">規格衝突待確認</span>}
                    {r.model.r === 'v' && <span className="tag tag-ok">已人工確認</span>}
                  </span>
                  <span className="candidate-specs">{specSummary(r.model) || '規格未確認'}</span>
                  {isCpu && <CpuStats model={r.model} bench={cpuBench} top={topScore} value={sort === 'value' ? value(r) : undefined} />}
                  {r.checks.map((c, i) => (
                    <span key={i} className={`candidate-note status-${c.status}`}>{checkText(c)}</span>
                  ))}
                  {r.deadEnds.length > 0 && (
                    <span className="candidate-note status-fail">
                      選了之後將沒有相容的{r.deadEnds.map(c => CATEGORY_LABEL[c]).join('、')}
                    </span>
                  )}
                </span>
                <span className="candidate-side">
                  <span className="candidate-price">{r.offer ? formatPrice(r.offer.p) : '無報價'}</span>
                  {r.trend?.change ? (
                    <span className={`price-trend ${r.trend.change < 0 ? 'down' : 'up'}`} title="與 7 天前相比">
                      {r.trend.change < 0 ? '↓' : '↑'}{formatPrice(Math.abs(r.trend.change))}
                      <span className="visually-hidden">（與 7 天前相比）</span>
                    </span>
                  ) : null}
                  {r.status !== 'pass' && <span className={`badge status-${r.status}`}>{STATUS_LABEL[r.status]}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {filtered.length > limit && (
        <button className="more" onClick={() => setLimit(l => l + PAGE)}>顯示更多</button>
      )}
    </section>
  );
}

/** CPU 候選的算力與耗電 */
function CpuStats({ model, bench, top, value }: { model: Model; bench?: CpuBench; top: number; value?: number }) {
  const score = bench?.m[model.id]?.[0];
  const power = model.s.max_power_w as number | undefined;
  if (!bench && power === undefined) return null;
  return (
    <span className="candidate-stats">
      {bench && (
        <span className="stat">
          算力{' '}
          {score !== undefined ? (
            <>
              <strong>{Math.round(score).toLocaleString('zh-TW')}</strong>
              <span className="stat-bar" aria-hidden="true"><span style={{ width: `${top ? Math.round((score / top) * 100) : 0}%` }} /></span>
            </>
          ) : '樣本不足'}
        </span>
      )}
      {power !== undefined && <span className="stat">耗電 <strong>{power} W</strong></span>}
      {value !== undefined && <span className="stat">每千元算力 <strong>{value.toFixed(1)}</strong></span>}
    </span>
  );
}

/** 值與出現次數，依次數多到少（同數依名稱） */
function countBy(values: (string | undefined)[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-TW'));
}

/** 依選的排序方式重排；不相容的仍放最後，沒有該數值的排在有數值的後面 */
function sortRows(rows: Row[], sort: SortKey, keys: Record<Exclude<SortKey, 'default'>, (r: Row) => number | undefined>): Row[] {
  if (sort === 'default') return rows;
  const key = keys[sort];
  return [...rows].sort((a, b) => {
    const fail = (a.status === 'fail' ? 1 : 0) - (b.status === 'fail' ? 1 : 0);
    if (fail) return fail;
    const x = key(a), y = key(b);
    if (x === undefined || y === undefined) return (x === undefined ? 1 : 0) - (y === undefined ? 1 : 0);
    return x - y;
  });
}
