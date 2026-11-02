import { D, sum, toStr, net } from './money.js';
import type { EngineFinding, TbEntry } from './types.js';

export interface JournalLineIn { account_code: string; account_name?: string | null; debit: string; credit: string; description?: string | null; counterparty?: string | null; source_row?: number | null }
export interface JournalEntryIn { entry_no: string | null; entry_date: string | null; description: string | null; reference?: string | null; lines: JournalLineIn[]; source_row?: number | null }

export interface JournalValidationResult {
  summary: { entries: number; lines: number; total_debit: string; total_credit: string; unbalanced_entries: number; duplicates: number; out_of_period: number };
  findings: EngineFinding[];
  account_movements: Record<string, { debit: string; credit: string }>;
}

export function validateJournal(entries: JournalEntryIn[], opts: { periodStart?: string; periodEnd?: string; tolerance?: string; materiality?: string } = {}): JournalValidationResult {
  const tol = D(opts.tolerance ?? '0.05');
  const findings: EngineFinding[] = [];
  const movements: Record<string, { debit: ReturnType<typeof D>; credit: ReturnType<typeof D> }> = {};
  let unbalanced = 0; let outOfPeriod = 0; let lines = 0;
  let totalDr = D(0); let totalCr = D(0);
  const sigMap = new Map<string, JournalEntryIn[]>();

  for (const je of entries) {
    const dr = sum(je.lines.map((l) => l.debit)); const cr = sum(je.lines.map((l) => l.credit));
    totalDr = totalDr.plus(dr); totalCr = totalCr.plus(cr); lines += je.lines.length;
    for (const l of je.lines) {
      const m = movements[l.account_code] ?? { debit: D(0), credit: D(0) };
      m.debit = m.debit.plus(D(l.debit)); m.credit = m.credit.plus(D(l.credit)); movements[l.account_code] = m;
      if (D(l.debit).lt(0) || D(l.credit).lt(0)) {
        findings.push({ rule_code: 'JE-005', category: 'data_quality', severity: 'medium', title: `قيمة سالبة في سطر قيد ${je.entry_no ?? ''}`,
          description: `السطر (صف ${l.source_row ?? '?'}) للحساب ${l.account_code} يحمل قيمة سالبة (مدين ${toStr(l.debit)} / دائن ${toStr(l.credit)}).`,
          account_code: l.account_code, account_name: l.account_name, source_row_ref: l.source_row != null ? `الصف ${l.source_row}` : null,
          amount: toStr(D(l.debit).abs().plus(D(l.credit).abs())), evidence: { entry_no: je.entry_no, debit: toStr(l.debit), credit: toStr(l.credit) }, dedupe_key: `JE-005:${je.entry_no}:${l.source_row}` });
      }
      if (!D(l.debit).isZero() && !D(l.credit).isZero()) {
        findings.push({ rule_code: 'JE-006', category: 'data_quality', severity: 'low', title: `سطر قيد يحمل مدينًا ودائنًا معًا (${je.entry_no ?? ''})`,
          description: `السطر للحساب ${l.account_code} يحمل مدين ${toStr(l.debit)} ودائن ${toStr(l.credit)} في السطر نفسه.`,
          account_code: l.account_code, source_row_ref: l.source_row != null ? `الصف ${l.source_row}` : null, amount: toStr(D(l.debit).plus(l.credit)),
          evidence: { entry_no: je.entry_no }, dedupe_key: `JE-006:${je.entry_no}:${l.source_row}` });
      }
    }
    if (dr.minus(cr).abs().gt(tol)) {
      unbalanced++;
      findings.push({ rule_code: 'JE-001', category: 'math_error', severity: 'high', title: `قيد غير متوازن: ${je.entry_no ?? 'بدون رقم'}`,
        description: `القيد ${je.entry_no ?? ''} بتاريخ ${je.entry_date ?? '?'} مجموع مدينه ${toStr(dr)} ودائنه ${toStr(cr)}؛ الفرق ${toStr(dr.minus(cr))}.`,
        amount: toStr(dr.minus(cr).abs()), source_row_ref: je.source_row != null ? `الصف ${je.source_row}` : null,
        evidence: { entry_no: je.entry_no, date: je.entry_date, debit: toStr(dr), credit: toStr(cr), lines: je.lines.length },
        calculation: `${toStr(dr)} - ${toStr(cr)} = ${toStr(dr.minus(cr))}`, recommendation: 'مراجعة أسطر القيد في دفتر اليومية وتصحيحه.', dedupe_key: `JE-001:${je.entry_no}:${je.source_row}` });
    }
    if (je.entry_date && opts.periodStart && opts.periodEnd && (je.entry_date < opts.periodStart || je.entry_date > opts.periodEnd)) {
      outOfPeriod++;
      findings.push({ rule_code: 'JE-002', category: 'data_quality', severity: 'medium', title: `قيد خارج الفترة: ${je.entry_no ?? ''} (${je.entry_date})`,
        description: `تاريخ القيد ${je.entry_date} يقع خارج الفترة المالية (${opts.periodStart} إلى ${opts.periodEnd}).`,
        amount: toStr(dr), evidence: { entry_no: je.entry_no, date: je.entry_date }, recommendation: 'التحقق من انتماء القيد للفترة الصحيحة (مبدأ الاستحقاق/القطع).', dedupe_key: `JE-002:${je.entry_no}:${je.source_row}` });
    }
    if (!je.entry_date) {
      findings.push({ rule_code: 'JE-003', category: 'data_quality', severity: 'low', title: `قيد بدون تاريخ: ${je.entry_no ?? ''}`, description: 'القيد لا يحمل تاريخًا صالحًا.',
        amount: toStr(dr), evidence: { entry_no: je.entry_no }, dedupe_key: `JE-003:${je.entry_no}:${je.source_row}` });
    }
    // بصمة لاكتشاف التكرار: نفس التاريخ + نفس المبلغ + نفس الحسابات
    const sig = `${je.entry_date ?? ''}|${toStr(dr)}|${je.lines.map((l) => `${l.account_code}:${toStr(l.debit)}:${toStr(l.credit)}`).sort().join(',')}`;
    if (!sigMap.has(sig)) sigMap.set(sig, []);
    sigMap.get(sig)!.push(je);
  }
  let duplicates = 0;
  for (const [, group] of sigMap) {
    if (group.length > 1 && !sum(group[0].lines.map((l) => l.debit)).isZero()) {
      duplicates += group.length - 1;
      findings.push({ rule_code: 'JE-004', category: 'accounting_issue', severity: 'medium', title: `قيود محتملة التكرار (${group.length}): ${group.map((g) => g.entry_no ?? '?').join('، ')}`,
        description: `القيود ${group.map((g) => g.entry_no ?? '?').join('، ')} بتاريخ ${group[0].entry_date ?? '?'} تحمل نفس المبالغ ونفس الحسابات. قد تكون قيودًا مكررة أو معاملات متطابقة مشروعة.`,
        amount: toStr(sum(group[0].lines.map((l) => l.debit))), evidence: { entries: group.map((g) => ({ entry_no: g.entry_no, date: g.entry_date, description: g.description, row: g.source_row })) },
        recommendation: 'التحقق من المستندات المؤيدة لكل قيد.', dedupe_key: `JE-004:${group.map((g) => g.entry_no).join('|')}` });
    }
  }
  return {
    summary: { entries: entries.length, lines, total_debit: toStr(totalDr), total_credit: toStr(totalCr), unbalanced_entries: unbalanced, duplicates, out_of_period: outOfPeriod },
    findings, account_movements: Object.fromEntries(Object.entries(movements).map(([k, v]) => [k, { debit: toStr(v.debit), credit: toStr(v.credit) }])),
  };
}

