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
  const findings = await many(`SELECT f.*, d.title AS source_document_title FROM findings f LEFT JOIN source_documents d ON d.id = f.source_document_id WHERE f.period_id = $1 AND f.review_status <> 'rejected'
    ORDER BY CASE f.severity WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END DESC, COALESCE(f.amount,0) DESC, f.finding_ref`, [periodId]);
  const adjustments = await many(`SELECT a.*, f.finding_ref FROM proposed_adjustments a LEFT JOIN findings f ON f.id = a.finding_id WHERE a.engagement_id = $1 AND (a.period_id = $2 OR a.period_id IS NULL) ORDER BY a.adj_ref`, [engagementId, periodId]);
  const documents = await many(`SELECT d.id, d.title, d.document_type, d.status, d.uploaded_at, f.original_name, f.sha256, j.data_type, j.committed_at, j.row_count FROM source_documents d JOIN stored_files f ON f.id = d.file_id LEFT JOIN import_jobs j ON j.document_id = d.id AND j.status = 'committed' WHERE d.engagement_id = $1 AND d.deleted_at IS NULL ORDER BY d.uploaded_at`, [engagementId]);
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
  return { generated_at: new Date().toISOString(), engagement, period, prior: prior ?? null, office, tb: tbRun ? { run_id: tbRun.id, summary: tbRun.summary, run_at: iso(tbRun.started_at)! } : null, tb_rows: tbRows,
    statements: pkg?.data.statements ?? null, ratios: pkg?.data.ratios ?? null, variance: pkg?.data.variance ?? null, findings, adjustments, documents: documents.map((d) => ({ ...d, uploaded_at: iso(d.uploaded_at), committed_at: iso(d.committed_at) })), ai: (ai?.result as AiSnapshot | null) ?? null, ai_run_at: iso(ai?.started_at), subledger: sub, journal: journal ?? null, preparer };
}
export type Snapshot = Awaited<ReturnType<typeof collectSnapshot>>;
