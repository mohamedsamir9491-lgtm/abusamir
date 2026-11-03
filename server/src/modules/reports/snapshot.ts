import { many, one } from '../../db/pool.js';
import { badRequest } from '../../lib/errors.js';
import { loadPeriod } from '../../middleware/scope.js';
import { getStatementsPackage, latestRun } from '../analysis/service.js';
import { latestAiAnalysis } from '../ai/service.js';
import { getOfficeSettings } from '../office/routes.js';
import { loadTbEntries, loadAccountMap } from '../analysis/service.js';
import { resolveMeta, prefixMapFor } from '../../engine/trialBalance.js';
import { net, toStr } from '../../engine/money.js';
import { FS_LINE_MAP } from '../../engine/fsLines.js';
import type { AiAnalysis } from '../ai/schema.js';
import { buildStatements } from '../../engine/statements.js';
import { groupCompaniesForPeriod, listComponents, prefillSetup } from '../engagements/group.js';
import { confirmedOfficial } from '../official/routes.js';

/** شركات المجموعة لفترة التقرير: قوائم كل شركة مبنية مباشرة من ميزانها المعتمد (منفصلة، دون استبعادات) */
async function collectGroupCompanies(engagementId: string, periodId: string, consolidation: Record<string, unknown> | null) {
  const comps = await listComponents(engagementId);
  if (!comps.length) return null;
  const { companies } = await groupCompaniesForPeriod(engagementId, periodId);
  const pre = await prefillSetup(engagementId, periodId).catch(() => null);
  const atCostRun = ((consolidation?.at_cost as Record<string, string>[] | undefined) ?? []);
  const out = [];
  for (const c of companies) {
    let statements = null as null | ReturnType<typeof buildStatements>;
    if (c.period_id && c.tb_rows > 0) {
      const entries = await loadTbEntries(c.period_id); const accounts = await loadAccountMap(c.client_id);
      statements = buildStatements({ current: entries, accounts, periodLabel: c.period_label });
    }
    const tbRun = c.period_id ? await latestRun(c.period_id, 'tb_validation') : null;
    const openFindings = c.period_id ? Number((await one<{ n: string }>(`SELECT count(*) AS n FROM findings WHERE period_id = $1 AND review_status IN ('open','under_review')`, [c.period_id]))?.n ?? 0) : 0;
    // تكلفة الاستثمار لدى الأم: من آخر تشغيل توحيد إن وُجد، وإلا من الحسابات المقترحة بالاسم
    const sug = pre?.companies.find((x) => x.engagement_id === c.engagement_id);
    const parentAcc = (pre?.parent.accounts ?? {}) as Record<string, { net: number }>;
    const runCost = atCostRun.find((x) => x.label === c.name)?.investment_cost;
    const investmentCost = runCost ?? (sug ? String(sug.suggested.investment_codes_in_parent.reduce((a, code) => a + (parentAcc[code]?.net ?? 0), 0).toFixed(2)) : null);
    out.push({ name: c.name, role: c.role, ownership_pct: c.ownership_pct, cr_number: c.cr_number, period_label: c.period_label, tb_rows: c.tb_rows, tb_checked: !!tbRun, open_findings: openFindings, investment_cost: c.role === 'parent' ? null : investmentCost,
      statements: statements ? { sfp: { lines: statements.sfp.lines, totals: statements.sfp.totals, balanced: statements.sfp.balanced }, pl: { lines: statements.pl.lines, totals: statements.pl.totals }, key_figures: statements.key_figures } : null });
  }
  return out;
}

export type AiSnapshot = AiAnalysis & { _verification?: { unverified_numbers?: string[]; model?: string } };

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

