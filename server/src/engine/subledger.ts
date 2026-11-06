import { D, Decimal, sum, toStr, ZERO, net } from './money.js';
import type { EngineFinding, TbEntry } from './types.js';

export interface SubRecord {
  record_type: string; record_date: string | null; reference: string | null; counterparty: string | null; description: string | null;
  amount: string | null; debit: string | null; credit: string | null; balance: string | null; quantity: string | null; data: Record<string, unknown>; source_row: number | null;
}

const TYPE_LABEL: Record<string, string> = { receivable: 'الذمم المدينة', payable: 'الذمم الدائنة', inventory: 'المخزون', fixed_asset: 'الأصول الثابتة', bank_transaction: 'كشف الحساب البنكي' };

function recordNet(r: SubRecord): Decimal {
  if (r.balance != null && r.balance !== '') return D(r.balance);
  if (r.amount != null && r.amount !== '') return D(r.amount);
  return D(r.debit).minus(D(r.credit));
}

/** مطابقة إجمالي السجل الفرعي مع رصيد حساب الأستاذ العام (من الميزان) */
export function reconcileSubledgerToGl(params: { type: string; records: SubRecord[]; glEntries: TbEntry[]; expectedSide: 'debit' | 'credit'; tolerance?: string }) {
  const tol = D(params.tolerance ?? '0.05');
  const subTotal = sum(params.records.map(recordNet));
  const glNet = sum(params.glEntries.map((e) => net(e.closing_debit, e.closing_credit)));
  const glPresented = params.expectedSide === 'credit' ? glNet.neg() : glNet;
  const diff = subTotal.minus(glPresented);
  const findings: EngineFinding[] = [];
  const label = TYPE_LABEL[params.type] ?? params.type;
  if (params.glEntries.length === 0) {
    findings.push({ rule_code: 'SL-000', category: 'data_quality', severity: 'medium', title: `لا توجد حسابات أستاذ عام مربوطة بـ${label}`,
      description: `تم استيراد ${params.records.length} سجلًا في ${label} بإجمالي ${toStr(subTotal)} لكن لم يُعثر على حساب مقابل في ميزان المراجعة.`, amount: toStr(subTotal.abs()),
      evidence: { subledger_total: toStr(subTotal) }, recommendation: 'ربط الحسابات المناسبة في دليل الحسابات.', dedupe_key: `SL-000:${params.type}` });
  } else if (diff.abs().gt(tol)) {
    findings.push({ rule_code: 'SL-001', category: 'math_error', severity: 'high', title: `${label}: السجل الفرعي لا يطابق الأستاذ العام`,
      description: `إجمالي ${label} حسب السجل الفرعي ${toStr(subTotal)} بينما رصيد الأستاذ العام ${toStr(glPresented)}؛ الفرق ${toStr(diff)}.`,
      amount: toStr(diff.abs()), evidence: { subledger_total: toStr(subTotal), gl_balance: toStr(glPresented), gl_accounts: params.glEntries.map((e) => e.account_code), records: params.records.length },
      calculation: `${toStr(subTotal)} - ${toStr(glPresented)} = ${toStr(diff)}`, impact: 'قد يعكس قيودًا غير مرحّلة للسجل الفرعي، أو فواتير مفقودة، أو قيود يدوية مباشرة على حساب الرقابة.',
      recommendation: 'إعداد مطابقة تفصيلية بين السجل الفرعي وحساب الرقابة وتحديد البنود المعلّقة.', dedupe_key: `SL-001:${params.type}` });
  }
  return { subledger_total: toStr(subTotal), gl_balance: toStr(glPresented), difference: toStr(diff), matched: diff.abs().lte(tol), findings };
}