/** مطابقة حركات اليومية مع حركات ميزان المراجعة لكل حساب */
export function reconcileJournalToTb(movements: Record<string, { debit: string; credit: string }>, tb: TbEntry[], tolerance = '0.05') {
  const tol = D(tolerance);
  const findings: EngineFinding[] = [];
  const items: { account_code: string; account_name: string | null; tb_debit: string; tb_credit: string; je_debit: string; je_credit: string; diff_debit: string; diff_credit: string; matched: boolean }[] = [];
  const seen = new Set<string>();
  for (const e of tb) {
    const m = movements[e.account_code] ?? { debit: '0', credit: '0' };
    seen.add(e.account_code);
    const dd = D(e.period_debit).minus(m.debit); const dc = D(e.period_credit).minus(m.credit);
    const matched = dd.abs().lte(tol) && dc.abs().lte(tol);
    items.push({ account_code: e.account_code, account_name: e.account_name, tb_debit: toStr(e.period_debit), tb_credit: toStr(e.period_credit), je_debit: toStr(m.debit), je_credit: toStr(m.credit), diff_debit: toStr(dd), diff_credit: toStr(dc), matched });
    if (!matched) {
      findings.push({ rule_code: 'REC-001', category: 'math_error', severity: 'high', title: `حركات الحساب ${e.account_code} في الميزان لا تطابق دفتر اليومية`,
        description: `${e.account_name ?? e.account_code}: الميزان يظهر مدين ${toStr(e.period_debit)} / دائن ${toStr(e.period_credit)} بينما مجموع قيود اليومية مدين ${toStr(m.debit)} / دائن ${toStr(m.credit)}.`,
        account_code: e.account_code, account_name: e.account_name, amount: toStr(dd.abs().plus(dc.abs())),
        evidence: { tb: { debit: toStr(e.period_debit), credit: toStr(e.period_credit) }, journal: m }, calculation: `فرق المدين ${toStr(dd)}، فرق الدائن ${toStr(dc)}`,
        recommendation: 'التحقق من اكتمال قيود اليومية المستوردة أو وجود قيود غير مرحّلة.', dedupe_key: `REC-001:${e.account_code}` });
    }
  }
  for (const [code, m] of Object.entries(movements)) {
    if (!seen.has(code) && (!D(m.debit).isZero() || !D(m.credit).isZero())) {
      findings.push({ rule_code: 'REC-002', category: 'data_quality', severity: 'medium', title: `حساب في اليومية غير موجود في ميزان المراجعة: ${code}`,
        description: `القيود تتضمن حركات للحساب ${code} (مدين ${m.debit} / دائن ${m.credit}) ولا يظهر في الميزان.`, account_code: code, amount: toStr(D(m.debit).plus(m.credit)),
        evidence: { journal: m }, dedupe_key: `REC-002:${code}` });
    }
  }
  return { items, findings, summary: { accounts: items.length, matched: items.filter((i) => i.matched).length, unmatched: items.filter((i) => !i.matched).length } };
}
export { net };
