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
});
