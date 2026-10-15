import { expect, test } from '@playwright/test';
import { candidate, open } from './helpers';

test.describe('手機版', () => {
  test('沒有水平捲動，選了零件後出現底部摘要列', async ({ page }) => {
    const errors = await open(page);
    await candidate(page, 'R7 9800X3D').click();
    await expect(page.locator('.mobile-bar')).toBeVisible();
    await expect(page.locator('.mobile-bar')).toContainText('1 件');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
  });

  test('篩選列預設收合，點「篩選」展開，按鈕顯示已選條件數', async ({ page }) => {
    await open(page);
    const toggle = page.getByRole('button', { name: /^篩選/ });
    const filters = page.getByRole('group', { name: '篩選' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(filters).toBeHidden();
    await toggle.click();
    await expect(filters).toBeVisible();
    await filters.getByRole('button', { name: /^AM5/ }).click();
    await expect(toggle).toHaveText('篩選（1）');
    await expect(page.locator('.candidate-name')).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test('手機不顯示名詞底線與懸停說明，改由「名詞」頁查詢', async ({ page }) => {
    await open(page);
    const term = page.locator('.term').first();
    await expect(term).toHaveCSS('text-decoration-line', 'none');
    await page.getByRole('button', { name: '名詞' }).click();
    await expect(page.getByRole('heading', { name: '名詞解釋' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
