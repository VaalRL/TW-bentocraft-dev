// 分享連結：只存型號 ID（與變體），帶版本號；載入時依 redirects 轉址（見 03 第二節）。
import LZString from 'lz-string';
import type { Category } from './types';

interface SharePayload {
  v: 1;
  items: Partial<Record<Category, string>>; // 類別 → 型號 ID，可帶 #變體
}

export function encodeShare(items: Partial<Record<Category, string>>): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, items } satisfies SharePayload));
}

export function decodeShare(
  compressed: string,
  resolve: (id: string) => string | undefined,
): { items: Partial<Record<Category, string>>; missing: string[] } | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(compressed);
    const payload = json ? (JSON.parse(json) as SharePayload) : null;
    if (!payload || payload.v !== 1 || typeof payload.items !== 'object') return null;
    const items: Partial<Record<Category, string>> = {};
    const missing: string[] = [];
    for (const [cat, ref] of Object.entries(payload.items) as [Category, string][]) {
      const [id, variant] = String(ref).split('#');
      const resolved = resolve(id);
      if (resolved) items[cat] = variant ? `${resolved}#${variant}` : resolved;
      else missing.push(id);
    }
    return { items, missing };
  } catch {
    return null;
  }
}