/** تحليل أعمار الذمم */
export function ageReceivables(records: SubRecord[], asOf: string, buckets = [30, 60, 90, 180]) {
  const asOfD = new Date(asOf + 'T00:00:00Z');
  const labels = ['غير مستحق / حتى 30 يومًا', '31-60 يومًا', '61-90 يومًا', '91-180 يومًا', 'أكثر من 180 يومًا'];
  const totals = labels.map(() => ZERO);
  const byParty = new Map<string, Decimal[]>();
  let undated = ZERO;
  for (const r of records) {
    const amt = recordNet(r);
    const party = r.counterparty ?? 'غير محدد';
    const arr = byParty.get(party) ?? labels.map(() => ZERO);
    if (!r.record_date) { undated = undated.plus(amt); byParty.set(party, arr); continue; }
    const days = Math.floor((asOfD.getTime() - new Date(r.record_date + 'T00:00:00Z').getTime()) / 86400000);
    let idx = buckets.findIndex((b) => days <= b); if (idx === -1) idx = buckets.length;
    totals[idx] = totals[idx].plus(amt); arr[idx] = arr[idx].plus(amt); byParty.set(party, arr);
  }
  const grand = sum(totals).plus(undated);
  return {
    as_of: asOf, buckets: labels.map((l, i) => ({ label: l, amount: toStr(totals[i]), pct: grand.isZero() ? null : totals[i].div(grand).mul(100).toFixed(1) })),
    undated: toStr(undated), total: toStr(grand),
    by_party: [...byParty.entries()].map(([party, arr]) => ({ party, buckets: arr.map(toStr), total: toStr(sum(arr)) })).sort((a, b) => D(b.total).minus(a.total).toNumber()).slice(0, 100),
    concentration: [...byParty.entries()].map(([party, arr]) => ({ party, total: sum(arr) })).sort((a, b) => b.total.minus(a.total).toNumber()).slice(0, 5)
      .map((x) => ({ party: x.party, total: toStr(x.total), pct: grand.isZero() ? null : x.total.div(grand).mul(100).toFixed(1) })),
  };
}

export function analyzeReceivables(records: SubRecord[], asOf: string, type: 'receivable' | 'payable', materiality: string, concentrationPct = 40) {
  const aging = ageReceivables(records, asOf);
  const findings: EngineFinding[] = [];
  const label = type === 'receivable' ? 'الذمم المدينة' : 'الذمم الدائنة';
  const over90 = D(aging.buckets[3].amount).plus(aging.buckets[4].amount);
  if (over90.abs().gte(D(materiality))) {
    findings.push({ rule_code: type === 'receivable' ? 'AR-001' : 'AP-001', category: 'accounting_issue', severity: over90.abs().gte(D(materiality).mul(5)) ? 'high' : 'medium',
      title: `${label} متقادمة لأكثر من 90 يومًا بمبلغ ${toStr(over90)}`,
      description: `${toStr(over90)} من إجمالي ${label} (${aging.total}) متقادمة لأكثر من 90 يومًا${type === 'receivable' ? '؛ يلزم تقييم كفاية مخصص الخسائر الائتمانية المتوقعة' : '؛ يلزم التحقق من صحة الالتزامات وشروط السداد'}.`,
      amount: toStr(over90.abs()), evidence: { aging: aging.buckets, as_of: asOf },
      recommendation: type === 'receivable' ? 'الحصول على تحليل أعمار معتمد وتقييم المخصص وفق سياسة الخسائر الائتمانية المتوقعة.' : 'تأكيد الأرصدة مع الموردين ومراجعة المطابقات.', dedupe_key: `${type}-aging-90` });
  }
  const negatives = records.filter((r) => recordNet(r).lt(0));
  if (negatives.length) {
    const total = sum(negatives.map(recordNet));
    findings.push({ rule_code: type === 'receivable' ? 'AR-002' : 'AP-002', category: 'accounting_issue', severity: 'medium',
      title: `${negatives.length} رصيد بإشارة معاكسة في ${label}`,
      description: `${negatives.length} سجلًا في ${label} برصيد معاكس بإجمالي ${toStr(total)} (مثل: ${negatives.slice(0, 5).map((n) => n.counterparty ?? n.reference ?? '?').join('، ')}). قد تمثل دفعات مقدمة تستوجب إعادة التصنيف.`,
      amount: toStr(total.abs()), evidence: { items: negatives.slice(0, 50).map((n) => ({ party: n.counterparty, ref: n.reference, amount: toStr(recordNet(n)), row: n.source_row })) },
      recommendation: 'إعادة تصنيف الأرصدة الدائنة للعملاء (أو المدينة للموردين) إلى البند المناسب.', dedupe_key: `${type}-negative` });
  }
  const top = aging.concentration[0];
  if (top && top.pct && Number(top.pct) >= concentrationPct) {
    findings.push({ rule_code: type === 'receivable' ? 'AR-003' : 'AP-003', category: 'judgment', severity: 'medium', title: `تركّز ${label}: ${top.party} يمثل ${top.pct}%`,
      description: `الطرف "${top.party}" يمثل ${top.pct}% من إجمالي ${label} (${top.total} من ${aging.total}).`, amount: top.total,
      evidence: { concentration: aging.concentration }, recommendation: type === 'receivable' ? 'تقييم مخاطر الائتمان والتركّز والإفصاح عنها.' : 'تقييم الاعتماد على مورد واحد.', dedupe_key: `${type}-concentration` });
  }
  // تكرار المراجع
  const refs = new Map<string, SubRecord[]>();
  for (const r of records) { if (!r.reference) continue; const k = `${r.reference}|${toStr(recordNet(r))}`; if (!refs.has(k)) refs.set(k, []); refs.get(k)!.push(r); }
  const dup = [...refs.values()].filter((g) => g.length > 1);
  if (dup.length) {
    findings.push({ rule_code: type === 'receivable' ? 'AR-004' : 'AP-004', category: 'data_quality', severity: 'medium', title: `${dup.length} مرجع مكرر بنفس المبلغ في ${label}`,
      description: `مراجع مكررة: ${dup.slice(0, 8).map((g) => `${g[0].reference} (${toStr(recordNet(g[0]))})`).join('، ')}.`, amount: toStr(sum(dup.map((g) => recordNet(g[0]).mul(g.length - 1)))),
      evidence: { duplicates: dup.slice(0, 50).map((g) => ({ reference: g[0].reference, rows: g.map((x) => x.source_row), amount: toStr(recordNet(g[0])) })) },
      recommendation: 'التحقق من عدم تسجيل الفاتورة مرتين.', dedupe_key: `${type}-dup-refs` });
  }
  return { aging, findings };
}

