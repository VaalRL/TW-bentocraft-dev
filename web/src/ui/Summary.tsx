import { useState } from 'react';
import { estimateLoad, recommendedWattage } from '../engine/constraints';
import { selectionChecks, worst } from '../engine/engine';
import { priceSelection, priceTrend } from '../engine/pricing';
import { FitDiagram } from './FitDiagram';
import { CATEGORIES, type Category, type Offer, type PricesData, type Selection, type Status } from '../engine/types';
import { CATEGORY_LABEL, STATUS_LABEL, checkText, copyText, formatDate, formatPrice, modelName } from './format';
import { checkReportUrl, specReportUrl } from './report';

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

function powerText(selection: Selection): string {
  if (!selection.cpu) return '尚未選擇 CPU';
  const load = estimateLoad(selection);
  if (load === null) return 'CPU 或顯卡功耗資料未確認';
  const text = `${load.watts} W，建議電源 ${recommendedWattage(load.watts)} W 以上`;
  return load.inferred ? `${text}（顯卡依晶片參考功耗推定，非公版超頻卡可能更高）` : text;
}

function PriceTrendNote({ trend, price }: { trend: ReturnType<typeof priceTrend>; price?: number }) {
  if (!trend || price === undefined) return null;
  return price <= trend.low
    ? <span className="summary-note price-low">近 {trend.days} 天最低價</span>
    : <span className="summary-note">近 {trend.days} 天最低 {formatPrice(trend.low)}</span>;
}

export function Summary({ selection, offers, prices, assembly, onAssemblyChange, onRemove, onReset, onUndoReset, onFocus }: {
  selection: Selection;
  offers: Map<string, Offer[]>;
  prices: PricesData;
  assembly: boolean;
  onAssemblyChange: (v: boolean) => void;
  onRemove: (c: Category) => void;
  onReset: () => void;
  /** 剛清空配單時才有值：恢復清空前的配單 */
  onUndoReset?: () => void;
  onFocus: (c: Category) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const priced = priceSelection(selection, offers, { assembly });
  const allChecks = selectionChecks(selection);
  const checks = allChecks.filter(c => c.status !== 'pass');
  const overall = worst(checks);
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
    lines.push(`【預估功耗】${powerText(selection)}`);
    const counts = ORDER.map(s => [s, checks.filter(c => c.status === s).length] as const).filter(([, n]) => n);
    lines.push(`【相容性】${counts.length ? counts.map(([s, n]) => `${STATUS_LABEL[s]} ${n} 項`).join('、') : '全部通過'}`);
    lines.push(`【線上配單】${location.href}`);
    return lines.join('\n');
  };

  return (
    <aside className="summary" id="summary" aria-label="估價單">
      <div className="summary-head">
        <h2>估價單</h2>
        {picked.length > 0 && <button className="link" onClick={onReset}>清空配單</button>}
      </div>
      {picked.length === 0 ? (
        onUndoReset ? (
          <p className="muted" role="status">
            已清空配單。<button className="link" onClick={onUndoReset}>復原</button>
          </p>
        ) : (
          <p className="muted">從左側選擇零件開始配單。可以從任何類別開始，不相容的選項會自動標示。</p>
        )
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
                {item.offer?.v && m.v?.[item.offer.v] && (
                  <span className="summary-note">此價格為「{m.v[item.offer.v]}」款（各顏色中最低價）</span>
                )}
                {item.offer?.x && <span className="summary-note">此價格為組合價，含：{item.offer.x.join('、')}</span>}
                <PriceTrendNote trend={priceTrend(prices.h, m.id, item.offer)} price={item.offer?.p} />
                {item.offer?.g && <span className="summary-note">贈品：{item.offer.g}</span>}
                {item.offer?.u && <span className="summary-note">限時價至 {formatDate(item.offer.u)}</span>}
                {item.conditional.map((o, i) => (
                  <span key={i} className="summary-note">
                    另有 {formatPrice(o.p)}（{conditionLabel(o)}），條件未成立未採用
                  </span>
                ))}
                <a className="summary-note summary-report" href={specReportUrl(m.id, modelName(m))} target="_blank" rel="noreferrer">
                  回報規格錯誤
                </a>
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

      <FitDiagram selection={selection} checks={allChecks} />

      {picked.length > 0 && (
        <div className="summary-checks">
          <h3>
            相容性
            <span className={`badge status-${overall}`}>{overall === 'pass' ? '全部通過' : STATUS_LABEL[overall]}</span>
          </h3>
          <p className="muted">
            預估功耗：{powerText(selection)}
          </p>
          <ul>
            {ORDER.flatMap(s => checks.filter(c => c.status === s)).map((c, i) => (
              <li key={i} className={`check status-${c.status}`}>
                <span className={`badge status-${c.status}`}>{STATUS_LABEL[c.status]}</span>
                {checkText(c)}
              </li>
            ))}
          </ul>
          <p className="muted small">
            「未確認」表示規格庫缺少判斷所需的資料，不代表不相容。判斷有誤？
            {/* 配單連結在畫面更新後才寫入網址，所以點擊當下才讀取 */}
            <a href={checkReportUrl(location.href)} target="_blank" rel="noreferrer"
              onClick={e => { e.currentTarget.href = checkReportUrl(location.href); }}>回報</a>
          </p>
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
