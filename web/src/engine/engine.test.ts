// 測試資料取自 2026-10-12 PoC 實測過的原價屋品項
import { describe, expect, it } from 'vitest';
import { buildChecks, estimateLoad, recommendedWattage } from './constraints';
import { deadEndChecker, evaluate, selectionChecks, worst } from './engine';
import { indexOffers, priceSelection } from './pricing';
import { decodeShare, encodeShare } from './share';
import type { Category, Model, PricesData } from './types';

const M = (id: string, s: Model['s'], x?: Model['x']): Model => ({
  id, c: id.split(':')[0] as Category, b: 'b', n: id, s, x, r: 'a',
});

const cpu8400f = M('cpu:amd:ryzen-5-8400f', { socket: 'AM5', igpu: false, cooler_included: true });
const cpu9800x3d = M('cpu:amd:ryzen-7-9800x3d', { socket: 'AM5', igpu: true, cooler_included: false, max_power_w: 162 });
const cpu14400 = M('cpu:intel:i5-14400', { socket: 'LGA1700', igpu: true });
const mbX870 = M('motherboard:gigabyte:x870-gaming-x-wifi7', { socket: 'AM5', memory_type: 'DDR5', form_factor: 'ATX', dimm_slots: 4 });
const mbB650m = M('motherboard:gigabyte:b650m-k', { socket: 'AM5', memory_type: 'DDR5', form_factor: 'M-ATX' });
const mbB760d4 = M('motherboard:asus:b760m-d4', { socket: 'LGA1700', memory_type: 'DDR4', form_factor: 'M-ATX', dimm_slots: 2 });
const ramD5 = M('ram:adata:32g-ddr5-6000', { memory_type: 'DDR5', capacity_gb: 32, modules: 2 });
const ramD4x4 = M('ram:kingston:64gb-ddr4-3200', { memory_type: 'DDR4', capacity_gb: 64, modules: 4 });
const gpu5060ti = M('gpu:gigabyte:rtx5060ti-eagle-oc-8g', { length_mm: 220 }, { length_mm: { t: 10 } });
const gpu5080 = M('gpu:msi:rtx5080-16g-ventus-3x-oc', { length_mm: 303, board_power_w: 360 });
const gpuBox = M('gpu:gigabyte:aorus-rtx5060ti-ai-box', { external: true });
const tower300 = M('case:thermaltake:the-tower-300',
  { max_mb_form_factor: 'M-ATX', gpu_clearance_mm: 400, cooler_clearance_mm: 210, psu_form_factors: ['ATX'] },
  { gpu_clearance_mm: { k: [[280, 'psu_shroud_installed']] }, psu_form_factors: { i: 1 } });
const a4h2o = M('case:lian-li:a4-h2o',
  { max_mb_form_factor: 'Mini-ITX', gpu_clearance_mm: 322, cooler_clearance_mm: 55, psu_form_factors: ['SFX'] });
const case215 = M('case:x:small', { max_mb_form_factor: 'M-ATX', gpu_clearance_mm: 215, cooler_clearance_mm: 155 });
const psuAtx = M('psu:asus:tuf-gaming-1000w-gold', { wattage: 1000, form_factor: 'ATX' }, { form_factor: { i: 1 } });
const psu650 = M('psu:x:650', { wattage: 650, form_factor: 'ATX' });
const coolerPS120 = M('cooler:thermalright:phantom-spirit-120-evo', { cooler_type: 'air', height_mm: 157 });

const status = (checks: ReturnType<typeof evaluate>, id: string) => checks.find(c => c.constraint === id)?.status;

