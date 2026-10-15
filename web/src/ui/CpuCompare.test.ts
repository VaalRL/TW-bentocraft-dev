import { describe, expect, it } from 'vitest';
import type { Model } from '../engine/types';
import { DEFAULT_ORDER, ROWS, best, mergeOrder } from './CpuCompare';

const cpu = (id: string, s: Model['s']): Model => ({ id, c: 'cpu', b: 'AMD', n: id, s, r: 'a' });
const row = (label: string) => ROWS.find(r => r.label === label)!;

describe('CPU 比較', () => {
  const a = cpu('a', { cores: 8, threads: 16, l3_cache_mb: 96, tdp_w: 120, igpu: true, igpu_name: 'Radeon Graphics' });
  const b = cpu('b', { cores: 12, threads: 24, l3_cache_mb: 64, tdp_w: 120, igpu: false });
  const c = cpu('c', { cores: 12, threads: 24, l3_cache_mb: 32 });

  it('數值最高的欄較好；相同或缺資料不比較', () => {
    expect([...best(row('核心／執行緒'), [a, b])]).toEqual([1]);
    expect([...best(row('L3 快取'), [a, b])]).toEqual([0]);
    expect(best(row('最高加速時脈'), [a, b]).size).toBe(0);
  });

  it('三欄以上：同分的欄都標出，只有一欄有資料時不標', () => {
    expect([...best(row('核心／執行緒'), [a, b, c])]).toEqual([1, 2]);
    expect([...best(row('L3 快取'), [c, b, a])]).toEqual([2]);
    expect(best(row('最高加速時脈'), [a, cpu('d', { boost_clock_ghz: 5.2 }), b]).size).toBe(0);
  });

  it('越低越好的列取最小值', () => {
    const cheap = { id: 'price', label: '價格', value: () => null, num: (m: Model) => ({ a: 300, b: 100, c: 200 })[m.id], better: 'lower' as const };
    expect([...best(cheap, [a, b, c])]).toEqual([1]);
  });

  it('功耗只並列、不分好壞', () => {
    expect(best(row('TDP／基礎功耗'), [a, b]).size).toBe(0);
  });

  it('沒有內顯時說明需要獨立顯卡；混合架構列出 P／E 核心', () => {
    expect(row('內建顯示').value(b)).toBe('無（需獨立顯卡）');
    expect(row('核心／執行緒').value(cpu('i', { cores: 14, threads: 14, p_cores: 6, e_cores: 8 }))).toBe('14 核／14 緒（6P＋8E）');
  });
});

describe('列順序', () => {
  it('沒有存過時用預設順序', () => {
    expect(mergeOrder(undefined)).toEqual(DEFAULT_ORDER);
    expect(mergeOrder([])).toEqual(DEFAULT_ORDER);
  });

  it('沿用存下的順序，丟掉已不存在的列', () => {
    expect(mergeOrder(['c', 'gone', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  it('新增的列補在預設順序中前一列的後面', () => {
    expect(mergeOrder(['c', 'a'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
    expect(mergeOrder(['c', 'b'], ['a', 'b', 'c'])).toEqual(['a', 'c', 'b']);
  });
});
