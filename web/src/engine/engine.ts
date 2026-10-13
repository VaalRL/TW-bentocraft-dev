// 求解：評估候選零件與前向檢查（見 02 第三節）。
import { PAIR_CONSTRAINTS, buildChecks } from './constraints';
import type { Category, Check, Model, Selection, Status } from './types';

const SEVERITY: Record<Status, number> = { fail: 3, warn: 2, unknown: 1, pass: 0 };

export const worst = (checks: Check[]): Status =>
  checks.reduce<Status>((w, c) => (SEVERITY[c.status] > SEVERITY[w] ? c.status : w), 'pass');

/** 型號與配單中其他已選零件之間的成對檢查（不含 m 自己類別的已選零件）。 */
export function pairChecks(m: Model, sel: Selection): Check[] {
  const out: Check[] = [];
  for (const c of PAIR_CONSTRAINTS) {
    const [a, b] = c.between;
    if (a === m.c && b !== m.c && sel[b]) out.push(c.check(m, sel[b]!));
    else if (b === m.c && a !== m.c && sel[a]) out.push(c.check(sel[a]!, m));
  }
  return out;
}

/** 候選零件放進目前配單後的所有檢查結果（成對 ＋ 整機）。 */
export function evaluate(candidate: Model, sel: Selection): Check[] {
  const trial: Selection = { ...sel, [candidate.c]: candidate };
  return [...pairChecks(candidate, sel), ...buildChecks(trial)];
}

/** 目前配單中所有已選零件的檢查結果（每對只算一次）。 */
export function selectionChecks(sel: Selection): Check[] {
  const out: Check[] = [];
  for (const c of PAIR_CONSTRAINTS) {
    const [a, b] = c.between;
    if (sel[a] && sel[b]) out.push(c.check(sel[a]!, sel[b]!));
  }
  return [...out, ...buildChecks(sel)];
}

const neighboursOf = (cat: Category): Category[] =>
  [...new Set(PAIR_CONSTRAINTS.filter(c => c.between.includes(cat)).flatMap(c => c.between))].filter(x => x !== cat);

/**
 * 前向檢查。先把每個尚未選擇的相鄰類別篩成「與目前配單不衝突」的值域，
 * 回傳一個函式：給候選零件，回傳選它之後哪些類別會完全沒有可選項。
 * 例：已選 AM5 CPU，候選 DDR4 記憶體 → 主機板類別沒有 AM5 ＋ DDR4 → ['motherboard']。
 */
export function deadEndChecker(category: Category, sel: Selection, catalog: Record<Category, Model[]>) {
  // 使用者可能正在替換這個類別已選的零件：篩選相鄰類別時不能拿舊零件比對
  const base: Selection = { ...sel };
  delete base[category];
  const domains = new Map<Category, Model[]>();
  for (const cat of neighboursOf(category)) {
    if (base[cat]) continue;
    domains.set(cat, catalog[cat].filter(m => pairChecks(m, base).every(c => c.status !== 'fail')));
  }
  return (candidate: Model): Category[] => {
    const dead: Category[] = [];
    for (const [cat, models] of domains) {
      const constraints = PAIR_CONSTRAINTS.filter(c => c.between.includes(cat) && c.between.includes(candidate.c));
      const ok = models.some(m =>
        constraints.every(c => (c.between[0] === cat ? c.check(m, candidate) : c.check(candidate, m)).status !== 'fail'),
      );
      if (!ok) dead.push(cat);
    }
    return dead;
  };
}
