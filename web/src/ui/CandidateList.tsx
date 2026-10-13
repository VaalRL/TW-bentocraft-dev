import { useMemo, useState } from 'react';
import { buildChecks, constraintInvolves } from '../engine/constraints';
import { deadEndChecker, pairChecks, worst } from '../engine/engine';
import { lowestUnconditional } from '../engine/pricing';
import type { Category, Check, Model, Offer, Selection, Status } from '../engine/types';
import { CATEGORY_LABEL, STATUS_LABEL, checkText, formatPrice, modelName, specSummary } from './format';

interface Row {
  model: Model;
  status: Status;
  checks: Check[];
  deadEnds: Category[];
  offer: Offer | null;
}

const ORDER: Record<Status, number> = { pass: 0, unknown: 1, warn: 2, fail: 3 };
const PAGE = 60;

export function CandidateList({ category, models, catalog, selection, offers, onPick }: {
  category: Category;
  models: Model[];
  catalog: Record<Category, Model[]>;
  selection: Selection;
  offers: Map<string, Offer[]>;
  onPick: (m: Model) => void;
}) {
  const [query, setQuery] = useState('');
  const [hideIncompatible, setHideIncompatible] = useState(true);
  const [limit, setLimit] = useState(PAGE);

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
        return { model, status, checks, deadEnds: status === 'fail' ? [] : deadEnds(model), offer: lowestUnconditional(offers.get(model.id)) };
      })
      .sort((a, b) =>
        (ORDER[a.status] + (a.deadEnds.length ? 2.5 : 0)) - (ORDER[b.status] + (b.deadEnds.length ? 2.5 : 0)) ||
        (a.offer ? 0 : 1) - (b.offer ? 0 : 1) ||
        (a.offer?.p ?? 0) - (b.offer?.p ?? 0) ||
        modelName(a.model).localeCompare(modelName(b.model), 'zh-TW'),
      );
  }, [category, models, catalog, selection, offers]);

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matching = rows.filter(r => {
    const hay = `${modelName(r.model)} ${specSummary(r.model)}`.toLowerCase();
    return terms.every(t => hay.includes(t));
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
      </div>
      <p className="candidates-count">
        {filtered.length} 個型號{filtered.length > limit ? `，顯示前 ${limit} 個` : ''}
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
