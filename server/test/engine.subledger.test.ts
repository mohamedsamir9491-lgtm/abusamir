import { describe, it, expect } from 'vitest';
import { validateJournal, reconcileJournalToTb } from '../src/engine/journal.js';
import { reconcileSubledgerToGl, ageReceivables, analyzeFixedAssets, analyzeInventory, reconcileBank, type SubRecord } from '../src/engine/subledger.js';
import { parseDate, daysBetween } from '../src/lib/dates.js';
import { fmtMoney } from '../src/modules/reports/format.js';

const rec = (p: Partial<SubRecord>): SubRecord => ({ record_type: 'receivable', record_date: null, reference: null, counterparty: null, description: null, amount: null, debit: null, credit: null, balance: null, quantity: null, data: {}, source_row: null, ...p });

describe('journal engine', () => {
  it('flags unbalanced, duplicate and out-of-period entries and reconciles movements to TB', () => {
    const r = validateJournal([
      { entry_no: 'J1', entry_date: '2025-03-01', description: 'a', lines: [{ account_code: '1', debit: '100', credit: '0' }, { account_code: '2', debit: '0', credit: '100' }] },
      { entry_no: 'J2', entry_date: '2025-03-01', description: 'a', lines: [{ account_code: '1', debit: '100', credit: '0' }, { account_code: '2', debit: '0', credit: '100' }] },
      { entry_no: 'J3', entry_date: '2026-01-01', description: 'b', lines: [{ account_code: '1', debit: '50', credit: '0' }, { account_code: '2', debit: '0', credit: '40' }] },
    ], { periodStart: '2025-01-01', periodEnd: '2025-12-31' });
    expect(r.summary.unbalanced_entries).toBe(1); expect(r.summary.duplicates).toBe(1); expect(r.summary.out_of_period).toBe(1);
    expect(r.account_movements['1'].debit).toBe('250.00');
    const rec2 = reconcileJournalToTb(r.account_movements, [{ account_code: '1', account_name: 'x', opening_debit: '0', opening_credit: '0', period_debit: '250', period_credit: '0', closing_debit: '250', closing_credit: '0' }, { account_code: '9', account_name: 'y', opening_debit: '0', opening_credit: '0', period_debit: '5', period_credit: '0', closing_debit: '5', closing_credit: '0' }]);
    expect(rec2.summary.matched).toBe(1); expect(rec2.findings.map((f) => f.rule_code)).toEqual(['REC-001', 'REC-002']);
  });
});

describe('subledger engine', () => {
  it('reconciles subledger total to GL with correct side', () => {
    const r = reconcileSubledgerToGl({ type: 'payable', records: [rec({ balance: '600' }), rec({ balance: '400' })], glEntries: [{ account_code: '2101', account_name: 'AP', opening_debit: '0', opening_credit: '0', period_debit: '0', period_credit: '0', closing_debit: '0', closing_credit: '1000' }], expectedSide: 'credit' });
    expect(r.matched).toBe(true); expect(r.difference).toBe('0.00');
    const bad = reconcileSubledgerToGl({ type: 'receivable', records: [rec({ balance: '950' })], glEntries: [{ account_code: '1201', account_name: 'AR', opening_debit: '0', opening_credit: '0', period_debit: '0', period_credit: '0', closing_debit: '1000', closing_credit: '0' }], expectedSide: 'debit' });
    expect(bad.matched).toBe(false); expect(bad.findings[0].rule_code).toBe('SL-001'); expect(bad.findings[0].amount).toBe('50.00');
  });
  it('ages receivables into buckets with concentration', () => {
    const a = ageReceivables([rec({ counterparty: 'A', record_date: '2025-12-20', balance: '100' }), rec({ counterparty: 'A', record_date: '2025-06-01', balance: '300' }), rec({ counterparty: 'B', record_date: '2025-11-15', balance: '100' })], '2025-12-31');
    expect(a.total).toBe('500.00'); expect(a.buckets[0].amount).toBe('100.00'); expect(a.buckets[1].amount).toBe('100.00'); expect(a.buckets[4].amount).toBe('300.00');
    expect(a.concentration[0].party).toBe('A'); expect(a.concentration[0].pct).toBe('80.0');
  });
  it('checks fixed asset arithmetic and inventory valuation', () => {
    const fa = analyzeFixedAssets([rec({ record_type: 'fixed_asset', description: 'سيارة', amount: '100000', data: { cost: '100000', accumulated_depreciation: '120000', net_book_value: '0', depreciation_period: '20000', rate_pct: '20' } }), rec({ record_type: 'fixed_asset', description: 'جهاز', data: { cost: '10000', accumulated_depreciation: '2000', net_book_value: '7000', rate_pct: '20', depreciation_period: '2000' } })], '1000');
    expect(fa.findings.map((f) => f.rule_code).sort()).toEqual(['FA-001', 'FA-002', 'FA-003']);
    expect(fa.summary.cost).toBe('110000.00');
    const inv = analyzeInventory([rec({ record_type: 'inventory', description: 'x', quantity: '10', amount: '100', data: { unit_cost: '9' } }), rec({ record_type: 'inventory', description: 'y', quantity: '-2', amount: '-20', data: {} })], '1000');
    expect(inv.findings.map((f) => f.rule_code).sort()).toEqual(['INV-001', 'INV-002']);
  });
  it('matches bank statement lines to book entries by amount and date window', () => {
    const r = reconcileBank({ bankTx: [rec({ record_type: 'bank_transaction', record_date: '2025-05-02', credit: '1000', debit: '0' }), rec({ record_type: 'bank_transaction', record_date: '2025-05-10', debit: '50', credit: '0', description: 'رسوم' })], bookTx: [{ date: '2025-05-01', amount: '1000', ref: 'JV1', description: 'تحصيل', row: 1 }, { date: '2025-05-20', amount: '-300', ref: 'JV2', description: 'شيك', row: 2 }], bankClosing: '650', bookClosing: '700' });
    expect(r.summary.matched).toBe(1); expect(r.summary.unmatched_bank).toBe(1); expect(r.summary.unmatched_book).toBe(1); expect(r.summary.balance_difference).toBe('-50.00');
    expect(r.findings.map((f) => f.rule_code)).toEqual(['BANK-001', 'BANK-002', 'BANK-003']);
  });
});

describe('dates and formatting', () => {
  it('parses common date formats including excel serials and arabic digits', () => {
    expect(parseDate('31/12/2025')).toBe('2025-12-31'); expect(parseDate('2025-01-05')).toBe('2025-01-05'); expect(parseDate(45658)).toBe('2025-01-01'); expect(parseDate('١/٢/٢٠٢٥')).toBe('2025-02-01'); expect(parseDate('abc')).toBeNull();
    expect(daysBetween('2025-01-01', '2025-12-31')).toBe(365);
  });
  it('formats money with grouping and parentheses for negatives', () => {
    expect(fmtMoney('1234567.891')).toBe('1,234,567.89'); expect(fmtMoney('-50')).toBe('(50.00)'); expect(fmtMoney(null)).toBe('—');
  });
});
