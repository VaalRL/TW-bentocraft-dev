// 原價煮便當 logo：俯視的便當盒，格子是主機板配置——飯格加梅子是 CPU、細長格是記憶體、底下長條是顯示卡。
// 網站標題列直接用這裡的 SVG；favicon、README 圖檔與社群預覽圖由 scripts/brand-assets.ts 產生。

/** 梅子紅：只用在 logo 圖案，不當介面顏色（避免跟「不相容」的紅色混淆） */
export const PLUM = '#d9381e';

function gpuPath(x: number, y: number, w: number, h: number, r: number, holes: number[], hr: number): string {
  const rect = `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`
    + `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  const cy = y + h / 2;
  return rect + holes.map(cx => `M${cx - hr} ${cy}a${hr} ${hr} 0 1 0 ${hr * 2} 0a${hr} ${hr} 0 1 0 ${-hr * 2} 0Z`).join('');
}

/**
 * logo 的 SVG 字串。ink 是線條色（預設跟著文字色），paper 是盒內底色。
 * small 是 favicon 用的簡化版：只留填色的大形狀，16px 也認得出來。
 */
export function logoSvg({ ink = 'currentColor', paper = 'none', size, small = false, label = '原價煮便當' }: {
  ink?: string; paper?: string; size?: number; small?: boolean; label?: string;
} = {}): string {
  const sz = size ? ` width="${size}" height="${size}"` : '';
  const a11y = label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"';
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${sz}${a11y}>`;
  if (small) {
    return open
      + `<rect x="4.5" y="9.5" width="55" height="45" rx="9" fill="${paper}" stroke="${ink}" stroke-width="5"/>`
      + `<circle cx="22" cy="26" r="9" fill="${PLUM}"/>`
      + `<rect x="38" y="16" width="5.5" height="20" rx="1.5" fill="${ink}"/>`
      + `<rect x="47" y="16" width="5.5" height="20" rx="1.5" fill="${ink}"/>`
      + `<rect x="11" y="41" width="42" height="8" rx="2.5" fill="${ink}"/>`
      + '</svg>';
  }
  return open
    + `<rect x="4" y="9" width="56" height="46" rx="9" fill="${paper}" stroke="${ink}" stroke-width="4"/>`
    + `<rect x="11" y="16" width="23" height="19" rx="3" fill="none" stroke="${ink}" stroke-width="2.6"/>`
    + `<circle cx="22.5" cy="25.5" r="6" fill="${PLUM}"/>`
    + [38.5, 45, 51.5].map(x => `<rect x="${x}" y="16" width="3" height="19" rx="1.2" fill="none" stroke="${ink}" stroke-width="2.4"/>`).join('')
    + `<path fill-rule="evenodd" fill="${ink}" d="${gpuPath(11, 40, 42, 9, 2.5, [21, 32, 43], 3)}"/>`
    + '</svg>';
}
