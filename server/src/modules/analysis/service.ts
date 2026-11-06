import { getOfficeSettings } from '../office/routes.js';
import { many, one, query, withTransaction, type Queryable } from '../../db/pool.js';
import { badRequest } from '../../lib/errors.js';
import { validateTrialBalance, type TbValidationResult, type MaterialityPolicy } from '../../engine/trialBalance.js';
import { buildStatements, type StatementPackage } from '../../engine/statements.js';
import { computeRatios } from '../../engine/ratios.js';
import { computeVariance } from '../../engine/variance.js';
import { validateJournal, reconcileJournalToTb, type JournalEntryIn } from '../../engine/journal.js';
import { reconcileSubledgerToGl, analyzeReceivables, analyzeFixedAssets, analyzeInventory, reconcileBank, type SubRecord } from '../../engine/subledger.js';
import type { TbEntry, AccountMeta, EngineFinding } from '../../engine/types.js';
import { loadEngagement, loadPeriod } from '../../middleware/scope.js';
import { daysBetween } from '../../lib/dates.js';
import { sha256 } from '../../lib/crypto.js';
import { fmtAmounts } from '../../lib/textfmt.js';
import { D, toStr } from '../../engine/money.js';

export async function loadTbEntries(periodId: string, db?: Queryable): Promise<TbEntry[]> {
  return many<TbEntry>(`SELECT account_code, account_name, opening_debit, opening_credit, period_debit, period_credit, closing_debit, closing_credit, source_row, currency
    FROM trial_balance_entries WHERE period_id = $1 ORDER BY account_code, id`, [periodId], db);
}

export async function loadAccountMap(clientId: string, db?: Queryable): Promise<Map<string, AccountMeta>> {
  const rows = await many<AccountMeta & { classification_confidence: string }>(`SELECT code, name_ar, account_type, sub_type, normal_balance, COALESCE(fs_line_code, 'UNMAPPED') AS fs_line_code, is_suspense, is_bank, classification_confidence FROM chart_of_accounts WHERE client_id = $1`, [clientId], db);
  return new Map(rows.map((r) => [r.code, { ...r, confidence: Number(r.classification_confidence) }]));
}

/** الفترة المقارنة: الفترة ذات الدور prior في الارتباط نفسه، أو أي فترة سابقة لنفس العميل تحتوي بيانات */
export async function findPriorPeriod(engagementId: string, clientId: string, periodId: string, db?: Queryable) {
  const cur = await one<{ start_date: string }>('SELECT start_date FROM financial_periods WHERE id = $1', [periodId], db);
  const p = await one<{ id: string; label: string; start_date: string; end_date: string }>(
    `SELECT p.id, p.label, p.start_date, p.end_date FROM financial_periods p
      WHERE p.client_id = $2 AND p.id <> $1 AND p.end_date < $3 AND EXISTS (SELECT 1 FROM trial_balance_entries t WHERE t.period_id = p.id)
      ORDER BY (p.engagement_id = $4) DESC, (p.role = 'prior') DESC, p.end_date DESC LIMIT 1`, [periodId, clientId, cur?.start_date ?? '9999-12-31', engagementId], db);
  return p ?? null;
}

