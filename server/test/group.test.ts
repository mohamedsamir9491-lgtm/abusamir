import { describe, it, expect } from 'vitest';
import { nameTokens, hits } from '../src/modules/engagements/group.js';
import { fmtAmounts } from '../src/lib/textfmt.js';
describe('group account matching by name', () => {
  it('matches investment and current accounts to the right company', () => {
    const grand = nameTokens('شركة جراند إستيتس'), uni = nameTokens('شركة يونيسكوب سولوشنز'), osos = nameTokens('شركة أسس القابضة'), desert = nameTokens('شركة ديزرت جيت');
    expect(hits('استثمارت في شركات تابعة جراند ستيت', grand)).toBeGreaterThan(0);
    expect(hits('استثمارت في شركات تابعة جراند ستيت', uni)).toBe(0);
    expect(hits('استثمارت في شركات تابعة يونيسكوب', uni)).toBeGreaterThan(0);
    expect(hits('جاري شركة اسس القابضة', osos)).toBeGreaterThan(0);   // أسس/اسس
    expect(hits('ذمم مدينة للشركات التابعة ديزرت جيت', desert)).toBeGreaterThan(0);
    expect(hits('مصروف ايجار المكتب', grand)).toBe(0);
    expect(nameTokens('شركة أسس القابضة')).toEqual(['اسس']);
  });
  it('formats amounts in text without touching codes or dates', () => {
    expect(fmtAmounts('فروق 19602.24 في الحساب 106021 بتاريخ 3/11/2026')).toBe('فروق 19,602.24 في الحساب 106021 بتاريخ 3/11/2026');
    expect(fmtAmounts('-292502.74 + (-98508.26) = -391011.00')).toBe('-292,502.74 + (-98,508.26) = -391,011.00');
    expect(fmtAmounts('1,532.00 كما هي')).toBe('1,532.00 كما هي');
  });
});