/** فحص جدول الأصول الثابتة: التكلفة - المجمع = الصافي؛ استهلاك يتجاوز التكلفة؛ أصول مستهلكة بالكامل */
export function analyzeFixedAssets(records: SubRecord[], materiality: string) {
  const findings: EngineFinding[] = [];
  let cost = ZERO, accDep = ZERO, nbv = ZERO, depPeriod = ZERO;
  const g = (r: SubRecord, k: string) => (r.data[k] == null || r.data[k] === '' ? null : D(r.data[k] as string));
  const mism: unknown[] = []; const over: unknown[] = []; const fully: unknown[] = [];
  for (const r of records) {
    const c = g(r, 'cost') ?? D(r.amount ?? 0); const a = g(r, 'accumulated_depreciation') ?? ZERO; const n = g(r, 'net_book_value'); const d = g(r, 'depreciation_period') ?? ZERO;
    cost = cost.plus(c); accDep = accDep.plus(a); depPeriod = depPeriod.plus(d);
    const computedNbv = c.minus(a);
    nbv = nbv.plus(n ?? computedNbv);
    if (n !== null && computedNbv.minus(n).abs().gt('0.05')) mism.push({ row: r.source_row, asset: r.description ?? r.reference, cost: toStr(c), acc: toStr(a), nbv_reported: toStr(n), nbv_computed: toStr(computedNbv) });
    if (a.gt(c.plus('0.05'))) over.push({ row: r.source_row, asset: r.description ?? r.reference, cost: toStr(c), acc: toStr(a) });
    if (c.gt(0) && a.gte(c.minus('0.05')) && d.gt(0)) fully.push({ row: r.source_row, asset: r.description ?? r.reference, dep: toStr(d) });
    const rate = g(r, 'rate_pct'); const life = g(r, 'useful_life_years');
    if (rate && c.gt(0) && d.gt(0)) {
      const expected = c.mul(rate).div(100);
      if (d.minus(expected).abs().gt(Decimal.max(expected.mul('0.1'), '1'))) {
        findings.push({ rule_code: 'FA-004', category: 'math_error', severity: d.minus(expected).abs().gte(D(materiality)) ? 'high' : 'low', title: `استهلاك الفترة لا يتفق مع نسبة الاستهلاك: ${r.description ?? r.reference ?? ''}`,
          description: `التكلفة ${toStr(c)} × ${rate.toString()}% = ${toStr(expected)} متوقع، بينما المسجل ${toStr(d)}. قد يكون الفرق بسبب إضافات/استبعادات خلال الفترة أو استهلاك جزئي.`,
          amount: toStr(d.minus(expected).abs()), source_row_ref: r.source_row != null ? `الصف ${r.source_row}` : null, evidence: { cost: toStr(c), rate: rate.toString(), expected: toStr(expected), recorded: toStr(d) },
          calculation: `${toStr(c)} × ${rate}% = ${toStr(expected)}`, recommendation: 'التحقق من تاريخ الاقتناء وطريقة الاستهلاك.', dedupe_key: `FA-004:${r.source_row}` });
      }
    } else if (life && c.gt(0) && d.gt(0) && life.gt(0)) {
      const expected = c.div(life);
      if (d.minus(expected).abs().gt(Decimal.max(expected.mul('0.1'), '1'))) {
        findings.push({ rule_code: 'FA-004', category: 'math_error', severity: 'low', title: `استهلاك الفترة لا يتفق مع العمر الإنتاجي: ${r.description ?? r.reference ?? ''}`,
          description: `التكلفة ${toStr(c)} ÷ ${life} سنة = ${toStr(expected)} متوقع سنويًا، بينما المسجل ${toStr(d)}.`, amount: toStr(d.minus(expected).abs()),
          source_row_ref: r.source_row != null ? `الصف ${r.source_row}` : null, evidence: { cost: toStr(c), life: life.toString(), expected: toStr(expected), recorded: toStr(d) }, dedupe_key: `FA-004:${r.source_row}` });
      }
    }
  }
  if (mism.length) findings.push({ rule_code: 'FA-001', category: 'math_error', severity: 'high', title: `${mism.length} أصل صافي قيمته الدفترية لا يساوي التكلفة − المجمع`, description: 'صافي القيمة الدفترية المسجل يختلف عن (التكلفة − مجمع الاستهلاك) في الأصول المذكورة.', evidence: { items: mism.slice(0, 50) }, recommendation: 'تصحيح سجل الأصول.', dedupe_key: 'FA-001' });
  if (over.length) findings.push({ rule_code: 'FA-002', category: 'accounting_issue', severity: 'high', title: `${over.length} أصل مجمع استهلاكه يتجاوز تكلفته`, description: 'لا يمكن أن يتجاوز مجمع الاستهلاك تكلفة الأصل.', evidence: { items: over.slice(0, 50) }, dedupe_key: 'FA-002' });
  if (fully.length) findings.push({ rule_code: 'FA-003', category: 'accounting_issue', severity: 'medium', title: `${fully.length} أصل مستهلك بالكامل ما زال يُحمّل باستهلاك`, description: 'استمرار احتساب استهلاك لأصول صافي قيمتها صفر يضخم المصروف.', evidence: { items: fully.slice(0, 50) }, amount: toStr(sum(fully.map((f) => (f as { dep: string }).dep))), dedupe_key: 'FA-003' });
  return { summary: { assets: records.length, cost: toStr(cost), accumulated_depreciation: toStr(accDep), net_book_value: toStr(nbv), depreciation_period: toStr(depPeriod), computed_nbv: toStr(cost.minus(accDep)) }, findings };
}

