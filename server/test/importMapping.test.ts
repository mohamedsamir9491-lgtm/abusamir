import { describe, it, expect } from 'vitest';
import { suggestMapping, compositeHeaders, headerConflictsWithField } from '../src/modules/imports/fields.js';
describe('trial balance column auto-mapping', () => {
  it('maps merged PDF headers correctly (opening is never taken as closing)', () => {
    const m = suggestMapping('trial_balance', ['رمز الحساب', 'اسم الحساب', 'الرصيد الافتتاحي', 'مدين الفترة', 'دائن الفترة', 'الرصيد النهائي']);
    expect(m).toMatchObject({ account_code: 0, account_name: 1, opening_balance: 2, period_debit: 3, period_credit: 4, closing_balance: 5 });
  });
  it('maps two-row headers via composite headers', () => {
    const rows = [['', '', 'الرصيد الافتتاحي', '01/01/2026 - 01/11/2026', '', 'الرصيد النهائي'], ['رمز الحساب', 'اسم الحساب', 'الرصيد', 'المدين', 'الدائن', 'الرصيد']];
    const m = suggestMapping('trial_balance', compositeHeaders(rows, 2));
    expect(m.opening_balance).toBe(2); expect(m.closing_balance).toBe(5); expect(m.period_debit).toBe(3); expect(m.period_credit).toBe(4);
  });
  it('maps six-column debit/credit layouts', () => {
    const m = suggestMapping('trial_balance', ['الرمز', 'اسم الحساب', 'افتتاحي مدين', 'افتتاحي دائن', 'حركة مدين', 'حركة دائن', 'ختامي مدين', 'ختامي دائن']);
    expect(m).toMatchObject({ opening_debit: 2, opening_credit: 3, period_debit: 4, period_credit: 5, closing_debit: 6, closing_credit: 7 });
  });
  it('maps English headers', () => {
    const m = suggestMapping('trial_balance', ['Account Code', 'Account Name', 'Opening Balance', 'Debit', 'Credit', 'Closing Balance']);
    expect(m.opening_balance).toBe(2); expect(m.closing_balance).toBe(5);
  });
  it('flags conflicting header/field pairs', () => {
    expect(headerConflictsWithField('الرصيد الافتتاحي', 'closing')).toBe(true);
    expect(headerConflictsWithField('الرصيد النهائي', 'opening')).toBe(true);
    expect(headerConflictsWithField('مدين الفترة', 'movements')).toBe(false);
    expect(headerConflictsWithField('الرصيد', 'closing')).toBe(false);
  });
});
