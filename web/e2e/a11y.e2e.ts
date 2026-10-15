import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { candidate, category, open, pick } from './helpers';

// 自動無障礙檢查（axe，WCAG 2.1 A／AA）。淺色與深色模式各跑一次，涵蓋候選清單、估價單、尺寸比例圖與 CPU 比較頁。
const scan = (page: Parameters<typeof open>[0]) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

const summarize = (violations: Awaited<ReturnType<typeof scan>>['violations']) =>
  violations.map(v => `${v.id}（${v.impact}）：${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join('、')}`);

for (const theme of ['light', 'dark'] as const) {
  test(`無障礙檢查（${theme === 'light' ? '淺色' : '深色'}模式）`, async ({ page }) => {
    await page.addInitScript(t => {
      try {
        localStorage.setItem('theme', t);
      } catch {
        // 無法寫入時沿用預設主題
      }
    }, theme);
    await open(page);
    await pick(page, '處理器', 'R7 9800X3D');
    await pick(page, '顯示卡', 'RTX5080');
    await pick(page, '機殼', 'The Tower 300');
    await category(page, '電源');
    await page.getByLabel(/隱藏不相容/).uncheck();
    await candidate(page, 'HYDRO K PRO 550W').click();
    await expect(page.locator('.fit')).toBeVisible();

    const { violations } = await scan(page);
    expect(summarize(violations)).toEqual([]);

    // CPU 比較頁（三欄，含調整列順序的編輯模式）
    await page.getByRole('button', { name: 'CPU 比較' }).click();
    await page.getByLabel('第 2 顆 CPU').selectOption('cpu:intel:i5-14400');
    await page.getByRole('button', { name: '＋ 加入比較' }).click();
    await page.getByRole('button', { name: '最便宜' }).click();
    expect(summarize((await scan(page)).violations)).toEqual([]);
    await page.getByRole('button', { name: '調整欄位順序' }).click();
    await page.getByRole('checkbox', { name: '顯示「製程」' }).uncheck();
    const compare = await scan(page);
    expect(summarize(compare.violations)).toEqual([]);
  });
}
