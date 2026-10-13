// 端對端測試用的固定資料（前端精簡格式，見 scripts/build_web_data.py）。
// 規格取自真實品項，但不依賴每週變動的規格庫與每日報價，讓測試結果固定。
import type { CatalogData, PricesData } from '../src/engine/types';

export const CATALOG: CatalogData = {
  redirects: { 'case:lian-li:a4-h2o-old': 'case:lian-li:a4-h2o' },
  models: {
    'cpu:amd:r7-9800x3d': {
      c: 'cpu', b: 'AMD', n: 'R7 9800X3D', r: 'a',
      s: { socket: 'AM5', igpu: true, cooler_included: false, max_power_w: 162 },
    },
    'cpu:intel:i5-14400': {
      c: 'cpu', b: 'Intel', n: 'i5-14400', r: 'a',
      s: { socket: 'LGA1700', igpu: true, max_power_w: 148 },
    },
    'motherboard:gigabyte:x870-gaming-x': {
      c: 'motherboard', b: '技嘉 GIGABYTE', n: 'X870 GAMING X', r: 'a',
      s: { socket: 'AM5', memory_type: 'DDR5', form_factor: 'ATX', dimm_slots: 4 },
    },
    'motherboard:asus:b760m-d4': {
      c: 'motherboard', b: '華碩 ASUS', n: 'B760M D4', r: 'a',
      s: { socket: 'LGA1700', memory_type: 'DDR4', form_factor: 'M-ATX', dimm_slots: 2 },
    },
    'ram:adata:32gb-ddr5-6000': {
      c: 'ram', b: '威剛 ADATA', n: '32GB(16GB×2) DDR5-6000', r: 'a', v: { black: '黑', white: '白' },
      s: { memory_type: 'DDR5', capacity_gb: 32, modules: 2 },
    },
    'ram:kingston:32gb-ddr4-3200': {
      c: 'ram', b: '金士頓 Kingston', n: '32GB(16GB×2) DDR4-3200', r: 'a',
      s: { memory_type: 'DDR4', capacity_gb: 32, modules: 2 },
    },
    'gpu:msi:rtx5080-ventus': {
      c: 'gpu', b: '微星 MSI', n: 'RTX5080 16G VENTUS 3X OC', r: 'a',
      s: { length_mm: 303, board_power_w: 360 }, x: { length_mm: { t: 10 }, board_power_w: { i: 1 } },
    },
    'cooler:thermalright:phantom-spirit-120': {
      c: 'cooler', b: '利民 Thermalright', n: 'Phantom Spirit 120 EVO', r: 'a',
      s: { cooler_type: 'air', height_mm: 157, sockets: ['AM4', 'AM5', 'LGA1700', 'LGA1851'] },
    },
    'case:lian-li:a4-h2o': {
      c: 'case', b: '聯力 Lian Li', n: 'A4-H2O', r: 'a',
      s: { max_mb_form_factor: 'Mini-ITX', gpu_clearance_mm: 322, cooler_clearance_mm: 55, psu_form_factors: ['SFX'] },
    },
    'case:thermaltake:the-tower-300': {
      c: 'case', b: '曜越 Thermaltake', n: 'The Tower 300', r: 'a',
      s: { max_mb_form_factor: 'M-ATX', gpu_clearance_mm: 400, cooler_clearance_mm: 210, psu_form_factors: ['ATX'] },
      x: { gpu_clearance_mm: { k: [[280, 'psu_shroud_installed']] } },
    },
    'psu:asus:tuf-1000w': {
      c: 'psu', b: '華碩 ASUS', n: 'TUF GAMING 1000W 金牌', r: 'a',
      s: { wattage: 1000, form_factor: 'ATX' }, x: { form_factor: { i: 1 } },
    },
    'psu:fsp:hydro-550w': {
      c: 'psu', b: '全漢 FSP', n: 'HYDRO K PRO 550W 銅牌', r: 'a',
      s: { wattage: 550, form_factor: 'ATX' }, x: { form_factor: { i: 1 } },
    },
    'psu:corsair:sf750': {
      c: 'psu', b: '海盜船 Corsair', n: 'SF750 白金', r: 'a',
      s: { wattage: 750, form_factor: 'SFX' },
    },
  },
};

export const PRICES: PricesData = {
  fetched_at: new Date().toISOString(),
  status: 'ok',
  vendor: 'coolpc',
  offers: [
    { m: 'cpu:amd:r7-9800x3d', p: 15990 },
    { m: 'cpu:intel:i5-14400', p: 6290 },
    { m: 'motherboard:gigabyte:x870-gaming-x', p: 7490 },
    { m: 'ram:adata:32gb-ddr5-6000', p: 3290, d: 200, v: 'black' },
    { m: 'ram:adata:32gb-ddr5-6000', p: 3390, d: 200, v: 'white' },
    { m: 'gpu:msi:rtx5080-ventus', p: 36990 },
    { m: 'case:lian-li:a4-h2o', p: 4990 },
    { m: 'psu:asus:tuf-1000w', p: 4490 },
    { m: 'psu:asus:tuf-1000w', p: 3990, c: { t: 'assembly' } },
    { m: 'psu:fsp:hydro-550w', p: 1590 },
    { m: 'psu:corsair:sf750', p: 4690 },
  ],
};
