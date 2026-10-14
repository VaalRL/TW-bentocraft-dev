import { useEffect, useMemo, useState } from 'react';
import { indexOffers } from './engine/pricing';
import { decodeShare, encodeShare } from './engine/share';
import { CATEGORIES, toModels, type CatalogData, type Category, type Model, type PricesData, type Selection } from './engine/types';
import { CandidateList } from './ui/CandidateList';
import { CategoryNav } from './ui/CategoryNav';
import { Header } from './ui/Header';
import { REPO } from './ui/report';
import { Summary } from './ui/Summary';

export type Picks = Partial<Record<Category, { id: string; variant?: string }>>;

interface Data {
  models: Record<string, Model>;
  redirects: Record<string, string>;
  byCategory: Record<Category, Model[]>;
  prices: PricesData;
}

const SHARE_PREFIX = '#/build?b=';

async function loadData(): Promise<Data> {
  const base = import.meta.env.BASE_URL;
  const [catalog, prices] = await Promise.all([
    fetch(`${base}data/catalog.min.json`).then(r => (r.ok ? (r.json() as Promise<CatalogData>) : Promise.reject(r.status))),
    fetch(`${base}data/prices.min.json`).then(r =>
      r.ok ? (r.json() as Promise<PricesData>) : ({ fetched_at: null, status: 'missing', vendor: 'coolpc', offers: [] } as PricesData),
    ),
  ]);
  const models = toModels(catalog);
  const byCategory = Object.fromEntries(CATEGORIES.map(c => [c, [] as Model[]])) as Record<Category, Model[]>;
  for (const m of Object.values(models)) byCategory[m.c].push(m);
  return { models, redirects: catalog.redirects, byCategory, prices };
}

export function App() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<Picks>({});
  const [missingShared, setMissingShared] = useState<string[]>([]);
  const [active, setActive] = useState<Category>('cpu');
  const [assembly, setAssembly] = useState(false);
  const [cleared, setCleared] = useState<Picks | null>(null); // 清空前的配單，供復原

  useEffect(() => {
    loadData()
      .then(d => {
        setData(d);
        // 讀取分享連結：已棄用的型號依 redirects 轉址，找不到的列出來提示
        if (location.hash.startsWith(SHARE_PREFIX)) {
          const decoded = decodeShare(location.hash.slice(SHARE_PREFIX.length), id => {
            const target = d.redirects[id] ?? id;
            return d.models[target] ? target : undefined;
          });
          if (decoded) {
            const restored: Picks = {};
            for (const [cat, ref] of Object.entries(decoded.items) as [Category, string][]) {
              const [id, variant] = ref.split('#');
              restored[cat] = { id, variant };
            }
            setPicks(restored);
            setMissingShared(decoded.missing);
          }
        }
      })
      .catch(() => setError('資料載入失敗，請稍後再試。'));
  }, []);

  // 配單變動時同步更新網址，網址本身就是分享連結
  useEffect(() => {
    if (!data) return;
    const items = Object.fromEntries(
      Object.entries(picks).map(([cat, p]) => [cat, p!.variant ? `${p!.id}#${p!.variant}` : p!.id]),
    );
    const hash = Object.keys(items).length ? SHARE_PREFIX + encodeShare(items) : '';
    history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  }, [picks, data]);

  const selection: Selection = useMemo(() => {
    if (!data) return {};
    const sel: Selection = {};
    for (const [cat, p] of Object.entries(picks) as [Category, { id: string }][]) {
      const m = data.models[p.id];
      if (m) sel[cat] = m;
    }
    return sel;
  }, [picks, data]);

  const offers = useMemo(() => (data ? indexOffers(data.prices) : new Map()), [data]);

  if (error) return <div className="state-message">{error}</div>;
  if (!data) return <div className="state-message">載入規格庫與報價中…</div>;

  const pick = (m: Model) => {
    setCleared(null);
    setPicks(p => ({ ...p, [m.c]: { id: m.id } }));
  };
  const reset = () => {
    setCleared(picks);
    setPicks({});
  };
  const undoReset = () => {
    if (cleared) setPicks(cleared);
    setCleared(null);
  };
  const unpick = (cat: Category) =>
    setPicks(p => {
      const next = { ...p };
      delete next[cat];
      return next;
    });

  return (
    <div className="app">
      <Header prices={data.prices} />
      {missingShared.length > 0 && (
        <div className="banner banner-warn" role="status">
          分享連結中有 {missingShared.length} 個零件已不在規格庫中，已略過。
          <button className="link" onClick={() => setMissingShared([])}>知道了</button>
        </div>
      )}
      <main className="workspace">
        <CategoryNav active={active} onSelect={setActive} selection={selection} />
        <CandidateList
          key={active}
          category={active}
          models={data.byCategory[active]}
          catalog={data.byCategory}
          selection={selection}
          offers={offers}
          history={data.prices.h}
          onPick={pick}
          onStartWithCase={Object.keys(picks).length === 0 && active !== 'case' ? () => setActive('case') : undefined}
        />
        <Summary
          selection={selection}
          offers={offers}
          prices={data.prices}
          assembly={assembly}
          onAssemblyChange={setAssembly}
          onRemove={unpick}
          onReset={reset}
          onUndoReset={cleared ? undoReset : undefined}
          onFocus={setActive}
        />
      </main>
      <footer className="footer">
        本站為非官方開源專案，與原價屋、欣亞等通路無關；價格與規格僅供參考，以通路實際報價為準。
        <a href={`https://github.com/${REPO}`} target="_blank" rel="noreferrer">原始碼</a>
      </footer>
    </div>
  );
}
