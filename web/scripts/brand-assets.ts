// 產生品牌圖檔：favicon、apple-touch-icon、README 用的 logo（淺色／深色）與社群預覽圖 og.png。
// 執行：npm run brand（需要 Playwright 的 Chromium）。
// 社群預覽圖的字型用 Noto Sans TC：先 `npm install --no-save @fontsource/noto-sans-tc`，
// 或以 FONTSOURCE_DIR 指向 @fontsource/noto-sans-tc 的資料夾；找不到時改用系統字型並提示。
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { logoSvg } from '../src/brand/logo.ts';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(web, '..');
const INK = '#1c1917', INK_DARK = '#fafaf9', BRAND = '#3730a3';

writeFileSync(join(web, 'public/favicon.svg'), logoSvg({ ink: INK, paper: '#ffffff', small: true }) + '\n');
writeFileSync(join(repo, 'docs/logo.svg'), logoSvg({ ink: INK }) + '\n');
writeFileSync(join(repo, 'docs/logo-dark.svg'), logoSvg({ ink: INK_DARK }) + '\n');

const fontDir = [process.env.FONTSOURCE_DIR, join(web, 'node_modules/@fontsource/noto-sans-tc')].find(d => d && existsSync(d));
if (!fontDir) console.warn('找不到 @fontsource/noto-sans-tc，og.png 改用系統字型');
const fonts = fontDir ? [400, 700, 900].map(w => `<link rel="stylesheet" href="file://${fontDir}/${w}.css">`).join('') : '';

const og = `<!doctype html><html><head><meta charset="utf-8">${fonts}<style>
  body { margin: 0; width: 1200px; height: 630px; background: #fbfbf9; color: ${INK};
         font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; position: relative; overflow: hidden; }
  .bar { height: 12px; background: ${BRAND}; }
  .logo { position: absolute; right: 90px; top: 120px; width: 250px; height: 250px; }
  h1 { font-size: 132px; font-weight: 900; margin: 112px 0 0 92px; letter-spacing: 4px; line-height: 1; }
  .sub { font-size: 44px; font-weight: 700; color: ${BRAND}; margin: 40px 0 0 96px; }
  .chips { display: flex; gap: 16px; margin: 48px 0 0 96px; }
  .chips span { font-size: 28px; padding: 12px 26px; border: 2px solid #e7e5e4; border-radius: 999px; background: #fff; }
  .foot { position: absolute; left: 96px; bottom: 44px; font-size: 26px; color: #6b6560; }
</style></head><body>
  <div class="bar"></div>
  <div class="logo">${logoSvg({ ink: INK, paper: '#ffffff', size: 250, label: '' })}</div>
  <h1>原價煮便當</h1>
  <div class="sub">原價屋報價 × 電腦零件相容性配單</div>
  <div class="chips"><span>腳位與記憶體世代</span><span>機殼尺寸</span><span>電源瓦數</span><span>每日更新報價</span></div>
  <div class="foot">非官方開源專案 · github.com/VaalRL/TW-bentocraft</div>
</body></html>`;

const touch = `<!doctype html><html><body style="margin:0;width:180px;height:180px;background:#fff;display:grid;place-items:center">
  ${logoSvg({ ink: INK, paper: '#ffffff', size: 150, label: '' })}</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  // 從檔案開啟，file:// 的字型樣式表才載得到
  const tmp = join(mkdtempSync(join(tmpdir(), 'brand-')), 'og.html');
  writeFileSync(tmp, og);
  await page.goto(`file://${tmp}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(web, 'public/og.png') });
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(touch);
  await page.screenshot({ path: join(web, 'public/apple-touch-icon.png') });
} finally {
  await browser.close();
}
console.log('已產生 favicon.svg、apple-touch-icon.png、og.png 與 docs/logo*.svg');