/** فحص المخزون: قيم سالبة، كميات بلا قيمة، بطء الحركة، تطابق الكمية × التكلفة */
export function analyzeInventory(records: SubRecord[], materiality: string) {
  const findings: EngineFinding[] = [];
  let total = ZERO; const negatives: unknown[] = []; const mism: unknown[] = []; const noValue: unknown[] = [];
  for (const r of records) {
    const v = recordNet(r); total = total.plus(v);
    const qty = r.quantity == null ? null : D(r.quantity); const unit = r.data['unit_cost'] == null || r.data['unit_cost'] === '' ? null : D(r.data['unit_cost'] as string);
    if (v.lt(0) || (qty && qty.lt(0))) negatives.push({ row: r.source_row, item: r.description ?? r.reference, qty: qty?.toString(), value: toStr(v) });
    if (qty && unit && qty.mul(unit).minus(v).abs().gt('0.05')) mism.push({ row: r.source_row, item: r.description ?? r.reference, qty: qty.toString(), unit_cost: toStr(unit), computed: toStr(qty.mul(unit)), reported: toStr(v) });
    if (qty && qty.gt(0) && v.isZero()) noValue.push({ row: r.source_row, item: r.description ?? r.reference, qty: qty.toString() });
  }
  if (negatives.length) findings.push({ rule_code: 'INV-001', category: 'accounting_issue', severity: 'high', title: `${negatives.length} صنف برصيد/كمية سالبة في المخزون`, description: 'الأرصدة السالبة في المخزون تشير إلى صرف قبل الاستلام أو أخطاء في التسجيل.', evidence: { items: negatives.slice(0, 50) }, dedupe_key: 'INV-001' });
  if (mism.length) findings.push({ rule_code: 'INV-002', category: 'math_error', severity: 'medium', title: `${mism.length} صنف قيمته لا تساوي الكمية × تكلفة الوحدة`, description: 'القيمة المسجلة تختلف عن حاصل ضرب الكمية في تكلفة الوحدة.', evidence: { items: mism.slice(0, 50) }, dedupe_key: 'INV-002' });
  if (noValue.length) findings.push({ rule_code: 'INV-003', category: 'data_quality', severity: 'low', title: `${noValue.length} صنف بكمية موجبة وقيمة صفرية`, description: 'أصناف بكمية بلا قيمة؛ قد تكون أصنافًا مجانية أو خطأ تقييم.', evidence: { items: noValue.slice(0, 50) }, dedupe_key: 'INV-003' });
  return { summary: { items: records.length, total_value: toStr(total) }, findings, materiality };
}