describe('成對約束', () => {
  it('C1 腳位', () => {
    expect(status(evaluate(mbX870, { cpu: cpu9800x3d }), 'C1')).toBe('pass');
    expect(status(evaluate(mbB760d4, { cpu: cpu9800x3d }), 'C1')).toBe('fail');
  });

  it('C2 世代不符為 fail；插槽數未知為 unknown', () => {
    expect(status(evaluate(ramD4x4, { motherboard: mbX870 }), 'C2')).toBe('fail');
    expect(status(evaluate(ramD5, { motherboard: mbB650m }), 'C2')).toBe('unknown');
    expect(status(evaluate(ramD5, { motherboard: mbX870 }), 'C2')).toBe('pass');
    const fourOnTwo = M('ram:x:d4x4', { memory_type: 'DDR4', capacity_gb: 32, modules: 4 });
    expect(status(evaluate(fourOnTwo, { motherboard: mbB760d4 }), 'C2')).toBe('fail');
  });

  it('C3 板型', () => {
    expect(status(evaluate(mbX870, { case: tower300 }), 'C3')).toBe('fail');
    expect(status(evaluate(mbB650m, { case: tower300 }), 'C3')).toBe('pass');
  });

  it('C4 品名近似值在誤差帶內只警告，不阻擋', () => {
    // 品名 22cm（±10 mm），實際 215 mm：配限長 215 mm 的機殼不應硬性阻斷
    const c = evaluate(gpu5060ti, { case: case215 }).find(x => x.constraint === 'C4')!;
    expect(c.status).toBe('warn');
    expect(c.message).toContain('誤差 ±10 mm');
  });

  it('C4 條件式上限：裝上電源護罩時給警告', () => {
    const c = evaluate(gpu5080, { case: tower300 }).find(x => x.constraint === 'C4')!;
    expect(c.status).toBe('warn');
    expect(c.message).toContain('裝上電源護罩時上限僅 280 mm');
    expect(status(evaluate(gpu5080, { case: a4h2o }), 'C4')).toBe('pass');
    expect(status(evaluate(gpu5080, { case: case215 }), 'C4')).toBe('fail');
    expect(status(evaluate(gpuBox, { case: case215 }), 'C4')).toBe('pass');
  });

  it('C5 風冷限高', () => {
    expect(status(evaluate(coolerPS120, { case: case215 }), 'C5')).toBe('fail');
    expect(status(evaluate(coolerPS120, { case: tower300 }), 'C5')).toBe('pass');
  });

  it('C6 扣具未知時為 unknown', () => {
    expect(status(evaluate(coolerPS120, { cpu: cpu9800x3d }), 'C6')).toBe('unknown');
  });

  it('C9 電源規格，並標示依賴推定值', () => {
    const c = evaluate(psuAtx, { case: a4h2o }).find(x => x.constraint === 'C9')!;
    expect(c.status).toBe('fail');
    expect(c.inferred).toBe(true);
    expect(status(evaluate(psuAtx, { case: tower300 }), 'C9')).toBe('pass');
    const sfx = M('psu:corsair:sf750', { wattage: 750, form_factor: 'SFX' });
    const sfxl = M('psu:asus:rog-loki-850w', { wattage: 850, form_factor: 'SFX-L' });
    expect(status(evaluate(sfx, { case: tower300 }), 'C9')).toBe('warn'); // ATX 電源位需轉接架
    expect(status(evaluate(sfxl, { case: a4h2o }), 'C9')).toBe('warn'); // SFX 電源位不一定放得下 SFX-L
    expect(status(evaluate(sfx, { case: a4h2o }), 'C9')).toBe('pass');
  });
});

