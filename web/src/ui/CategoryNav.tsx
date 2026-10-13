import { constraintInvolves } from '../engine/constraints';
import { selectionChecks, worst } from '../engine/engine';
import { CATEGORIES, type Category, type Selection } from '../engine/types';
import { CATEGORY_LABEL, modelName } from './format';

export function CategoryNav({ active, onSelect, selection }: {
  active: Category;
  onSelect: (c: Category) => void;
  selection: Selection;
}) {
  const checks = selectionChecks(selection);
  return (
    <nav className="category-nav" aria-label="零件類別">
      {CATEGORIES.map(cat => {
        const m = selection[cat];
        // 該類別已選零件涉及的檢查中最嚴重的結果
        const mine = checks.filter(c => constraintInvolves(c.constraint, cat));
        const status = m ? worst(mine) : null;
        return (
          <button
            key={cat}
            className={`category ${cat === active ? 'is-active' : ''}`}
            aria-current={cat === active ? 'true' : undefined}
            onClick={() => onSelect(cat)}
          >
            <span className="category-label">
              {status && <span className={`dot status-${status}`} aria-hidden="true" />}
              {CATEGORY_LABEL[cat]}
            </span>
            <span className="category-pick">{m ? modelName(m) : '未選擇'}</span>
          </button>
        );
      })}
    </nav>
  );
}
