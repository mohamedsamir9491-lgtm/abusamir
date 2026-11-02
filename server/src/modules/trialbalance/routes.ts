import { Router } from 'express';
import { many, one } from '../../db/pool.js';
import { badRequest } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { loadEngagement, loadPeriod } from '../../middleware/scope.js';
import { loadTbEntries, loadAccountMap, findPriorPeriod } from '../analysis/service.js';
import { resolveMeta, prefixMapFor } from '../../engine/trialBalance.js';
import { net, toStr, sum } from '../../engine/money.js';
import { FS_LINE_MAP } from '../../engine/fsLines.js';

export const trialBalanceRouter = Router();
trialBalanceRouter.use(authenticate, requirePermission('clients.view'));

/** عرض ميزان المراجعة لفترة مع التصنيف وصافي الأرصدة ومقارنة بالفترة السابقة */
trialBalanceRouter.get('/', async (req, res, next) => {
  try {
    const engagementId = String(req.query.engagement_id ?? ''); const periodId = String(req.query.period_id ?? '');
    if (!engagementId || !periodId) throw badRequest('engagement_id و period_id مطلوبان');
    const e = await loadEngagement(engagementId);
    await loadPeriod(periodId, engagementId);
    const entries = await loadTbEntries(periodId);
    const accounts = await loadAccountMap(e.client_id);
    const prior = await findPriorPeriod(engagementId, e.client_id, periodId);
    const priorMap = new Map<string, string>();
    if (prior) for (const p of await loadTbEntries(prior.id)) priorMap.set(p.account_code, toStr(net(p.closing_debit, p.closing_credit)));
    const pm = prefixMapFor(entries);
    const rows = entries.map((t) => {
      const meta = resolveMeta(t, accounts, pm);
      return { ...t, opening_net: toStr(net(t.opening_debit, t.opening_credit)), movement_net: toStr(net(t.period_debit, t.period_credit)), closing_net: toStr(net(t.closing_debit, t.closing_credit)),
        account_type: meta.account_type, sub_type: meta.sub_type, normal_balance: meta.normal_balance, fs_line_code: meta.fs_line_code, fs_line_label: FS_LINE_MAP[meta.fs_line_code]?.label_ar ?? meta.fs_line_code,
        is_suspense: meta.is_suspense, in_chart: accounts.has(t.account_code), prior_closing_net: priorMap.get(t.account_code) ?? null };
    });
    const totals = { opening_debit: toStr(sum(entries.map((x) => x.opening_debit))), opening_credit: toStr(sum(entries.map((x) => x.opening_credit))), period_debit: toStr(sum(entries.map((x) => x.period_debit))), period_credit: toStr(sum(entries.map((x) => x.period_credit))), closing_debit: toStr(sum(entries.map((x) => x.closing_debit))), closing_credit: toStr(sum(entries.map((x) => x.closing_credit))) };
    const lastRun = await one(`SELECT id, summary, started_at FROM analysis_runs WHERE period_id = $1 AND run_type = 'tb_validation' AND status = 'completed' ORDER BY started_at DESC LIMIT 1`, [periodId]);
    const source = await one(`SELECT j.id AS import_job_id, j.committed_at, d.id AS document_id, f.original_name FROM import_jobs j JOIN source_documents d ON d.id = j.document_id JOIN stored_files f ON f.id = d.file_id WHERE j.period_id = $1 AND j.data_type = 'trial_balance' AND j.status = 'committed' ORDER BY j.committed_at DESC LIMIT 1`, [periodId]);
    res.json({ rows, totals, prior, last_run: lastRun ?? null, source: source ?? null });
  } catch (e) { next(e); }
});

/** حركات حساب من قيود اليومية (للتتبع من الملاحظة إلى المصدر) */
trialBalanceRouter.get('/account-activity', async (req, res, next) => {
  try {
    const periodId = String(req.query.period_id ?? ''); const code = String(req.query.account_code ?? '');
    if (!periodId || !code) throw badRequest('period_id و account_code مطلوبان');
    const lines = await many(`SELECT j.entry_no, j.entry_date, j.description AS entry_description, j.reference, l.debit, l.credit, l.description, l.counterparty, l.source_row
      FROM journal_lines l JOIN journal_entries j ON j.id = l.journal_entry_id WHERE j.period_id = $1 AND l.account_code = $2 ORDER BY j.entry_date, j.entry_no LIMIT 2000`, [periodId, code]);
    res.json({ lines, totals: { debit: toStr(sum(lines.map((l) => l.debit as string))), credit: toStr(sum(lines.map((l) => l.credit as string))) } });
  } catch (e) { next(e); }
});
