import { useEffect, useState } from 'react';
import { GLOSSARY_BY_ID, GROUP_LABEL, searchGlossary, type GlossaryGroup } from './glossary';

// 名詞解釋頁：網址 #/glossary，指定名詞時 #/glossary?t=<id>。

export const GLOSSARY_PREFIX = '#/glossary';

export function readGlossaryTerm(): string | null {
  const t = new URLSearchParams(location.hash.slice(GLOSSARY_PREFIX.length).replace(/^\?/, '')).get('t');
  return t && GLOSSARY_BY_ID.has(t) ? t : null;
}

export function Glossary({ focus }: { focus: string | null }) {
  const [query, setQuery] = useState('');
  const results = searchGlossary(query);
  const groups = (Object.keys(GROUP_LABEL) as GlossaryGroup[])
    .map(g => [g, results.filter(e => e.group === g)] as const)
    .filter(([, list]) => list.length);

  useEffect(() => {
    window.history.replaceState(null, '', `${location.pathname}${location.search}${GLOSSARY_PREFIX}${focus ? `?t=${focus}` : ''}`);
    if (focus) document.getElementById(`term-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus]);

  return (
    <section className="glossary" aria-labelledby="glossary-title">
      <h2 id="glossary-title">名詞解釋</h2>
      <p className="muted small">
        配單時常見的電腦零件名詞。使用滑鼠時，頁面上加了虛線底線的名詞停一下也會跳出說明。
      </p>
      <input type="search" className="glossary-search" placeholder="搜尋名詞（如 PCIe、冷排、DDR5）" aria-label="搜尋名詞"
        value={query} onChange={e => setQuery(e.target.value)} />
      {groups.length === 0 && <p className="muted">找不到符合的名詞。</p>}
      {groups.map(([g, list]) => (
        <section key={g} className="glossary-group" aria-labelledby={`glossary-${g}`}>
          <h3 id={`glossary-${g}`}>{GROUP_LABEL[g]}</h3>
          <dl>
            {list.map(e => (
              <div key={e.id} id={`term-${e.id}`} className={`glossary-entry ${focus === e.id ? 'is-focus' : ''}`}>
                <dt>{e.term}</dt>
                <dd>
                  <p>{e.short}</p>
                  {e.tip && <p className="glossary-tip">選購時注意：{e.tip}</p>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </section>
  );
}
