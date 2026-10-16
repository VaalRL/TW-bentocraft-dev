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

  test('清空配單後可以復原；選了新零件就不再提供復原', async ({ page }) => {
    await open(page);
    await pick(page, '處理器', 'R7 9800X3D');
    await pick(page, '顯示卡', 'RTX5080');
    const items = page.locator('.summary-items li');
    await expect(items).toHaveCount(2);
    await page.getByRole('button', { name: '清空配單' }).click();
    await expect(items).toHaveCount(0);
    await expect(page).toHaveURL(/\/TW-bentocraft[^#]*\/$/);
    await page.getByRole('button', { name: '復原' }).click();
    await expect(items).toHaveCount(2);
    await expect(page).toHaveURL(/#\/build\?b=/);
    await page.getByRole('button', { name: '清空配單' }).click();
    await pick(page, '處理器', 'i5-14400');
    await expect(page.getByRole('button', { name: '復原' })).toHaveCount(0);
    await expect(items).toHaveCount(1);
  });

  test('3D 分解圖：點零件開啟對應清單，零件依相容性著色', async ({ page }) => {
    await open(page);
    const heading = page.locator('.candidates-toolbar h2');
    await page.locator('.iso-gpu').click();
    await expect(heading).toHaveText('顯示卡');
    // 目前的零件單獨拉出、畫在最上層，其他零件變淡
    await expect(page.locator('.iso-part').last()).toHaveClass(/iso-gpu/);
    await expect(page.locator('.iso-gpu')).not.toHaveClass(/is-dim/);
    await expect(page.locator('.iso-psu')).toHaveClass(/is-dim/);
    await page.getByRole('button', { name: '全部分解' }).click();
    await expect(page.locator('.iso-psu')).not.toHaveClass(/is-dim/);
    await page.getByRole('button', { name: '只拉出目前零件' }).click();
    // 機殼被其他零件擋住的部分點不到，鍵盤操作一定可以
    await page.getByRole('button', { name: /^機殼：未選擇/ }).focus();
    await page.keyboard.press('Enter');
    await expect(heading).toHaveText('機殼');
    await candidate(page, 'A4-H2O').click();
    await pick(page, '電源', 'SF750');
    await expect(page.locator('.iso-psu')).toHaveClass(/is-picked/);
    await expect(page.getByRole('button', { name: /^電源：.*SF750.*（(相容|未確認)）/ })).toBeVisible();
    await page.getByRole('button', { name: '收合' }).click();
    await expect(page.locator('.x3d-stage')).toHaveCount(0);
  });

  test('贊助連結指向 Buy Me a Coffee，在新分頁開啟', async ({ page }) => {
    await open(page);
    const sponsor = page.getByRole('link', { name: '贊助' }).first();
    await expect(sponsor).toHaveAttribute('href', 'https://www.buymeacoffee.com/whoami885');
    await expect(sponsor).toHaveAttribute('target', '_blank');
  });

  test('CPU 比較：並排規格與價格，標出最好的一欄，可放入配單', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'CPU 比較' }).click();
    await page.getByLabel('第 1 顆 CPU').selectOption('cpu:amd:r7-9800x3d');
    await page.getByLabel('第 2 顆 CPU').selectOption('cpu:intel:i5-14400');
    await expect(page).toHaveURL(/#\/compare\?c=cpu%3Aamd%3Ar7-9800x3d,cpu%3Aintel%3Ai5-14400$/);
    const row = (label: string) => page.locator('.cmp-table tr', { has: page.locator('th', { hasText: label }) });
    await expect(row('L3 快取').locator('td').first()).toHaveClass(/is-better/);
    await expect(row('核心／執行緒').locator('td').last()).toContainText('6P＋4E');
    await expect(row('價格').locator('td').last()).toHaveClass(/is-better/); // i5 比較便宜
    await expect(row('價格').locator('td').first()).toContainText('+$9,700');
    const bench = row('算圖效能');
    await expect(bench.locator('td').first()).toHaveClass(/is-better/);
    await expect(bench.locator('td').last()).toContainText('67%');
    await expect(bench.locator('td').last()).toContainText('12 筆結果的中位數');
    // 分享連結直接開啟比較頁
    await page.reload();
    await expect(page.locator('.cmp-table')).toBeVisible();
    await page.locator('.cmp-pick').first().getByRole('button', { name: '放入配單' }).click();
    await expect(page.locator('.summary-items li')).toContainText('R7 9800X3D');
    await expect(page).toHaveURL(/#\/build\?b=/);
  });

  test('CPU 比較：最多四欄，可移除欄位；舊版 a／b 連結仍可開啟', async ({ page }) => {
    await open(page);
    await page.evaluate(h => { location.hash = h; }, '#/compare?a=cpu%3Aamd%3Ar7-9800x3d&b=cpu%3Aintel%3Ai5-14400');
    await page.reload();
    await expect(page.locator('.cmp-table thead th')).toHaveCount(3);
    await expect(page).toHaveURL(/\?c=cpu%3Aamd%3Ar7-9800x3d,cpu%3Aintel%3Ai5-14400$/);
    const add = page.getByRole('button', { name: '＋ 加入比較' });
    await add.click();
    await add.click();
    await expect(page.getByLabel('第 4 顆 CPU')).toBeVisible();
    await expect(add).toHaveCount(0);
    await page.getByLabel('第 3 顆 CPU').selectOption('cpu:amd:r7-9800x3d');
    await expect(page.locator('.cmp-table thead th')).toHaveCount(4);
    await page.getByRole('button', { name: '移除第 1 欄' }).click();
    await expect(page.getByLabel('第 1 顆 CPU')).toHaveValue('cpu:intel:i5-14400');
    await expect(page).toHaveURL(/\?c=cpu%3Aintel%3Ai5-14400,cpu%3Aamd%3Ar7-9800x3d$/);
  });

  test('CPU 比較：可調整列順序與隱藏列，重新開啟後保留', async ({ page }) => {
    await open(page);
    await page.evaluate(h => { location.hash = h; }, '#/compare?c=cpu%3Aamd%3Ar7-9800x3d,cpu%3Aintel%3Ai5-14400');
    await page.reload();
    const heads = page.locator('.cmp-table tbody th');
    await expect(heads.first()).toContainText('價格');
    await page.getByRole('button', { name: '調整欄位順序' }).click();
    await page.getByRole('button', { name: '「價格」下移' }).click();
    await expect(heads.nth(0)).toContainText('算圖效能');
    await expect(heads.nth(1)).toContainText('價格');
    await page.getByRole('checkbox', { name: '顯示「製程」' }).uncheck();
    await page.getByRole('button', { name: '完成' }).click();
    await expect(page.locator('.cmp-table tbody th', { hasText: '製程' })).toHaveCount(0);
    await page.reload();
    await expect(heads.nth(0)).toContainText('算圖效能');
    await expect(page.locator('.cmp-table tbody th', { hasText: '製程' })).toHaveCount(0);
    await page.getByRole('button', { name: '調整欄位順序' }).click();
    await page.getByRole('button', { name: '恢復預設' }).click();
    await page.getByRole('button', { name: '完成' }).click();
    await expect(heads.nth(0)).toContainText('價格');
    await expect(page.locator('.cmp-table tbody th', { hasText: '製程' })).toHaveCount(1);
  });

  test('CPU 比較：快速比較標出勝出者並把該列移到最上面', async ({ page }) => {
    await open(page);
    await page.evaluate(h => { location.hash = h; }, '#/compare?c=cpu%3Aamd%3Ar7-9800x3d,cpu%3Aintel%3Ai5-14400');
    await page.reload();
    const heads = page.locator('.cmp-table tbody th');
    const cols = page.locator('.cmp-table thead th');
    const verdict = page.locator('.cmp-verdict');

    await page.getByRole('button', { name: '最省電' }).click();
    await expect(heads.first()).toContainText('最大功耗');
    await expect(cols.nth(2).locator('.cmp-badge')).toHaveText('最省電'); // i5-14400 148 W
    await expect(cols.nth(1).locator('.cmp-badge')).toHaveCount(0);
    await expect(verdict).toContainText('最省電：i5-14400');
    await expect(page).toHaveURL(/&f=power$/);

    await page.getByRole('button', { name: '算圖最強' }).click();
    await expect(heads.first()).toContainText('算圖效能');
    await expect(cols.nth(1).locator('.cmp-badge')).toHaveText('算圖最強');
    await expect(page.getByRole('button', { name: '最省電' })).toHaveAttribute('aria-pressed', 'false');

    // 分享連結保留快速比較；再按一次取消
    await page.reload();
    await expect(page.getByRole('button', { name: '算圖最強' })).toHaveAttribute('aria-pressed', 'true');
    await expect(heads.first()).toContainText('算圖效能');
    await page.getByRole('button', { name: '算圖最強' }).click();
    await expect(heads.first()).toContainText('價格');
    await expect(page.locator('.cmp-badge')).toHaveCount(0);
    await expect(page).toHaveURL(/i5-14400$/);
  });

  test('CPU 清單除了價格也顯示算力與耗電', async ({ page }) => {
    await open(page);
    await category(page, '處理器');
    const r7 = candidate(page, 'R7 9800X3D').locator('.candidate-stats');
    await expect(r7).toContainText('算力 420');
    await expect(r7).toContainText('耗電 162 W');
    await expect(r7.locator('.stat-bar span')).toHaveAttribute('style', /width: 100%/);
    await expect(candidate(page, 'i5-14400').locator('.stat-bar span')).toHaveAttribute('style', /width: 67%/);
    await expect(page.locator('.candidates-count')).toContainText('不代表遊戲效能');
    await category(page, '主機板');
    await expect(page.locator('.candidate-stats')).toHaveCount(0);
  });

  test('CPU 清單可依品牌、腳位與條件篩選，並依算力、價格或每千元算力排序', async ({ page }) => {
    await open(page);
    await category(page, '處理器');
    const names = page.locator('.candidate-name');
    const filters = page.getByRole('group', { name: '篩選' });
    await expect(names).toHaveCount(2);

    await filters.getByRole('button', { name: /^Intel/ }).click();
    await expect(names).toHaveCount(1);
    await expect(names.first()).toContainText('i5-14400');
    await filters.getByRole('button', { name: /^AMD/ }).click(); // 同一組可複選
    await expect(names).toHaveCount(2);
    await filters.getByRole('button', { name: '清除篩選' }).click();

    await filters.getByRole('button', { name: /^AM5/ }).click();
    await expect(names).toHaveCount(1);
    await expect(names.first()).toContainText('R7 9800X3D');
    await filters.getByRole('button', { name: /^Intel/ }).click(); // 不同組須同時符合
    await expect(names).toHaveCount(0);
    await expect(filters.getByRole('button', { name: '附散熱器' })).toHaveCount(0); // 沒有型號符合的條件不列出
    await filters.getByRole('button', { name: '清除篩選' }).click();
    await expect(names).toHaveCount(2);

    const sort = page.getByLabel('排序');
    await sort.selectOption({ label: '算力高到低' });
    await expect(names.first()).toContainText('R7 9800X3D');
    await sort.selectOption({ label: '價格低到高' });
    await expect(names.first()).toContainText('i5-14400');
    await sort.selectOption({ label: '每千元算力高到低' });
    await expect(names.first()).toContainText('i5-14400'); // 280 / $6,290 ≈ 44.5
    await expect(candidate(page, 'i5-14400')).toContainText('每千元算力 44.5');

    // 主機板也有腳位篩選，但沒有 CPU 專屬的條件
    await category(page, '主機板');
    await expect(page.getByRole('group', { name: '腳位' })).toBeVisible();
    await expect(page.getByRole('button', { name: '有內顯' })).toHaveCount(0);
  });

  test('其他零件也可篩選與排序：電源瓦數、尺寸與每瓦價格', async ({ page }) => {
    await open(page);
    await category(page, '電源');
    const names = page.locator('.candidate-name');
    const filters = page.getByRole('group', { name: '篩選' });
    await expect(names).toHaveCount(3);
    await filters.getByLabel('瓦數').selectOption({ label: '至少 750 W' });
    await expect(names).toHaveCount(2);
    await filters.getByRole('group', { name: '尺寸' }).getByRole('button', { name: /^SFX/ }).click();
    await expect(names).toHaveCount(1);
    await expect(names.first()).toContainText('SF750');
    await filters.getByRole('button', { name: '清除篩選' }).click();
    await expect(names).toHaveCount(3);
    await page.getByLabel('排序').selectOption({ label: '每瓦價格低到高' });
    await expect(names.first()).toContainText('550W'); // $1,590 / 550 W
    await expect(candidate(page, 'HYDRO K PRO 550W')).toContainText('每瓦 $2.9');
    await page.getByLabel('排序').selectOption({ label: '瓦數高到低' });
    await expect(names.first()).toContainText('1000W');

    await category(page, '記憶體');
    await page.getByRole('group', { name: '記憶體' }).getByRole('button', { name: /^DDR4/ }).click();
    await expect(names).toHaveCount(1);
    await expect(names.first()).toContainText('DDR4-3200');
  });

  test('機殼清單有依規格畫的示意縮圖與實品照片搜尋連結', async ({ page }) => {
    await open(page);
    await category(page, '機殼');
    const item = page.locator('.candidate-list li', { hasText: 'A4-H2O' });
    await expect(item.locator('svg.case-thumb .iso-face')).toHaveCount(3); // 側板、前板、頂板
    const photo = item.getByRole('link', { name: /實品照片/ });
    await expect(photo).toHaveAttribute('href', /^https:\/\/www\.google\.com\/search\?tbm=isch&q=.*A4-H2O/);
    await expect(photo).toHaveAttribute('target', '_blank');
    await category(page, '電源');
    await expect(page.locator('.case-thumb')).toHaveCount(0);
  });

  test('名詞懸停說明：滑鼠停在名詞上跳出說明，可前往名詞解釋頁', async ({ page }) => {
    await open(page);
    const term = candidate(page, 'R7 9800X3D').locator('.term[data-term="socket"]');
    await term.hover();
    const pop = page.getByRole('tooltip');
    await expect(pop).toContainText('腳位（Socket）');
    await expect(pop).toContainText('選購時注意');
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
    await page.mouse.move(0, 0);
    await term.hover();
    await pop.hover(); // 可以把滑鼠移進說明框
    await pop.getByRole('button', { name: '在名詞解釋頁查看' }).click();
    await expect(page).toHaveURL(/#\/glossary\?t=socket$/);
    await expect(page.locator('#term-socket')).toHaveClass(/is-focus/);
  });

  test('名詞解釋頁：分組列出並可搜尋', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: '名詞' }).click();
    await expect(page.getByRole('heading', { name: '名詞解釋' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '電源、散熱與機殼' })).toBeVisible();
    await page.getByLabel('搜尋名詞').fill('冷排');
    await expect(page.locator('.glossary-entry dt')).toContainText(['一體式水冷', '冷排']);
    await expect(page.locator('#term-pcie')).toHaveCount(0);
    await page.getByRole('button', { name: '配單' }).click();
    await expect(page.locator('.candidate').first()).toBeVisible();
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
    const spec = new URL((await page.getByRole('link', { name: /回報「.*」規格錯誤/ }).first().getAttribute('href'))!);
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
