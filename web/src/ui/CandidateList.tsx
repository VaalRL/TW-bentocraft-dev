import { useMemo, useState } from 'react';
import { buildChecks, constraintInvolves } from '../engine/constraints';
import { deadEndChecker, pairChecks, worst } from '../engine/engine';
import { lowestUnconditional, priceTrend, type PriceTrend } from '../engine/pricing';
import type { Category, Check, CpuBench, Model, Offer, PriceHistory, Selection, Status } from '../engine/types';
import { CaseThumb } from './CaseThumb';
import { FACETS, SORTS, facetOptions, matches, thresholdSteps, type SortContext, type SortDef } from './filters';
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
/** 選項不超過這個數量時用按鈕（可複選），否則用下拉選單 */
const CHIP_MAX = 8;

const PRICE_SORTS: SortDef[] = [
  { id: 'price', label: '價格低到高', key: (_, c) => c.price },
  { id: 'price-desc', label: '價格高到低', key: (_, c) => c.price, desc: true },
];

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
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState('default');
  // 篩選列在窄螢幕預設收合，避免把清單擠到畫面下方
  const [showFilters, setShowFilters] = useState(() => {
    try { return window.matchMedia('(min-width: 701px)').matches; } catch { return true; }
  });

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
  const facets = FACETS[category];
  const context = (r: Row): SortContext => ({ price: r.offer?.p, score: cpuBench?.m[r.model.id]?.[0] });
  // 沒有任何型號有數值的排序方式不列出（例如沒有跑分資料時的算力排序）
  const sorts = useMemo(
    () => [...PRICE_SORTS, ...SORTS[category]].filter(s => rows.some(r => s.key(r.model, context(r)) !== undefined)),
    [category, rows, cpuBench],
  );
  const sortDef = sorts.find(s => s.id === sort);
  const active = Object.values(selected).filter(v => v.length).length;
  const filtering = active > 0;
  const update = (id: string, values: string[]) => {
    setSelected(s => ({ ...s, [id]: values }));
    setLimit(PAGE);
  };
  const toggle = (id: string, value: string) => {
    const cur = selected[id] ?? [];
    update(id, cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value]);
  };

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matching = sortRows(rows.filter(r => {
    const hay = `${modelName(r.model)} ${specSummary(r.model)}`.toLowerCase();
    return terms.every(t => hay.includes(t)) && matches(r.model, facets, selected);
  }), sortDef ? r => sortDef.key(r.model, context(r)) : undefined, sortDef?.desc);
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
          <select value={sort} onChange={e => setSort(e.target.value)}>
            <option value="default">相容優先</option>
            {sorts.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <button type="button" className="filter-toggle" aria-expanded={showFilters} aria-controls={`filters-${category}`} onClick={() => setShowFilters(v => !v)}>
          篩選{active ? `（${active}）` : ''}
        </button>
        {onCompare && <button type="button" className="link" onClick={onCompare}>規格對決</button>}
      </div>
      <div className="candidate-filters" role="group" aria-label="篩選" id={`filters-${category}`} hidden={!showFilters}>
        {facets.map(f => {
          if (f.kind === 'group') {
            const options = facetOptions(f, models);
            if (options.length < 2) return null;
            const sel = selected[f.id] ?? [];
            return options.length <= CHIP_MAX ? (
              <span key={f.id} className="chip-group" role="group" aria-label={f.label}>
                <span className="chip-label" aria-hidden="true">{f.label}</span>
                {options.map(o => (
                  <button type="button" key={o.value} className="chip" aria-pressed={sel.includes(o.value)} onClick={() => toggle(f.id, o.value)}>
                    {o.label}<span className="chip-count">{o.count}</span>
                  </button>
                ))}
              </span>
            ) : (
              <label key={f.id} className="filter-select">
                <span className="chip-label">{f.label}</span>
                <select value={sel[0] ?? ''} onChange={e => update(f.id, e.target.value ? [e.target.value] : [])}>
                  <option value="">不限</option>
                  {options.map(o => <option key={o.value} value={o.value}>{o.label}（{o.count}）</option>)}
                </select>
              </label>
            );
          }
          if (f.kind === 'min' || f.kind === 'max') {
            const steps = thresholdSteps(f, models);
            if (!steps.length) return null;
            return (
              <label key={f.id} className="filter-select">
                <span className="chip-label">{f.label}</span>
                <select value={selected[f.id]?.[0] ?? ''} onChange={e => update(f.id, e.target.value ? [e.target.value] : [])}>
                  <option value="">不限</option>
                  {steps.map(s => <option key={s} value={s}>{f.kind === 'min' ? '至少' : '不超過'} {s.toLocaleString('zh-TW')}{f.unit}</option>)}
                </select>
              </label>
            );
          }
          return null;
        })}
        {(() => {
          // 條件按鈕：全部型號都符合或都不符合的條件不列出
          const flags = facets.filter((f): f is Extract<typeof f, { kind: 'flag' }> => f.kind === 'flag')
            .filter(f => { const n = models.filter(f.test).length; return n > 0 && n < models.length; });
          return flags.length > 0 && (
            <span className="chip-group" role="group" aria-label="條件">
              {flags.map(f => (
                <button type="button" key={f.id} className="chip" aria-pressed={!!selected[f.id]?.length} onClick={() => update(f.id, selected[f.id]?.length ? [] : ['1'])}>
                  {f.label}
                </button>
              ))}
            </span>
          );
        })()}
        {filtering && <button type="button" className="link" onClick={() => setSelected({})}>清除篩選</button>}
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
          const isCase = category === 'case';
          return (
            <li key={r.model.id} className={isCase ? 'has-photo' : undefined}>
              <button
                className={`candidate status-${r.status} ${picked ? 'is-picked' : ''} ${isCase ? 'has-thumb' : ''}`}
                aria-pressed={picked}
                onClick={() => onPick(r.model)}
              >
                {isCase && <CaseThumb model={r.model} />}
                <span className="candidate-main">
                  <span className="candidate-name">
                    {modelName(r.model)}
                    {r.model.r === 'd' && <span className="tag tag-warn">規格衝突待確認</span>}
                    {r.model.r === 'v' && <span className="tag tag-ok">已人工確認</span>}
                  </span>
                  <span className="candidate-specs">{specSummary(r.model) || '規格未確認'}</span>
                  {isCpu && <CpuStats model={r.model} bench={cpuBench} top={topScore} />}
                  {sortDef?.show && (() => {
                    const v = sortDef.key(r.model, context(r));
                    return v !== undefined && <span className="candidate-sortval">{sortDef.show(v)}</span>;
                  })()}
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
              {isCase && (
                <a className="candidate-photo" href={photoSearchUrl(r.model)} target="_blank" rel="noreferrer">
                  實品照片<span className="visually-hidden">：{modelName(r.model)}（圖片搜尋，另開視窗）</span>
                </a>
              )}
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
function CpuStats({ model, bench, top }: { model: Model; bench?: CpuBench; top: number }) {
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
    </span>
  );
}

/** 依排序鍵重排；不相容的仍放最後，沒有該數值的排在有數值的後面 */
function sortRows(rows: Row[], key: ((r: Row) => number | undefined) | undefined, desc = false): Row[] {
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    const fail = (a.status === 'fail' ? 1 : 0) - (b.status === 'fail' ? 1 : 0);
    if (fail) return fail;
    const x = key(a), y = key(b);
    if (x === undefined || y === undefined) return (x === undefined ? 1 : 0) - (y === undefined ? 1 : 0);
    return desc ? y - x : x - y;
  });
}

/** 實品照片：以型號名稱做圖片搜尋（本站不轉載商品照片） */
export const photoSearchUrl = (m: Model) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(modelName(m))}`;