describe('整機檢查', () => {
  it('C10 無內顯且未選顯卡', () => {
    expect(buildChecks({ cpu: cpu8400f }).map(c => c.constraint)).toContain('C10');
    expect(buildChecks({ cpu: cpu8400f, gpu: gpu5080 }).map(c => c.constraint)).not.toContain('C10');
  });

  it('C12 不附散熱器且未選散熱器', () => {
    expect(buildChecks({ cpu: cpu9800x3d }).map(c => c.constraint)).toContain('C12');
    expect(buildChecks({ cpu: cpu8400f }).map(c => c.constraint)).not.toContain('C12');
  });

  it('C5 一體式水冷依機殼冷排位判斷', () => {
    const aio360 = M('cooler:x:aio-360', { cooler_type: 'aio', radiator_mm: 360 });
    const aio420 = M('cooler:x:aio-420', { cooler_type: 'aio', radiator_mm: 420 });
    const caseRad = M('case:x:mid', {
      max_mb_form_factor: 'ATX', gpu_clearance_mm: 400, cooler_clearance_mm: 170, psu_form_factors: ['ATX'],
      radiator_support: [{ position: 'front', sizes: [240, 280, 360] }, { position: 'top', sizes: [240, 360] }],
    });
    expect(status(evaluate(aio360, { case: caseRad }), 'C5')).toBe('pass');
    expect(status(evaluate(aio420, { case: caseRad }), 'C5')).toBe('fail');
    const noRad = evaluate(aio360, { case: M('case:x:sff', { radiator_support: [] }) }).find(r => r.constraint === 'C5');
    expect([noRad?.status, noRad?.message]).toEqual(['fail', '機殼不支援一體式水冷']);
    const caseBig = M('case:x:big', { radiator_support: [{ position: 'top', sizes: [360, 420] }] });
    expect(status(evaluate(M('cooler:x:aio-240', { cooler_type: 'aio', radiator_mm: 240 }), { case: caseBig }), 'C5')).toBe('warn');
    expect(status(evaluate(aio360, { case: tower300 }), 'C5')).toBe('unknown'); // 機殼冷排位未確認
  });

  it('C7 功耗缺漏時為 unknown，不以預設值估算', () => {
    expect(estimateLoad({ cpu: cpu8400f, gpu: gpu5080 })).toBeNull();
    expect(status(buildChecks({ cpu: cpu8400f, gpu: gpu5080, psu: psuAtx }), 'C7')).toBe('unknown');
  });

  it('C7 有功耗資料時計算瓦數（9800X3D ＋ RTX5080 = 572 W，建議 750 W）', () => {
    expect(estimateLoad({ cpu: cpu9800x3d, gpu: gpu5080 })).toEqual({ watts: 572, inferred: false });
    expect(recommendedWattage(572)).toBe(750);
    expect(status(buildChecks({ cpu: cpu9800x3d, gpu: gpu5080, psu: psuAtx }), 'C7')).toBe('pass');
    expect(status(buildChecks({ cpu: cpu9800x3d, gpu: gpu5080, psu: psu650 }), 'C7')).toBe('warn');
    const psu500 = M('psu:x:500', { wattage: 500, form_factor: 'ATX' });
    expect(status(buildChecks({ cpu: cpu9800x3d, gpu: gpu5080, psu: psu500 }), 'C7')).toBe('fail');
  });

  it('C7 未選顯卡或外接顯卡盒時不計顯卡功耗', () => {
    expect(estimateLoad({ cpu: cpu9800x3d })).toEqual({ watts: 212, inferred: false });
    expect(estimateLoad({ cpu: cpu9800x3d, gpu: gpuBox })).toEqual({ watts: 212, inferred: false });
    expect(estimateLoad({ gpu: gpu5080 })).toBeNull();
    expect(buildChecks({ gpu: gpu5080, psu: psu650 }).find(c => c.constraint === 'C7')?.message).toContain('尚未選擇 CPU');
  });

  it('C7 顯卡功耗為推定值時，結果標為依推定規格', () => {
    const gpu5070 = M('gpu:x:rtx5070', { length_mm: 250, board_power_w: 250 }, { board_power_w: { i: 1 } });
    expect(estimateLoad({ cpu: cpu9800x3d, gpu: gpu5070 })).toEqual({ watts: 462, inferred: true });
    const c7 = buildChecks({ cpu: cpu9800x3d, gpu: gpu5070, psu: psu650 }).find(c => c.constraint === 'C7');
    expect(c7).toMatchObject({ status: 'pass', inferred: true });
  });

  it('selectionChecks 每對只算一次', () => {
    const checks = selectionChecks({ cpu: cpu9800x3d, motherboard: mbX870, ram: ramD5 });
    expect(checks.filter(c => c.constraint === 'C1')).toHaveLength(1);
    expect(worst(checks)).toBe('warn'); // C12：未選散熱器
  });
});

