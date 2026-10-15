import { describe, expect, it } from 'vitest';
import type { Model } from '../engine/types';
import { FACETS, SORTS, facetOptions, gpuChip, matches, thresholdSteps, type Facet } from './filters';

const model = (c: Model['c'], b: string, s: Model['s'], n = 'x'): Model => ({ id: `${c}:${b}:${n}`, c, b, n, s, r: 'a' });
const facet = <K extends Facet['kind']>(c: Model['c'], id: string) => FACETS[c].find(f => f.id === id) as Extract<Facet, { kind: K }>;

describe('顯示卡晶片', () => {
  it('從各品牌的型號名稱取出晶片', () => {
    expect(gpuChip('DUAL-RTX5060TI-O16G')).toBe('RTX 5060 Ti');
    expect(gpuChip('RTX5080 16G VENTUS 3X OC')).toBe('RTX 5080');
    expect(gpuChip('NITRO RX9070XT 16G OC')).toBe('RX 9070 XT');
    expect(gpuChip('ATS-RX9070GRE-O12G')).toBe('RX 9070 GRE');
    expect(gpuChip('GT1030-SL-2G-BRK')).toBe('GT 1030');
    expect(gpuChip('Arc B580 Steel Legend')).toBe('Arc B580');
    expect(gpuChip('N710D3-2GL')).toBeUndefined();
  });
});

describe('篩選', () => {
  const cases = [
    model('case', 'A', { max_mb_form_factor: 'E-ATX' }, 'big'),
    model('case', 'B', { max_mb_form_factor: 'M-ATX' }, 'small'),
    model('case', 'B', { max_mb_form_factor: 'Mini-ITX' }, 'itx'),
  ];

  it('機殼「可裝主機板」包含較小的尺寸', () => {
    const mb = facet<'group'>('case', 'mb');
    expect(facetOptions(mb, cases).map(o => `${o.value}:${o.count}`)).toEqual(['E-ATX:1', 'ATX:1', 'M-ATX:2', 'Mini-ITX:3']);
    expect(cases.filter(m => matches(m, [mb], { mb: ['M-ATX'] })).map(m => m.n)).toEqual(['big', 'small']);
  });

  it('同一組任一符合即可，不同組都要符合', () => {
    const facets = FACETS.case;
    expect(cases.filter(m => matches(m, facets, { brand: ['A', 'B'] }))).toHaveLength(3);
    expect(cases.filter(m => matches(m, facets, { brand: ['B'], mb: ['ATX'] }))).toHaveLength(0);
  });

  it('門檻：至少／不超過，沒有數值的型號在設定門檻後不顯示', () => {
    const watt = facet<'min'>('psu', 'watt');
    const psus = [model('psu', 'A', { wattage: 550 }, '550'), model('psu', 'A', { wattage: 850 }, '850'), model('psu', 'A', {}, '?')];
    expect(psus.filter(m => matches(m, [watt], { watt: ['750'] })).map(m => m.n)).toEqual(['850']);
    expect(thresholdSteps(watt, psus)).toEqual([550, 650, 750, 850]);
    const length = facet<'max'>('gpu', 'length');
    expect(thresholdSteps(length, [model('gpu', 'A', { length_mm: 260 })])).toEqual([280, 300, 330]);
  });

  it('數字選項依大小排序並加上單位', () => {
    const cap = facet<'group'>('ssd', 'capacity');
    const ssds = [4096, 480, 1000, 1024, 960, 256].map((gb, i) => model('ssd', 'A', { capacity_gb: gb }, String(i)));
    expect(facetOptions(cap, ssds).map(o => `${o.label}:${o.count}`)).toEqual(['250 GB 級:1', '500 GB 級:1', '1 TB:3', '4 TB:1']);
  });
});

describe('排序', () => {
  it('每單位價格以今天的價格計算', () => {
    const perGb = SORTS.ram.find(s => s.id === 'per-gb')!;
    expect(perGb.key(model('ram', 'A', { capacity_gb: 32 }), { price: 3200 })).toBe(100);
    expect(perGb.key(model('ram', 'A', { capacity_gb: 32 }), {})).toBeUndefined();
    expect(perGb.show!(100)).toBe('每 GB $100');
  });
});