async function startRun(params: { clientId: string; engagementId: string; periodId: string | null; runType: string; userId: string }, db?: Queryable) {
  const r = await one<{ id: string }>(`INSERT INTO analysis_runs (client_id, engagement_id, period_id, run_type, started_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [params.clientId, params.engagementId, params.periodId, params.runType, params.userId], db);
  return r!.id;
}
async function finishRun(runId: string, summary: unknown, result: unknown, db?: Queryable) {
  await query(`UPDATE analysis_runs SET status = 'completed', summary = $2, result = $3, finished_at = now() WHERE id = $1`, [runId, JSON.stringify(summary), JSON.stringify(result)], db);
}
async function failRun(runId: string, msg: string) {
  await query(`UPDATE analysis_runs SET status = 'failed', error_message = $2, finished_at = now() WHERE id = $1`, [runId, msg]);
}

/** حفظ ملاحظات المحرك مع إزالة التكرار: تحديث الموجودة، إضافة الجديدة، وتعليم المختفية كمحلولة */
export async function upsertFindings(params: { clientId: string; engagementId: string; periodId: string | null; runId: string; rulePrefix: string[]; findings: EngineFinding[]; userId: string; documentId?: string | null }, db: Queryable) {
  const existing = await many<{ id: string; dedupe_key: string; review_status: string; origin: string }>(
    `SELECT id, dedupe_key, review_status, origin FROM findings WHERE engagement_id = $1 AND origin = 'engine' AND ($2::uuid IS NULL OR period_id = $2) AND dedupe_key IS NOT NULL`, [params.engagementId, params.periodId], db);
  const existingMap = new Map(existing.map((e) => [e.dedupe_key, e]));
  const seen = new Set<string>();
  let created = 0, updated = 0, resolved = 0;
  for (const f of params.findings) {
    const key = params.periodId ? `${params.periodId}:${f.dedupe_key}` : f.dedupe_key;
    f.title = fmtAmounts(f.title); f.description = fmtAmounts(f.description); if (f.calculation) f.calculation = fmtAmounts(f.calculation); if (f.impact) f.impact = fmtAmounts(f.impact); if (f.recommendation) f.recommendation = fmtAmounts(f.recommendation);
    seen.add(key);
    const ex = existingMap.get(key);
    if (ex) {
      if (!['accepted', 'rejected'].includes(ex.review_status)) {
        await query(`UPDATE findings SET severity = $2, title = $3, description = $4, amount = $5, evidence = $6, calculation = $7, impact = $8, recommendation = $9, run_id = $10, updated_at = now(),
          review_status = CASE WHEN review_status = 'resolved' THEN 'open' ELSE review_status END WHERE id = $1`,
          [ex.id, f.severity, f.title, f.description, f.amount ?? null, JSON.stringify(f.evidence), f.calculation ?? null, f.impact ?? null, f.recommendation ?? null, params.runId], db);
        updated++;
      }
      continue;
    }
    const ref = await one<{ n: string }>(`SELECT nextval('findings_ref_seq') AS n`, [], db);
    await query(`INSERT INTO findings (client_id, engagement_id, period_id, finding_ref, rule_code, category, severity, title, description, account_code, account_name, fs_line_code, amount, currency,
      source_document_id, source_row_ref, evidence, calculation, impact, recommendation, origin, dedupe_key, run_id, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'engine',$21,$22,$23)`,
      [params.clientId, params.engagementId, params.periodId, `F-${String(ref!.n).padStart(4, '0')}`, f.rule_code, f.category, f.severity, f.title, f.description, f.account_code ?? null, f.account_name ?? null,
        f.fs_line_code ?? null, f.amount ?? null, 'SAR', params.documentId ?? null, f.source_row_ref ?? null, JSON.stringify(f.evidence), f.calculation ?? null, f.impact ?? null, f.recommendation ?? null, key, params.runId, params.userId], db);
    created++;
  }
  for (const ex of existing) {
    const prefixOk = params.rulePrefix.some((p) => ex.dedupe_key.split(':').slice(params.periodId ? 1 : 0).join(':').startsWith(p));
    if (prefixOk && !seen.has(ex.dedupe_key) && ex.review_status === 'open') {
      await query(`UPDATE findings SET review_status = 'resolved', reviewer_note = COALESCE(reviewer_note, '') || ' [لم تعد تظهر بعد إعادة الفحص]', updated_at = now() WHERE id = $1`, [ex.id], db);
      resolved++;
    }
  }
  return { created, updated, resolved };
}

export interface TbRunResult { run_id: string; result: TbValidationResult; prior: { id: string; label: string } | null; findings_saved: { created: number; updated: number; resolved: number } }

export async function runTbValidation(engagementId: string, periodId: string, userId: string, opts: { materiality?: string | null; tolerance?: string; materialChangePct?: number } = {}): Promise<TbRunResult> {
  const e = await loadEngagement(engagementId);
  const p = await loadPeriod(periodId, engagementId);
  const entries = await loadTbEntries(periodId);
  if (!entries.length) throw badRequest('لا يوجد ميزان مراجعة معتمد لهذه الفترة');
  const accounts = await loadAccountMap(e.client_id);
  const prior = await findPriorPeriod(engagementId, e.client_id, periodId);
  const priorEntries = prior ? await loadTbEntries(prior.id) : null;
  const runId = await startRun({ clientId: e.client_id, engagementId, periodId, runType: 'tb_validation', userId });
  try {
    const office = await getOfficeSettings() as { materiality_policy?: MaterialityPolicy | null };
    const result = validateTrialBalance(entries, { accounts, priorEntries, priorLabel: prior?.label, currentLabel: p.label, materiality: opts.materiality ?? null, materialityPolicy: office.materiality_policy ?? null, tolerance: opts.tolerance, materialChangePct: opts.materialChangePct });
    const doc = await one<{ document_id: string }>(`SELECT j.document_id FROM import_jobs j WHERE j.period_id = $1 AND j.data_type = 'trial_balance' AND j.status = 'committed' ORDER BY j.committed_at DESC LIMIT 1`, [periodId]);
    const saved = await withTransaction(async (tx) => {
      const s = await upsertFindings({ clientId: e.client_id, engagementId, periodId, runId, rulePrefix: ['TB-'], findings: result.findings, userId, documentId: doc?.document_id ?? null }, tx);
      await finishRun(runId, { ...result.summary, findings_saved: s, prior_period: prior }, { summary: result.summary, accounts: result.accounts, findings_count: result.findings.length }, tx);
      return s;
    });
    return { run_id: runId, result, prior: prior ? { id: prior.id, label: prior.label } : null, findings_saved: saved };
  } catch (err) { await failRun(runId, (err as Error).message); throw err; }
}

export async function runStatements(engagementId: string, periodId: string, userId: string): Promise<{ run_id: string; statements: StatementPackage; ratios: ReturnType<typeof computeRatios>; variance: ReturnType<typeof computeVariance> | null; prior: { id: string; label: string } | null }> {
  const e = await loadEngagement(engagementId);
  const p = await loadPeriod(periodId, engagementId);
  const entries = await loadTbEntries(periodId);
  if (!entries.length) throw badRequest('لا يوجد ميزان مراجعة معتمد لهذه الفترة');
  const accounts = await loadAccountMap(e.client_id);
  const prior = await findPriorPeriod(engagementId, e.client_id, periodId);
  const priorEntries = prior ? await loadTbEntries(prior.id) : null;
  const runId = await startRun({ clientId: e.client_id, engagementId, periodId, runType: 'statements', userId });
  try {
    const statements = buildStatements({ current: entries, prior: priorEntries, accounts, periodLabel: p.label, priorLabel: prior?.label ?? null, currency: e.currency });
    const days = daysBetween(p.start_date, p.end_date);
    const priorKf = priorEntries ? buildStatements({ current: priorEntries, accounts, periodLabel: prior!.label, currency: e.currency }).key_figures : null;
    const ratios = computeRatios(statements.key_figures, { periodDays: days, priorKf: priorKf ? { prior_total_assets: priorKf.total_assets, prior_total_equity: priorKf.total_equity, prior_receivables: priorKf.receivables_gross, prior_inventory: priorKf.inventory, prior_payables: priorKf.payables } : null });
    if (priorKf) {
      const priorRatios = computeRatios(priorKf, { periodDays: days });
      for (const r of ratios) r.prior_value = priorRatios.find((x) => x.code === r.code)?.value ?? null;
    }
    let variance: ReturnType<typeof computeVariance> | null = null;
    if (priorEntries) {
      const items = [...statements.pl.lines, ...statements.sfp.lines].map((l) => ({ key: l.code, label_ar: l.label_ar, label_en: l.label_en, current: l.value, comparative: l.prior_value ?? '0' }))
        .concat([...statements.pl.totals, ...statements.sfp.totals].map((t) => ({ key: `total:${t.key}`, label_ar: t.label_ar, label_en: t.label_en, current: t.value, comparative: t.prior_value ?? '0' })));
      const lastTb = await one<{ summary: { materiality?: string } }>(`SELECT summary FROM analysis_runs WHERE period_id = $1 AND run_type = 'tb_validation' AND status = 'completed' ORDER BY started_at DESC LIMIT 1`, [periodId]);
      variance = computeVariance(items, { materiality: lastTb?.summary?.materiality, pctThreshold: 10 });
    }
    const inputsHash = sha256(JSON.stringify(entries) + JSON.stringify(priorEntries ?? null));
    await withTransaction(async (tx) => {
      await query('DELETE FROM financial_statements WHERE period_id = $1 AND statement_type = $2', [periodId, 'package'], tx);
      await query(`INSERT INTO financial_statements (client_id, engagement_id, period_id, statement_type, data, inputs_hash, generated_by) VALUES ($1,$2,$3,'package',$4,$5,$6)`,
        [e.client_id, engagementId, periodId, JSON.stringify({ statements, ratios, variance, prior }), inputsHash, userId], tx);
      // ملاحظات مستمدة من القوائم والنسب
      const fs: EngineFinding[] = [];
      if (!statements.sfp.balanced) fs.push({ rule_code: 'FS-001', category: 'math_error', severity: 'critical', title: 'قائمة المركز المالي غير متوازنة', description: `الفرق بين إجمالي الأصول وإجمالي الالتزامات وحقوق الملكية ${statements.sfp.difference}.`, amount: toStr(D(statements.sfp.difference).abs()), evidence: { difference: statements.sfp.difference, notes: statements.notes }, recommendation: 'مراجعة توازن الميزان وتصنيف الحسابات.', dedupe_key: 'FS-001' });
      const cfDiff = statements.cf.totals.find((t) => t.key === 'cf_difference');
      if (statements.cf.status === 'ok' && cfDiff && D(cfDiff.value).abs().gt('0.05')) /* نفس حد التسامح المستخدم في القوائم */ fs.push({ rule_code: 'FS-002', category: 'data_quality', severity: 'medium', title: 'قائمة التدفقات النقدية لا تتطابق مع رصيد النقد', description: `فرق المطابقة ${cfDiff.value}؛ غالبًا بسبب حسابات غير مصنفة أو بنود غير نقدية.`, amount: toStr(D(cfDiff.value).abs()), evidence: { totals: statements.cf.totals }, recommendation: 'مراجعة تصنيف الحسابات والبنود غير النقدية.', dedupe_key: 'FS-002' });
      const by = Object.fromEntries(ratios.map((r) => [r.code, r]));
      if (by.current_ratio.status === 'ok' && D(by.current_ratio.value!).lt(1)) fs.push({ rule_code: 'FS-010', category: 'judgment', severity: 'high', title: `نسبة التداول أقل من 1 (${by.current_ratio.value})`, description: `الأصول المتداولة ${by.current_ratio.inputs.current_assets} أقل من الالتزامات المتداولة ${by.current_ratio.inputs.current_liabilities}؛ مؤشر على ضغط سيولة قد يؤثر على قدرة المنشأة على الوفاء بالتزاماتها قصيرة الأجل.`, evidence: { ratio: by.current_ratio }, calculation: `${by.current_ratio.inputs.current_assets} ÷ ${by.current_ratio.inputs.current_liabilities} = ${by.current_ratio.value}`, recommendation: 'تقييم خطة السيولة والتمويل والاستمرارية.', dedupe_key: 'FS-010' });
      if (D(statements.key_figures.total_equity ?? 0).lt(0)) fs.push({ rule_code: 'FS-011', category: 'judgment', severity: 'critical', title: 'حقوق الملكية سالبة', description: `إجمالي حقوق الملكية ${statements.key_figures.total_equity}؛ الخسائر المتراكمة تجاوزت رأس المال والاحتياطيات، ما يستدعي تقييم الاستمرارية (ISA 570) والمتطلبات النظامية لبلوغ الخسائر نصف رأس المال (نظام الشركات: المادة 132 للمساهمة، والمادة 182 لذات المسؤولية المحدودة).`, amount: toStr(D(statements.key_figures.total_equity ?? 0).abs()), evidence: { total_equity: statements.key_figures.total_equity }, recommendation: 'مناقشة الإدارة حول خطط معالجة الخسائر والالتزامات النظامية (نظام الشركات بشأن الخسائر المتراكمة - يلزم التحقق من النص النافذ).', dedupe_key: 'FS-011' });
      if (D(statements.key_figures.net_income ?? 0).lt(0)) fs.push({ rule_code: 'FS-012', category: 'judgment', severity: 'medium', title: `صافي خسارة للفترة ${toStr(D(statements.key_figures.net_income ?? 0).abs())}`, description: 'الفترة أسفرت عن صافي خسارة؛ يلزم تحليل أسبابها وأثرها على الاستمرارية.', amount: toStr(D(statements.key_figures.net_income ?? 0).abs()), evidence: { pl_totals: statements.pl.totals }, dedupe_key: 'FS-012' });
      if (by.ocf_to_net_income.status === 'ok' && D(statements.key_figures.net_income ?? 0).gt(0) && D(by.ocf_to_net_income.value!).lt('0.5')) fs.push({ rule_code: 'FS-013', category: 'judgment', severity: 'medium', title: 'التدفق النقدي التشغيلي أقل بكثير من الربح المحاسبي', description: `نسبة التدفق النقدي التشغيلي إلى صافي الربح ${by.ocf_to_net_income.value}؛ الربح المحاسبي لا يترجم إلى نقد بنفس القدر، غالبًا بسبب نمو الذمم أو المخزون.`, evidence: { ratio: by.ocf_to_net_income }, recommendation: 'تحليل جودة الأرباح وتحصيل الذمم.', dedupe_key: 'FS-013' });
      if (by.dso.status === 'ok' && Number(by.dso.value) > 120) fs.push({ rule_code: 'FS-014', category: 'judgment', severity: 'medium', title: `فترة تحصيل الذمم مرتفعة (${by.dso.value} يومًا)`, description: 'متوسط فترة التحصيل يتجاوز 120 يومًا؛ يستدعي مراجعة سياسة الائتمان وكفاية المخصص.', evidence: { ratio: by.dso }, dedupe_key: 'FS-014' });
      if (variance) for (const v of variance.rows.filter((r) => r.material && r.key.startsWith('total:'))) fs.push({ rule_code: 'VAR-001', category: 'judgment', severity: 'medium', title: `تغير جوهري في ${v.label_ar}: ${v.change}${v.change_pct ? ` (${v.change_pct}%)` : ''}`, description: `${v.label_ar} تغير من ${v.comparative} (${prior!.label}) إلى ${v.current} (${p.label}).`, amount: toStr(D(v.change).abs()), evidence: { variance: v }, calculation: `${v.current} - ${v.comparative} = ${v.change}`, recommendation: 'الحصول على تفسير الإدارة والمستندات المؤيدة.', dedupe_key: `VAR-001:${v.key}` });
      await upsertFindings({ clientId: e.client_id, engagementId, periodId, runId, rulePrefix: ['FS-', 'VAR-'], findings: fs, userId }, tx);
      await finishRun(runId, { key_figures: statements.key_figures, balanced: statements.sfp.balanced, ratios: ratios.length, variance_material: variance?.material_count ?? null, prior }, null, tx);
    });
    return { run_id: runId, statements, ratios, variance, prior: prior ? { id: prior.id, label: prior.label } : null };
  } catch (err) { await failRun(runId, (err as Error).message); throw err; }
}

export async function getStatementsPackage(periodId: string) {
  const r = await one<{ data: { statements: StatementPackage; ratios: ReturnType<typeof computeRatios>; variance: ReturnType<typeof computeVariance> | null; prior: unknown }; generated_at: string; inputs_hash: string }>(
    `SELECT data, generated_at, inputs_hash FROM financial_statements WHERE period_id = $1 AND statement_type = 'package' ORDER BY generated_at DESC LIMIT 1`, [periodId]);
  return r ?? null;
}

export async function runJournalChecks(engagementId: string, periodId: string, userId: string) {
  const e = await loadEngagement(engagementId);
  const p = await loadPeriod(periodId, engagementId);
  const jes = await many<{ id: string; entry_no: string | null; entry_date: string | null; description: string | null; reference: string | null; source_row: number | null }>('SELECT id, entry_no, entry_date, description, reference, source_row FROM journal_entries WHERE period_id = $1 ORDER BY entry_date, entry_no', [periodId]);
  if (!jes.length) throw badRequest('لا توجد قيود يومية معتمدة لهذه الفترة');
  const lines = await many<{ journal_entry_id: string; account_code: string; account_name: string | null; debit: string; credit: string; description: string | null; counterparty: string | null; source_row: number | null }>(
    'SELECT l.* FROM journal_lines l JOIN journal_entries j ON j.id = l.journal_entry_id WHERE j.period_id = $1', [periodId]);
  const byJe = new Map<string, typeof lines>(); for (const l of lines) { if (!byJe.has(l.journal_entry_id)) byJe.set(l.journal_entry_id, []); byJe.get(l.journal_entry_id)!.push(l); }
  const input: JournalEntryIn[] = jes.map((j) => ({ entry_no: j.entry_no, entry_date: j.entry_date, description: j.description, reference: j.reference, source_row: j.source_row, lines: (byJe.get(j.id) ?? []).map((l) => ({ ...l })) }));
  const lastTb = await one<{ summary: { materiality?: string } }>(`SELECT summary FROM analysis_runs WHERE period_id = $1 AND run_type = 'tb_validation' AND status = 'completed' ORDER BY started_at DESC LIMIT 1`, [periodId]);
  const runId = await startRun({ clientId: e.client_id, engagementId, periodId, runType: 'journal', userId });
  try {
    const result = validateJournal(input, { periodStart: p.start_date, periodEnd: p.end_date, materiality: lastTb?.summary?.materiality });
    const tb = await loadTbEntries(periodId);
    const recon = tb.length ? reconcileJournalToTb(result.account_movements, tb) : null;
    const findings = [...result.findings, ...(recon?.findings ?? [])];
    const saved = await withTransaction(async (tx) => {
      const s = await upsertFindings({ clientId: e.client_id, engagementId, periodId, runId, rulePrefix: ['JE-', 'REC-'], findings, userId }, tx);
      if (recon) await query(`INSERT INTO reconciliation_results (engagement_id, period_id, recon_type, summary, items, run_id) VALUES ($1,$2,'journal_vs_tb',$3,$4,$5)`, [engagementId, periodId, JSON.stringify(recon.summary), JSON.stringify(recon.items), runId], tx);
      await finishRun(runId, { ...result.summary, reconciliation: recon?.summary ?? null, findings_saved: s }, { recon_items: recon?.items ?? [] }, tx);
      return s;
    });
    return { run_id: runId, summary: result.summary, reconciliation: recon, findings, findings_saved: saved };
  } catch (err) { await failRun(runId, (err as Error).message); throw err; }
}

const SUB_FS: Record<string, { fs: string[]; side: 'debit' | 'credit' }> = {
  receivable: { fs: ['AR'], side: 'debit' }, payable: { fs: ['AP'], side: 'credit' }, inventory: { fs: ['INVENTORY'], side: 'debit' }, fixed_asset: { fs: ['PPE'], side: 'debit' }, bank_transaction: { fs: ['CASH'], side: 'debit' },
};

export async function runSubledgerAnalysis(engagementId: string, periodId: string, recordType: string, userId: string) {
  const e = await loadEngagement(engagementId);
  const p = await loadPeriod(periodId, engagementId);
  if (!SUB_FS[recordType]) throw badRequest('نوع السجل غير مدعوم');
  const records = await many<SubRecord>('SELECT record_type, record_date, reference, counterparty, description, amount, debit, credit, balance, quantity, data, source_row FROM subledger_records WHERE period_id = $1 AND record_type = $2 ORDER BY source_row', [periodId, recordType]);
  if (!records.length) throw badRequest('لا توجد سجلات معتمدة من هذا النوع لهذه الفترة');
  const accounts = await loadAccountMap(e.client_id);
  const tb = await loadTbEntries(periodId);
  const glEntries = tb.filter((t) => { const m = accounts.get(t.account_code); return m && SUB_FS[recordType].fs.includes(m.fs_line_code); });
  const lastTb = await one<{ summary: { materiality?: string } }>(`SELECT summary FROM analysis_runs WHERE period_id = $1 AND run_type = 'tb_validation' AND status = 'completed' ORDER BY started_at DESC LIMIT 1`, [periodId]);
  const materiality = lastTb?.summary?.materiality ?? '1000';
  const runId = await startRun({ clientId: e.client_id, engagementId, periodId, runType: `subledger_${recordType}`, userId });
  try {
    let findings: EngineFinding[] = []; let detail: unknown = null; let recon: ReturnType<typeof reconcileSubledgerToGl> | null = null;
    if (recordType === 'bank_transaction') {
      const bookTx = await many<{ date: string | null; amount: string; ref: string | null; description: string | null; row: number | null }>(
        `SELECT j.entry_date AS date, (l.debit - l.credit)::text AS amount, j.reference AS ref, COALESCE(l.description, j.description) AS description, l.source_row AS row
           FROM journal_lines l JOIN journal_entries j ON j.id = l.journal_entry_id JOIN chart_of_accounts a ON a.client_id = $2 AND a.code = l.account_code
          WHERE j.period_id = $1 AND a.is_bank = TRUE`, [periodId, e.client_id]);
      const lastBal = [...records].reverse().find((r) => r.balance != null)?.balance ?? null;
      const bookClosing = glEntries.length ? toStr(glEntries.reduce((s, t) => s.plus(D(t.closing_debit).minus(t.closing_credit)), D(0))) : null;
      const r = reconcileBank({ bankTx: records, bookTx, bankClosing: lastBal, bookClosing: bookTx.length ? bookClosing : null });
      findings = r.findings; detail = { summary: r.summary, unmatched_bank: r.unmatched_bank.slice(0, 200), unmatched_book: r.unmatched_book.slice(0, 200) };
      if (!bookTx.length) findings.push({ rule_code: 'BANK-000', category: 'documents_required', severity: 'medium', title: 'لا توجد قيود يومية لحساب البنك للمطابقة', description: 'تم استيراد كشف البنك لكن لا توجد قيود يومية معتمدة على حسابات مصنفة كبنك؛ المطابقة التفصيلية غير ممكنة. يلزم استيراد دفتر اليومية أو كشف حركة حساب البنك من الدفاتر.', evidence: { bank_transactions: records.length }, recommendation: 'استيراد قيود اليومية وتعليم حسابات البنك في دليل الحسابات.', dedupe_key: 'BANK-000' });
    } else {
      recon = reconcileSubledgerToGl({ type: recordType, records, glEntries, expectedSide: SUB_FS[recordType].side });
      findings = [...recon.findings];
      if (recordType === 'receivable' || recordType === 'payable') { const a = analyzeReceivables(records, p.end_date, recordType, materiality); findings.push(...a.findings); detail = { aging: a.aging, reconciliation: recon }; }
      else if (recordType === 'fixed_asset') { const a = analyzeFixedAssets(records, materiality); findings.push(...a.findings); detail = { summary: a.summary, reconciliation: recon }; }
      else if (recordType === 'inventory') { const a = analyzeInventory(records, materiality); findings.push(...a.findings); detail = { summary: a.summary, reconciliation: recon }; }
    }
    const saved = await withTransaction(async (tx) => {
      const s = await upsertFindings({ clientId: e.client_id, engagementId, periodId, runId, rulePrefix: ['SL-', 'AR-', 'AP-', 'FA-', 'INV-', 'BANK-'].filter((pfx) => ({ receivable: ['SL-', 'AR-'], payable: ['SL-', 'AP-'], fixed_asset: ['SL-', 'FA-'], inventory: ['SL-', 'INV-'], bank_transaction: ['BANK-'] } as Record<string, string[]>)[recordType].includes(pfx)), findings, userId }, tx);
      await query(`INSERT INTO reconciliation_results (engagement_id, period_id, recon_type, summary, items, run_id) VALUES ($1,$2,$3,$4,$5,$6)`, [engagementId, periodId, `gl_vs_${recordType}`, JSON.stringify(recon ? { subledger_total: recon.subledger_total, gl_balance: recon.gl_balance, difference: recon.difference, matched: recon.matched } : (detail as { summary: unknown })?.summary ?? {}), JSON.stringify([]), runId], tx);
      await finishRun(runId, { records: records.length, findings: findings.length, findings_saved: s, reconciliation: recon ? { difference: recon.difference, matched: recon.matched } : null }, detail, tx);
      return s;
    });
    return { run_id: runId, records: records.length, reconciliation: recon, detail, findings, findings_saved: saved };
  } catch (err) { await failRun(runId, (err as Error).message); throw err; }
}

export async function latestRun(periodId: string, runType: string) {
  return one(`SELECT id, run_type, status, summary, result, started_at, finished_at FROM analysis_runs WHERE period_id = $1 AND run_type = $2 AND status = 'completed' ORDER BY started_at DESC LIMIT 1`, [periodId, runType]);
}