describe('前向檢查', () => {
  const catalog = {
    cpu: [cpu8400f, cpu9800x3d, cpu14400], motherboard: [mbX870, mbB650m, mbB760d4], ram: [ramD5, ramD4x4],
    gpu: [gpu5060ti, gpu5080], cooler: [coolerPS120], case: [tower300, a4h2o, case215], psu: [psuAtx], ssd: [],
  } as Record<Category, Model[]>;

  it('已選 AM5 CPU，再選 DDR4 記憶體 → 主機板沒有可選項', () => {
    const check = deadEndChecker('ram', { cpu: cpu9800x3d }, catalog);
    expect(check(ramD4x4)).toEqual(['motherboard']);
    expect(check(ramD5)).toEqual([]);
  });

  it('替換已選零件時不拿舊零件比對', () => {
    // 已選 DDR4 記憶體與 Intel CPU；把記憶體換成 DDR5 時，Intel CPU 相容的主機板只有 DDR4，應回報死路
    const ramD4x2 = M('ram:kingston:32gb-ddr4-3200', { memory_type: 'DDR4', capacity_gb: 32, modules: 2 });
    const check = deadEndChecker('ram', { cpu: cpu14400, ram: ramD4x4 }, catalog);
    expect(check(ramD5)).toEqual(['motherboard']);
    expect(check(ramD4x2)).toEqual([]);
    // 4 條一組配只有 2 槽的 DDR4 主機板，同樣沒有可選項
    expect(check(ramD4x4)).toEqual(['motherboard']);
  });
});

describe('總價', () => {
  const prices: PricesData = {
    fetched_at: '2026-10-13T03:17:00Z', status: 'ok', vendor: 'coolpc', offers: [
      { m: cpu8400f.id, p: 4450, c: { t: 'requires_category', q: ['motherboard'] } },
      { m: cpu8400f.id, p: 4950 },
      { m: mbB650m.id, p: 3990, d: 100 },
      { m: gpu5080.id, p: 53990, d: 190 },
      { m: ramD5.id, p: 17000, c: { t: 'assembly' } },
      { m: ramD5.id, p: 19099 },
      { m: psuAtx.id, p: 4000, c: { t: 'unspecified' } },
    ],
  };
  const offers = indexOffers(prices);

  it('附條件價格只在條件成立時採用', () => {
    const alone = priceSelection({ cpu: cpu8400f }, offers, { assembly: false });
    expect(alone.items[0].offer?.p).toBe(4950);
    expect(alone.items[0].conditional.map(o => o.p)).toEqual([4450]);
    const withMb = priceSelection({ cpu: cpu8400f, motherboard: mbB650m }, offers, { assembly: false });
    expect(withMb.items.find(i => i.category === 'cpu')!.offer?.p).toBe(4450);
  });

  it('組裝價需勾選整機組裝；條件不明的價格不自動採用', () => {
    expect(priceSelection({ ram: ramD5 }, offers, { assembly: false }).items[0].offer?.p).toBe(19099);
    expect(priceSelection({ ram: ramD5 }, offers, { assembly: true }).items[0].offer?.p).toBe(17000);
    const psu = priceSelection({ psu: psuAtx }, offers, { assembly: true });
    expect(psu.items[0].offer).toBeNull();
    expect(psu.missing).toEqual(['psu']);
  });

  it('任搭折抵：整單至少兩件才成立', () => {
    expect(priceSelection({ gpu: gpu5080 }, offers, { assembly: false }).discount).toBe(0);
    const two = priceSelection({ gpu: gpu5080, motherboard: mbB650m }, offers, { assembly: false });
    expect(two.discount).toBe(290);
    expect(two.total).toBe(53990 + 3990 - 290);
  });
});

describe('分享連結', () => {
  const ids = new Set([cpu9800x3d.id, tower300.id]);
  const resolve = (id: string) => ({ 'cpu:amd:r7-9800x3d': cpu9800x3d.id } as Record<string, string>)[id] ?? (ids.has(id) ? id : undefined);

  it('來回編碼、轉址與找不到的型號', () => {
    const code = encodeShare({ cpu: 'cpu:amd:r7-9800x3d', case: `${tower300.id}#white`, gpu: 'gpu:x:gone' });
    expect(decodeShare(code, resolve)).toEqual({
      items: { cpu: cpu9800x3d.id, case: `${tower300.id}#white` },
      missing: ['gpu:x:gone'],
    });
  });

  it('無效內容回傳 null', () => {
    expect(decodeShare('not-a-valid-payload', resolve)).toBeNull();
  });
});
