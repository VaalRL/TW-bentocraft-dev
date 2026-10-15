import { describe, expect, it } from 'vitest';
import { GLOSSARY, GLOSSARY_BY_ID, annotate, searchGlossary } from './glossary';

const terms = (text: string) => annotate(text).filter(s => s.term).map(s => `${s.text}:${s.term}`);

describe('名詞標註', () => {
  it('長的名詞優先，英數字名詞不會比對到更長單字的一部分', () => {
    expect(terms('M-ATX 以下 · SFX-L 電源')).toEqual(['M-ATX:formfactor', 'SFX-L:sfx']);
    expect(terms('GDDR5 與 TATX')).toEqual([]);
    expect(terms('ATX 3.1 電源')).toEqual(['ATX 3.1:atx3']);
  });

  it('同一段文字中每個名詞只標第一次出現', () => {
    expect(terms('最大功耗（PPT／PL2）')).toEqual(['最大功耗:maxpower']);
    expect(terms('AM5 · DDR5 · AM4')).toEqual(['AM5:socket', 'DDR5:ddr']);
  });

  it('切出的片段接起來就是原文', () => {
    const text = 'LGA1851 · 有內顯 · 附散熱器 · 125 W · PCIe 5.0';
    expect(annotate(text).map(s => s.text).join('')).toBe(text);
  });

  it('每個名詞的 id 不重複，別名不重複', () => {
    expect(GLOSSARY_BY_ID.size).toBe(GLOSSARY.length);
    const aliases = GLOSSARY.flatMap(e => e.aliases);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it('搜尋比對名詞、別名與說明', () => {
    expect(searchGlossary('pcie').map(e => e.id)).toContain('pcie');
    expect(searchGlossary('360').map(e => e.id)).toContain('radiator');
    expect(searchGlossary('')).toHaveLength(GLOSSARY.length);
  });
});
