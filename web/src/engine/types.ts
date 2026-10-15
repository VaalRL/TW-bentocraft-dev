// 對應 scripts/build_web_data.py 產生的前端精簡資料（規格庫原始格式見 schema/catalog.schema.json）

export const CATEGORIES = ['cpu', 'motherboard', 'ram', 'gpu', 'cooler', 'case', 'psu', 'ssd'] as const;
export type Category = (typeof CATEGORIES)[number];

export type Status = 'pass' | 'warn' | 'fail' | 'unknown';

/** 規格欄位的附加資訊：t=誤差、k=條件式上限 [值, 條件]、i=推定值 */
export interface SpecMeta {
  t?: number;
  k?: [number, string][];
  i?: 1;
}

export interface Model {
  id: string;
  c: Category;
  b: string; // 品牌
  n: string; // 型號名稱
  s: Record<string, unknown>; // 規格值
  x?: Record<string, SpecMeta>;
  r: 'a' | 'v' | 'd'; // 審查狀態：auto / verified / draft
  v?: Record<string, string>; // 變體 ID → 顯示名稱
  u?: string; // 規格出處（目前只有 CPU：原廠規格頁）
}

export interface CatalogData {
  models: Record<string, Omit<Model, 'id'>>;
  redirects: Record<string, string>;
}

export interface Offer {
  m: string; // 型號 ID
  p: number; // 現價
  v?: string; // 變體
  l?: number; // 原價
  d?: number; // 任搭折抵
  c?: { t: 'assembly' | 'requires_category' | 'unspecified'; q?: Category[] }; // 附條件價格
  g?: string; // 贈品
  u?: string; // 限時截止
  x?: string[]; // 組合列附帶的其他零件
}

export interface PricesData {
  fetched_at: string | null;
  status: 'ok' | 'stale' | 'missing';
  vendor: string;
  offers: Offer[];
  /** 價格歷史摘要（累積滿 7 天後才有）：型號 → [近 days 天最低價, 7 天前價格或 null] */
  h?: PriceHistory;
}

export interface PriceHistory {
  days: number;
  m: Record<string, [number, number | null]>;
}

export type Selection = Partial<Record<Category, Model>>;

export interface Check {
  constraint: string;
  status: Status;
  message: string;
  /** 判斷依賴推定值（source: inferred），介面需註明 */
  inferred?: boolean;
}

export function toModels(data: CatalogData): Record<string, Model> {
  const out: Record<string, Model> = {};
  for (const [id, m] of Object.entries(data.models)) out[id] = { id, ...m };
  return out;
}
