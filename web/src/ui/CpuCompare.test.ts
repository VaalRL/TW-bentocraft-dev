import { describe, expect, it } from 'vitest';
import type { Model } from '../engine/types';
import { ROWS, winner } from './CpuCompare';

const cpu = (id: string, s: Model['s']): Model => ({ id, c: 'cpu', b: 'AMD', n: id, s, r: 'a' });
const row = (label: string) => ROWS.find(r => r.label === label)!;

describe('CPU 比較', () => {
  const a = cpu('a', { cores: 8, threads: 16, l3_cache_mb: 96, tdp_w: 120, igpu: true, igpu_name: 'Radeon Graphics' });
  const b = cpu('b', { cores: 12, threads: 24, l3_cache_mb: 64, tdp_w: 120, igpu: false });

  it('數值較高的一邊較好；相同或缺資料不比較', () => {
    expect(winner(row('核心／執行緒'), a, b)).toBe('b');
    expect(winner(row('L3 快取'), a, b)).toBe('a');
    expect(winner(row('最高加速時脈'), a, b)).toBeNull();
  });

  it('功耗只並列、不分好壞', () => {
    expect(winner(row('TDP／基礎功耗'), a, b)).toBeNull();
  });

  it('沒有內顯時說明需要獨立顯卡；混合架構列出 P／E 核心', () => {
    expect(row('內建顯示').value(b)).toBe('無（需獨立顯卡）');
    expect(row('核心／執行緒').value(cpu('i', { cores: 14, threads: 14, p_cores: 6, e_cores: 8 }))).toBe('14 核／14 緒（6P＋8E）');
  });
});
