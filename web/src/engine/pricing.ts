// 總價計算：附條件價格與任搭折抵（見 07 第五節、03 第一節第 3 點）。
import type { Category, Offer, PriceHistory, PricesData, Selection } from './types';

export interface PriceOptions {
  /** 使用者勾選「整機在原價屋組裝」時，組裝價（~組裝價~）才成立 */
  assembly: boolean;
}

export interface PricedItem {
  category: Category;
  offer: Offer | null; // 實際採用的報價；沒有可用報價時為 null
  conditional: Offer[]; // 條件不成立而未採用、但更便宜的報價（供介面提示）
  discount: number; // 任搭折抵
}

export function indexOffers(prices: PricesData): Map<string, Offer[]> {
  const map = new Map<string, Offer[]>();
  for (const o of prices.offers) {
    const list = map.get(o.m) ?? [];
    list.push(o);
    map.set(o.m, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.p - b.p);
  return map;
}

export function conditionMet(o: Offer, sel: Selection, opts: PriceOptions): boolean {
  if (!o.c) return true;
  if (o.c.t === 'assembly') return opts.assembly;
  if (o.c.t === 'requires_category') return (o.c.q ?? []).every(cat => !!sel[cat]);
  return false; // unspecified：條件不明，不自動套用
}

export interface PriceTrend {
  low: number; // 近 days 天的最低價
  days: number;
  change: number | null; // 與 7 天前相比（負數為降價）；7 天前沒有報價時為 null
}

/** 價格走勢。只適用於不附條件的價格（歷史記錄的是清單顯示的價格）。 */
export function priceTrend(history: PriceHistory | undefined, id: string, current: Offer | null): PriceTrend | null {
  const h = history?.m[id];
  if (!h || !current || current.c) return null;
  return { low: h[0], days: history!.days, change: h[1] === null ? null : current.p - h[1] };
}

/** 單一型號可採用的最低價（不看配單時用於清單顯示）。 */
export function lowestUnconditional(offers: Offer[] | undefined): Offer | null {
  return offers?.find(o => !o.c) ?? null;
}

export function priceSelection(sel: Selection, offers: Map<string, Offer[]>, opts: PriceOptions) {
  const items: PricedItem[] = [];
  const count = Object.values(sel).filter(Boolean).length;
  for (const [cat, model] of Object.entries(sel) as [Category, NonNullable<Selection[Category]>][]) {
    const list = offers.get(model.id) ?? [];
    const usable = list.filter(o => conditionMet(o, sel, opts));
    const offer = usable[0] ?? null;
    const conditional = list.filter(o => !conditionMet(o, sel, opts) && (!offer || o.p < offer.p));
    // 「任搭」：與其他零件一起購買時再折抵，整單至少兩件才成立
    const discount = offer?.d && count >= 2 ? offer.d : 0;
    items.push({ category: cat, offer, conditional, discount });
  }
  const subtotal = items.reduce((s, i) => s + (i.offer?.p ?? 0), 0);
  const discount = items.reduce((s, i) => s + i.discount, 0);
  const missing = items.filter(i => !i.offer).map(i => i.category);
  return { items, subtotal, discount, total: subtotal - discount, missing };
}
