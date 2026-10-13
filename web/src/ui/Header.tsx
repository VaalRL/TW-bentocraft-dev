import { useEffect, useState } from 'react';
import type { PricesData } from '../engine/types';
import { daysSince, formatDate } from './format';

const REPO = 'VaalRL/TW-bentocraft';

/** GitHub Star 數。取不到（離線、API 次數用完）時不顯示，不影響其他功能。 */
function useStars(): number | null {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`https://api.github.com/repos/${REPO}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(d => typeof d?.stargazers_count === 'number' && setStars(d.stargazers_count))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);
  return stars;
}

function readTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function Header({ prices }: { prices: PricesData }) {
  const [theme, setTheme] = useState(readTheme);
  const stars = useStars();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // 無痕模式等情況下無法寫入，僅本次有效
    }
  }, [theme]);

  const age = daysSince(prices.fetched_at);
  const stale = prices.status === 'stale' || (age !== null && age >= 2);

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-name">原價煮便當</span>
        <span className="brand-sub">TW-bentocraft · 原價屋報價相容性配單</span>
      </div>
      <div className={`report-date ${stale ? 'is-stale' : ''}`} title={prices.status === 'stale' ? '最近一次更新失敗，沿用舊報價' : undefined}>
        {prices.status === 'missing'
          ? '尚無報價資料'
          : `原價屋報價：${formatDate(prices.fetched_at)}${stale ? '（可能已變動）' : ''}`}
      </div>
      <div className="header-actions">
        <button
          className="icon-button"
          onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
          aria-label={theme === 'dark' ? '切換為淺色模式' : '切換為深色模式'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <a
          className={`icon-button ${stars === null ? '' : 'has-count'}`}
          href={`https://github.com/${REPO}`}
          target="_blank"
          rel="noreferrer"
          aria-label={stars === null ? 'GitHub 原始碼' : `GitHub 原始碼，${stars} 顆星`}
        >
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
            <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          {stars !== null && <span className="star-count" aria-hidden="true">★ {stars}</span>}
        </a>
      </div>
    </header>
  );
}