/** مطابقة كشف البنك: مقارنة حركات البنك مع حركات حساب البنك في اليومية حسب المبلغ والتاريخ (±3 أيام) */
export function reconcileBank(params: { bankTx: SubRecord[]; bookTx: { date: string | null; amount: string; ref: string | null; description: string | null; row: number | null }[]; bankClosing?: string | null; bookClosing?: string | null }) {
  const unmatchedBank: SubRecord[] = []; const used = new Set<number>(); let matched = 0;
  const bookAmt = (b: { amount: string }) => D(b.amount);
  const dayDiff = (a: string | null, b: string | null) => (a && b ? Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000) : 99);
  for (const t of params.bankTx) {
    const amt = D(t.debit).minus(D(t.credit)).isZero() ? D(t.amount ?? 0) : D(t.credit).minus(D(t.debit)); // إيداع بنكي (دائن في كشف البنك) = مدين في الدفاتر
    let found = -1;
    for (let i = 0; i < params.bookTx.length; i++) {
      if (used.has(i)) continue;
      if (bookAmt(params.bookTx[i]).minus(amt).abs().lte('0.005') && dayDiff(t.record_date, params.bookTx[i].date) <= 3) { found = i; break; }
    }
    if (found >= 0) { used.add(found); matched++; } else unmatchedBank.push(t);
  }
  const unmatchedBook = params.bookTx.filter((_, i) => !used.has(i));
  const findings: EngineFinding[] = [];
  if (unmatchedBank.length) findings.push({ rule_code: 'BANK-001', category: 'accounting_issue', severity: 'medium', title: `${unmatchedBank.length} حركة في كشف البنك بلا مقابل في الدفاتر`,
    description: 'حركات ظهرت في كشف البنك ولم يُعثر على قيد مطابق لها بالمبلغ والتاريخ (±3 أيام). قد تكون رسومًا بنكية، أو إيداعات غير مسجلة، أو اختلاف توقيت.',
    amount: toStr(sum(unmatchedBank.map((t) => D(t.credit).minus(D(t.debit)).isZero() ? D(t.amount ?? 0) : D(t.credit).minus(D(t.debit)))).abs()),
    evidence: { items: unmatchedBank.slice(0, 100).map((t) => ({ date: t.record_date, ref: t.reference, desc: t.description, debit: t.debit, credit: t.credit, amount: t.amount, row: t.source_row })) }, recommendation: 'تسجيل البنود غير المسجلة أو توثيقها كبنود تسوية.', dedupe_key: 'BANK-001' });
  if (unmatchedBook.length) findings.push({ rule_code: 'BANK-002', category: 'accounting_issue', severity: 'medium', title: `${unmatchedBook.length} حركة في الدفاتر لم تظهر في كشف البنك`,
    description: 'قيود على حساب البنك لم يُعثر على مقابل لها في الكشف؛ قد تكون شيكات لم تُصرف أو إيداعات في الطريق أو قيود خاطئة.',
    amount: toStr(sum(unmatchedBook.map((b) => b.amount)).abs()), evidence: { items: unmatchedBook.slice(0, 100) }, recommendation: 'إدراجها كبنود تسوية أو تصحيحها.', dedupe_key: 'BANK-002' });
  let balanceDiff: string | null = null;
  if (params.bankClosing != null && params.bookClosing != null) {
    const diff = D(params.bankClosing).minus(params.bookClosing); balanceDiff = toStr(diff);
    if (!diff.isZero()) findings.push({ rule_code: 'BANK-003', category: 'math_error', severity: 'high', title: `رصيد البنك حسب الكشف يختلف عن الدفاتر بمبلغ ${toStr(diff)}`,
      description: `رصيد الكشف ${toStr(params.bankClosing)} ورصيد الدفاتر ${toStr(params.bookClosing)}.`, amount: toStr(diff.abs()), evidence: { bank: params.bankClosing, book: params.bookClosing }, calculation: `${params.bankClosing} - ${params.bookClosing} = ${toStr(diff)}`, dedupe_key: 'BANK-003' });
  }
  return { summary: { bank_transactions: params.bankTx.length, book_transactions: params.bookTx.length, matched, unmatched_bank: unmatchedBank.length, unmatched_book: unmatchedBook.length, balance_difference: balanceDiff }, unmatched_bank: unmatchedBank, unmatched_book: unmatchedBook, findings };
}
