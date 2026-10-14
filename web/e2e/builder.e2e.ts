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

  test('還沒選零件時提示小機殼可先選機殼，選了之後不再提示', async ({ page }) => {
    await open(page);
    const tip = page.locator('.candidates-tip');
    await expect(tip).toContainText('想組小機殼');
    await tip.getByRole('button', { name: '先選機殼' }).click();
    await expect(page.locator('.candidates-toolbar h2')).toHaveText('機殼');
    await expect(tip).toHaveCount(0);
    await candidate(page, 'A4-H2O').click();
    await category(page, '處理器');
    await expect(tip).toHaveCount(0);
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

  test('機殼側視示意圖：零件依相容性檢查著色', async ({ page }) => {
    await open(page);
    await pick(page, '機殼', 'A4-H2O');
    const schem = page.locator('.schem svg');
    await expect(schem).toHaveAttribute('aria-label', /主機板 Mini-ITX；顯卡限長 322 mm；電源 SFX/);
    await pick(page, '顯示卡', 'RTX5080');
    await category(page, '電源');
    await page.getByLabel(/隱藏不相容/).uncheck();
    await candidate(page, 'TUF GAMING 1000W').click();
    await expect(schem).toHaveAttribute('aria-label', /顯卡 303 mm：相容；電源 ATX：不相容/);
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
    await expect(page.locator('.summary-items')).toContainText('此價格為「黑」款');
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

  test('價格走勢：清單標示與 7 天前相比的漲跌，估價單標示近期最低價', async ({ page }) => {
    await open(page);
    await category(page, '處理器');
    await expect(candidate(page, 'R7 9800X3D').locator('.price-trend')).toHaveText('↓$400（與 7 天前相比）');
    await candidate(page, 'R7 9800X3D').click();
    await expect(page.locator('.summary-items')).toContainText('近 30 天最低價');
    await pick(page, '顯示卡', 'RTX5080');
    await expect(candidate(page, 'RTX5080').locator('.price-trend')).toHaveText('↑$1,000（與 7 天前相比）');
    await expect(page.locator('.summary-items')).toContainText('近 30 天最低 $35,990');
  });

  test('回報連結會帶入型號 ID 與配單連結', async ({ page }) => {
    await open(page);
    await pick(page, '處理器', 'R7 9800X3D');
    const spec = new URL((await page.getByRole('link', { name: '回報規格錯誤' }).getAttribute('href'))!);
    expect(spec.searchParams.get('template')).toBe('spec-error.yml');
    expect(spec.searchParams.get('model_id')).toMatch(/^cpu:/);
    await page.context().route('https://github.com/**', r => r.fulfill({ body: '' }));
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.locator('.summary-checks').getByRole('link', { name: '回報' }).click(),
    ]);
    const check = new URL(popup.url());
    expect(check.searchParams.get('template')).toBe('compat-check.yml');
    expect(check.searchParams.get('build_url')).toBe(page.url());
    expect(page.url()).toContain('#/build?b=');
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

  test('尺寸比例圖：顯卡與散熱器依機殼上限著色，並標出條件式上限', async ({ page }) => {
    await open(page);
    await pick(page, '機殼', 'The Tower 300');
    await pick(page, '顯示卡', 'RTX5080');
    const fit = page.locator('.fit');
    const gpuRow = fit.locator('.fit-row', { hasText: '顯卡長度' });
    await expect(gpuRow).toContainText('顯卡 303 mm（±10）／機殼上限 400 mm：剩 97 mm');
    await expect(gpuRow.locator('.badge')).toHaveText('注意'); // 裝上電源護罩時上限 280 mm
    await expect(gpuRow).toContainText('裝上電源護罩時上限 280 mm');

    await pick(page, '機殼', 'A4-H2O');
    await category(page, '散熱器');
    await page.getByLabel(/隱藏不相容/).uncheck();
    await candidate(page, 'Phantom Spirit').click();
    const coolerRow = fit.locator('.fit-row', { hasText: '風冷散熱器高度' });
    await expect(coolerRow).toContainText('超出 102 mm');
    await expect(coolerRow.locator('.badge')).toHaveText('不相容');
    await expect(fit.locator('.fit-row', { hasText: '顯卡長度' }).locator('.badge')).toHaveText('相容');
  });
});
