import { Fragment, useEffect, useRef, useState } from 'react';
import { GLOSSARY_BY_ID, annotate } from './glossary';

// 名詞標註與電腦版懸停說明。
// 標註只是加上 data-term 的文字，不是可點的元素，所以也能放在整列都是按鈕的候選清單裡；
// 只有滑鼠裝置會顯示底線與說明框，手機與鍵盤使用者改看名詞解釋頁。

/** 自動標註文字中的名詞（同一段文字中每個名詞只標第一次出現） */
export function Annotated({ text }: { text: string }) {
  return (
    <>
      {annotate(text).map((s, i) =>
        s.term ? <span key={i} className="term" data-term={s.term}>{s.text}</span> : <Fragment key={i}>{s.text}</Fragment>,
      )}
    </>
  );
}

const SHOW_DELAY = 300;
const HIDE_DELAY = 200;

/** 全站共用的懸停說明框；只在有滑鼠的裝置啟用 */
export function TermHover({ onMore }: { onMore: (id: string) => void }) {
  const [state, setState] = useState<{ id: string; x: number; y: number; above: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    } catch {
      return;
    }
    const schedule = (fn: () => void, ms: number) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(fn, ms);
    };
    const over = (e: MouseEvent) => {
      if (!mq.matches) return;
      const target = e.target as Element;
      if (box.current?.contains(target)) return schedule(() => {}, 0); // 移進說明框時保持顯示
      const el = target.closest<HTMLElement>('[data-term]');
      if (!el) return;
      schedule(() => {
        const r = el.getBoundingClientRect();
        const above = r.bottom + 180 > window.innerHeight && r.top > 200;
        setState({ id: el.dataset.term!, x: r.left + r.width / 2, y: above ? r.top : r.bottom, above });
      }, SHOW_DELAY);
    };
    const out = (e: MouseEvent) => {
      const from = e.target as Element;
      if (!from.closest('[data-term]') && !box.current?.contains(from)) return;
      const to = e.relatedTarget as Element | null;
      if (to && (box.current?.contains(to) || to.closest?.('[data-term]') === from.closest('[data-term]'))) return;
      schedule(() => setState(null), HIDE_DELAY);
    };
    const close = () => { window.clearTimeout(timer.current); setState(null); };
    // 捲動時只收起已顯示的說明框；位置在顯示當下才計算，等待中的顯示不必取消
    const hide = () => setState(null);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mouseover', over);
    document.addEventListener('mouseout', out);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('mouseover', over);
      document.removeEventListener('mouseout', out);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', hide, true);
      window.clearTimeout(timer.current);
    };
  }, []);

  // 說明框不超出視窗左右
  useEffect(() => {
    const el = box.current;
    if (!el || !state) return;
    const w = el.offsetWidth;
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, state.x - w / 2))}px`;
  }, [state]);

  const entry = state && GLOSSARY_BY_ID.get(state.id);
  if (!state || !entry) return null;
  return (
    <div
      ref={box}
      className={`term-pop ${state.above ? 'is-above' : ''}`}
      role="tooltip"
      style={{ top: state.above ? undefined : state.y + 6, bottom: state.above ? window.innerHeight - state.y + 6 : undefined }}
    >
      <strong className="term-pop-title">{entry.term}</strong>
      <p>{entry.short}</p>
      {entry.tip && <p className="term-pop-tip">選購時注意：{entry.tip}</p>}
      <button type="button" className="link" onClick={() => { setState(null); onMore(entry.id); }}>在名詞解釋頁查看</button>
    </div>
  );
}
