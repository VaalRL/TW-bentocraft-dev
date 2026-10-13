import { expect, type Page } from '@playwright/test';
import { CATALOG, PRICES } from './fixtures';

// 以固定資料取代 data/*.json；GitHub Star 數 API 回傳空資料（測試不連外網）。
export async function open(page: Page, path = '') {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.route('**/data/catalog.min.json', r => r.fulfill({ json: CATALOG }));
  await page.route('**/data/prices.min.json', r => r.fulfill({ json: PRICES }));
  await page.route('https://api.github.com/**', r => r.fulfill({ json: {} }));
  await page.goto(path);
  await expect(page.locator('.candidate').first()).toBeVisible();
  return errors;
}

export const category = (page: Page, label: string) => page.locator('.category', { hasText: label }).click();
export const candidate = (page: Page, name: string) => page.locator('.candidate', { hasText: name });
export const pick = async (page: Page, label: string, name: string) => {
  await category(page, label);
  await candidate(page, name).click();
};
export const checks = (page: Page) => page.locator('.summary-checks li');
