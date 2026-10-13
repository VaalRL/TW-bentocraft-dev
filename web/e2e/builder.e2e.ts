import { expect, test } from '@playwright/test';
import { candidate, category, checks, open, pick } from './helpers';

test.describe('桌面版配單', () => {
  test('選了 AM5 CPU 後，DDR4 記憶體標示會讓主機板無相容選項', async ({ page }) => {
    const errors = await open(page);
    await pick(page, '處理器', 'R7 9800X3D');
    await category(page, '記憶體');
    await expect(candidate(page, 'DDR4-3200')).toContainText('選了之後將沒有相容的主機板');
    await expect(candidate(page, 'DDR5-6000')).not.toContainText('將沒有相容');
    expect(errors).toEqual([]);
  });

  test('不相容的主機板預設隱藏，取消勾選後顯示為不相容', async ({ page }) => {
    await open(page);
    await pick(page, '處理器', 'R7 9800X3D');
    await category(page, '主機板');
    await expect(candidate(page, 'B760M D4')).toHaveCount(0);
    await page.getByLabel(/隱藏不相容/).uncheck();
    await expect(candidate(page, 'B760M D4')).toHaveClass(/status-fail/);
  });

  test('A4-H2O 只能裝 SFX 電源：ATX 電源依推定規格判為不相容', async ({ page }) => {
    await open(page);
    await pick(page, '機殼', 'A4-H2O');
    await category(page, '電源');
    await page.getByLabel(/隱藏不相容/).uncheck();
    const atx = candidate(page, 'TUF GAMING 1000W');
    await expect(atx).toHaveClass(/status-fail/);
    await expect(atx).toContainText('依推定規格');
    await expect(candidate(page, 'SF750')).not.toHaveClass(/status-fail/);
  });

  test('電源瓦數：9800X3D ＋ RTX 5080 估計 572 W，550 W 不足', async ({ page }) => {
    await open(page);
    await pick(page, '處理器', 'R7 9800X3D');
    await pick(page, '顯示卡', 'RTX5080');
    await category(page, '電源');
    await page.getByLabel(/隱藏不相容/).uncheck();
    await candidate(page, 'HYDRO K PRO 550W').click();
    await expect(page.locator('.summary-checks')).toContainText('預估功耗：572 W');
    await expect(checks(page).filter({ hasText: '額定 550 W 低於估計滿載 572 W' })).toHaveClass(/status-fail/);
  });

  test('附條件價格不計入總價；組裝價開關打開後才套用', async ({ page }) => {
    await open(page);
    await pick(page, '電源', 'TUF GAMING 1000W');
    const total = page.locator('.summary-total .grand');
    await expect(total).toContainText('$4,490');
    await expect(page.locator('.summary-items')).toContainText('條件未成立未採用');
    await page.getByLabel(/整機在原價屋組裝/).check();
    await expect(total).toContainText('$3,990');
  });

  test('任搭折抵只在選了兩件以上時扣除', async ({ page }) => {
    await open(page);
    await pick(page, '記憶體', 'DDR5-6000');
    await expect(page.locator('.summary-total')).not.toContainText('任搭折抵');
    await pick(page, '處理器', 'R7 9800X3D');
    await expect(page.locator('.summary-total')).toContainText('-$200');
  });

  test('分享連結可還原配單，舊 ID 經轉址還原', async ({ page, context }) => {
    await open(page);
    await pick(page, '處理器', 'R7 9800X3D');
    await pick(page, '主機板', 'X870 GAMING X');
    await pick(page, '記憶體', 'DDR5-6000');
    await expect(page).toHaveURL(/#\/build\?b=/);
    const url = page.url();

    const other = await context.newPage();
    await open(other, url.slice(url.indexOf('#')));
    await expect(other.locator('.summary-items li')).toHaveCount(3);
    await expect(other.locator('.summary-items')).toContainText('X870 GAMING X');
  });

  test('分享連結中找不到的型號會提示', async ({ page }) => {
    // {v:1, items:{case:'case:lian-li:a4-h2o-old', gpu:'gpu:x:gone'}}，以 lz-string 壓縮
    const { default: LZString } = await import('lz-string');
    const hash = LZString.compressToEncodedURIComponent(
      JSON.stringify({ v: 1, items: { case: 'case:lian-li:a4-h2o-old', gpu: 'gpu:x:gone' } }),
    );
    await open(page, `#/build?b=${hash}`);
    await expect(page.locator('.summary-items')).toContainText('A4-H2O');
    await expect(page.getByRole('status')).toContainText('1 個零件已不在規格庫中');
  });
});