/** لقطة البيانات التي يُبنى منها التقرير وتُحفظ مع الإصدار لضمان إعادة الإنتاج */
export async function collectSnapshot(engagementId: string, periodId: string, preparerId: string) {
  const engagement = await one<Record<string, string | null>>(`SELECT e.*, c.legal_name_ar AS client_name, c.legal_name_en AS client_name_en, c.entity_type, c.cr_number, c.vat_number, c.industry, c.accounting_framework AS client_framework, c.reporting_currency, c.is_demo::text AS is_demo FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.id = $1`, [engagementId]);
  if (!engagement) throw badRequest('الارتباط غير موجود');
  const period = await loadPeriod(periodId, engagementId);
  const office = await getOfficeSettings();
  const tbRun = await latestRun(periodId, 'tb_validation') as { id: string; summary: Record<string, unknown>; result: { accounts?: unknown[] } ; started_at: string } | undefined;
  const pkg = await getStatementsPackage(periodId);
  const findings = await many(`SELECT f.*, d.title AS source_document_title FROM findings f LEFT JOIN source_documents d ON d.id = f.source_document_id WHERE f.period_id = $1 AND f.review_status NOT IN ('rejected', 'resolved')
    ORDER BY CASE f.severity WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END DESC, COALESCE(f.amount,0) DESC, f.finding_ref`, [periodId]);
  const adjustments = await many(`SELECT a.*, f.finding_ref FROM proposed_adjustments a LEFT JOIN findings f ON f.id = a.finding_id WHERE a.engagement_id = $1 AND (a.period_id = $2 OR a.period_id IS NULL) ORDER BY a.adj_ref`, [engagementId, periodId]);
  // المستندات: آخر اعتماد لكل نوع بيانات وفترة (الاستيرادات المستبدلة لا تُعرض)، إضافة إلى المستندات غير المعتمدة
  const documents = await many(`WITH committed AS (
      SELECT DISTINCT ON (j.data_type, j.period_id) j.document_id, j.data_type, j.committed_at,
             COALESCE((j.validation_report->>'ok')::int, 0) + COALESCE((j.validation_report->>'warnings')::int, 0) AS data_rows
        FROM import_jobs j WHERE j.engagement_id = $1 AND j.status = 'committed' ORDER BY j.data_type, j.period_id, j.committed_at DESC)
    SELECT d.id, d.title, d.document_type, d.status, d.uploaded_at, f.original_name, f.sha256, c.data_type, c.committed_at, c.data_rows
      FROM source_documents d JOIN stored_files f ON f.id = d.file_id LEFT JOIN committed c ON c.document_id = d.id
     WHERE d.engagement_id = $1 AND d.deleted_at IS NULL AND (c.document_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM import_jobs j2 WHERE j2.document_id = d.id AND j2.status = 'committed'))
     ORDER BY d.uploaded_at`, [engagementId]);
  // مصادر التوحيد: مستندات كل شركة في المجموعة من آخر تشغيل توحيد على هذه الفترة (لتتبع كل مبلغ موحد إلى مستنده)
  const consolidation = await latestRun(periodId, 'consolidation');
  const groupSources = ((consolidation?.result as { sources?: Record<string, unknown>[] } | null)?.sources ?? []).map((x) => ({ id: x.import_id, title: x.title, document_type: x.document_type, status: 'committed', uploaded_at: x.uploaded_at, original_name: x.original_name, sha256: x.sha256, data_type: x.data_type, committed_at: x.committed_at, data_rows: x.data_rows, company: x.company, period: x.period, version_no: x.version_no, used_in: x.used_in }));
  const letter = await one<{ letter_no: string | null; status: string; letter_date: string; fields: Record<string, unknown> }>('SELECT letter_no, status, letter_date::text AS letter_date, fields FROM engagement_letters WHERE engagement_id = $1', [engagementId]);
  const ai = await latestAiAnalysis(periodId);
  const sub: Record<string, unknown> = {};
  for (const t of ['receivable', 'payable', 'fixed_asset', 'inventory', 'bank_transaction']) { const r = await latestRun(periodId, `subledger_${t}`); if (r) sub[t] = r; }
  const journal = await latestRun(periodId, 'journal');
  const preparer = await one<{ full_name: string; role_code: string }>('SELECT full_name, role_code FROM users WHERE id = $1', [preparerId]);
  const entries = await loadTbEntries(periodId);
  const accounts = await loadAccountMap(engagement.client_id!);
  const pm = prefixMapFor(entries);
  const tbRows = entries.map((t) => { const m = resolveMeta(t, accounts, pm); return { account_code: t.account_code, account_name: t.account_name, opening_net: toStr(net(t.opening_debit, t.opening_credit)), movement_net: toStr(net(t.period_debit, t.period_credit)), closing_debit: toStr(t.closing_debit), closing_credit: toStr(t.closing_credit), closing_net: toStr(net(t.closing_debit, t.closing_credit)), fs_line: FS_LINE_MAP[m.fs_line_code]?.label_ar ?? m.fs_line_code, account_type: m.account_type, source_row: t.source_row }; });
  const prior = pkg?.data.prior as { id: string; label: string } | null | undefined;
  // البيانات النظامية المعتمدة: للشركة نفسها، ولكل شركات المجموعة في ارتباط المجموعة
  const offComps = engagement.group_engagement_id ? [] : await listComponents(engagementId);
  const offTargets = [{ id: engagementId, name: engagement.client_name ?? '' }, ...offComps.map((c) => ({ id: c.id, name: c.client_name }))];
  const offRows = await confirmedOfficial(offTargets.map((t) => t.id));
  const officialData = offTargets.map((t) => ({ name: t.name, records: offRows.filter((r) => r.engagement_id === t.id) })).filter((x) => x.records.length);
  const groupCompanies = engagement.group_engagement_id ? null : await collectGroupCompanies(engagementId, periodId, (consolidation?.result as Record<string, unknown> | null) ?? null);
  return { generated_at: new Date().toISOString(), engagement, period, prior: prior ?? null, office, tb: tbRun ? { run_id: tbRun.id, summary: tbRun.summary, run_at: iso(tbRun.started_at)! } : null, tb_rows: tbRows,
    statements: pkg?.data.statements ?? null, ratios: pkg?.data.ratios ?? null, variance: pkg?.data.variance ?? null, findings, adjustments, documents: documents.map((d) => ({ ...d, uploaded_at: iso(d.uploaded_at), committed_at: iso(d.committed_at) })), consolidation: (consolidation?.result as Record<string, unknown> | null) ?? null, group_companies: groupCompanies, official_data: officialData, engagement_letter: letter ?? null, consolidation_run_at: iso(consolidation?.started_at as string | undefined), group_documents: groupSources.map((d) => ({ ...d, uploaded_at: iso(d.uploaded_at as string), committed_at: iso(d.committed_at as string) })), ai: (ai?.result as AiSnapshot | null) ?? null, ai_run_at: iso(ai?.started_at), subledger: sub, journal: journal ?? null, preparer };
}
export type Snapshot = Awaited<ReturnType<typeof collectSnapshot>>;
