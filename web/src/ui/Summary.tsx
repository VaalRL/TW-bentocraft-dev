import { useState } from 'react';
import { estimateLoad, recommendedWattage } from '../engine/constraints';
import { selectionChecks, worst } from '../engine/engine';
import { priceSelection } from '../engine/pricing';
import { CATEGORIES, type Category, type Offer, type PricesData, type Selection, type Status } from '../engine/types';
import { CATEGORY_LABEL, STATUS_LABEL, checkText, copyText, formatDate, formatPrice, modelName } from './format';

const CONDITION_TEXT: Record<string, string> = {
  assembly: '整機組裝價',
  requires_category: '需搭配',
  unspecified: '附條件價格',
};

function conditionLabel(o: Offer): string {
  if (o.c?.t === 'requires_category') return `需搭配${(o.c.q ?? []).map(c => CATEGORY_LABEL[c]).join('、')}`;
  return CONDITION_TEXT[o.c?.t ?? ''] ?? '';
}

const ORDER: Status[] = ['fail', 'warn', 'unknown'];

export function Summary({ selection, offers, prices, assembly, onAssemblyChange, onRemove, onFocus }: {
  selection: Selection;
  offers: Map<string, Offer[]>;
  prices: PricesData;
  assembly: boolean;
  onAssemblyChange: (v: boolean) => void;
  onRemove: (c: Category) => void;
  onFocus: (c: Category) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const priced = priceSelection(selection, offers, { assembly });
  const checks = selectionChecks(selection).filter(c => c.status !== 'pass');
  const overall = worst(checks);
  const load = estimateLoad(selection);
  const picked = CATEGORIES.filter(c => selection[c]);

  const flash = async (text: string, label: string) => {
    setCopied((await copyText(text)) ? label : '複製失敗');
    setTimeout(() => setCopied(null), 2000);
  };

  const pttText = () => {
    const lines = ['已選配備清單（由 原價煮便當 TW-bentocraft 產出，非官方）：', '='.repeat(40)];
    for (const cat of picked) {
      const item = priced.items.find(i => i.category === cat)!;
      const label = CATEGORY_LABEL[cat].padEnd(4, '　');
      lines.push(`【${label}】${modelName(selection[cat]!)}  ${item.offer ? formatPrice(item.offer.p) : '無報價'}`);
    }
    lines.push('='.repeat(40));
    lines.push(`【總金額】NT${formatPrice(priced.total)}（原價屋 ${formatDate(prices.fetched_at)} 報價）`);
    if (priced.discount) lines.push(`【任搭折抵】-${formatPrice(priced.discount)}`);
    lines.push(`【預估功耗】${load === null ? '功耗資料未確認' : `${load} W，建議 ${recommendedWattage(load)} W 以上`}`);
    const counts = ORDER.map(s => [s, checks.filter(c => c.status === s).length] as const).filter(([, n]) => n);
    lines.push(`【相容性】${counts.length ? counts.map(([s, n]) => `${STATUS_LABEL[s]} ${n} 項`).join('、') : '全部通過'}`);
    lines.push(`【線上配單】${location.href}`);
    return lines.join('\n');
  };

  return (
    <aside className="summary" id="summary" aria-label="估價單">
      <h2>估價單</h2>
      {picked.length === 0 ? (
        <p className="muted">從左側選擇零件開始配單。可以從任何類別開始，不相容的選項會自動標示。</p>
      ) : (
        <ul className="summary-items">
          {picked.map(cat => {
            const m = selection[cat]!;
            const item = priced.items.find(i => i.category === cat)!;
            return (
              <li key={cat}>
                <button className="summary-cat link" onClick={() => onFocus(cat)}>{CATEGORY_LABEL[cat]}</button>
                <span className="summary-name">{modelName(m)}</span>
                <span className="summary-price">{item.offer ? formatPrice(item.offer.p) : '無報價'}</span>
                <button className="remove" onClick={() => onRemove(cat)} aria-label={`移除${CATEGORY_LABEL[cat]}`}>×</button>
                {item.offer?.x && <span className="summary-note">此價格為組合價，含：{item.offer.x.join('、')}</span>}
                {item.offer?.g && <span className="summary-note">贈品：{item.offer.g}</span>}
                {item.offer?.u && <span className="summary-note">限時價至 {formatDate(item.offer.u)}</span>}
                {item.conditional.map((o, i) => (
                  <span key={i} className="summary-note">
                    另有 {formatPrice(o.p)}（{conditionLabel(o)}），條件未成立未採用
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
      )}

      {picked.length > 0 && (
        <div className="summary-total">
          <div><span>小計</span><span>{formatPrice(priced.subtotal)}</span></div>
          {priced.discount > 0 && <div><span>任搭折抵</span><span>-{formatPrice(priced.discount)}</span></div>}
          <div className="grand"><span>總計</span><span>{formatPrice(priced.total)}</span></div>
          {priced.missing.length > 0 && (
            <p className="muted">未計入：{priced.missing.map(c => CATEGORY_LABEL[c]).join('、')}（無可用報價）</p>
          )}
          <label className="toggle">
            <input type="checkbox" checked={assembly} onChange={e => onAssemblyChange(e.target.checked)} />
            整機在原價屋組裝（套用組裝價）
          </label>
        </div>
      )}

      {picked.length > 0 && (
        <div className="summary-checks">
          <h3>
            相容性
            <span className={`badge status-${overall}`}>{overall === 'pass' ? '全部通過' : STATUS_LABEL[overall]}</span>
          </h3>
          <p className="muted">
            預估功耗：{load === null ? 'CPU 或顯卡功耗資料未確認' : `${load} W，建議電源 ${recommendedWattage(load)} W 以上`}
          </p>
          <ul>
            {ORDER.flatMap(s => checks.filter(c => c.status === s)).map((c, i) => (
              <li key={i} className={`check status-${c.status}`}>
                <span className={`badge status-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                {checkText(c)}
              </li>
            ))}
          </ul>
          <p className="muted small">「未確認」表示規格庫缺少判斷所需的資料，不代表不相容。</p>
        </div>
      )}

      {picked.length > 0 && (
        <div className="summary-actions">
          <button className="primary" onClick={() => flash(location.href, '已複製分享連結')}>複製分享連結</button>
          <button onClick={() => flash(pttText(), '已複製 PTT 格式')}>複製 PTT 格式</button>
          {copied && <span className="copied" role="status">{copied}</span>}
        </div>
      )}

      {picked.length > 0 && (
        <a className="mobile-bar" href="#summary">
          <span>{picked.length} 件 · {formatPrice(priced.total)}</span>
          <span className={`badge status-${overall}`}>{overall === 'pass' ? '相容' : STATUS_LABEL[overall]}</span>
        </a>
      )}
    </aside>
  );
}
