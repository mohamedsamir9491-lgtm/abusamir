import { Router } from 'express';
import { z } from 'zod';
import { many, one } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { runTbValidation, runStatements, getStatementsPackage, runJournalChecks, runSubledgerAnalysis, latestRun } from './service.js';
import { loadEngagement, loadPeriod } from '../../middleware/scope.js';

export const analysisRouter = Router();
analysisRouter.use(authenticate, requirePermission('clients.view'));

const base = z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid() });

analysisRouter.post('/trial-balance/validate', requirePermission('analysis.run'), async (req, res, next) => {
  try {
    const d = parse(base.extend({ materiality: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(), tolerance: z.string().regex(/^\d+(\.\d+)?$/).optional(), material_change_pct: z.number().min(1).max(500).optional() }), req.body);
    const r = await runTbValidation(d.engagement_id, d.period_id, req.user!.id, { materiality: d.materiality ?? null, tolerance: d.tolerance, materialChangePct: d.material_change_pct });
    const e = await loadEngagement(d.engagement_id);
    await audit(req, { action: 'analysis.tb_validation', entityType: 'analysis_run', entityId: r.run_id, clientId: e.client_id, details: { period_id: d.period_id, findings: r.result.findings.length, ...r.findings_saved } });
    res.json(r);
  } catch (e) { next(e); }
});

analysisRouter.get('/trial-balance/latest', async (req, res, next) => {
  try {
    const periodId = String(req.query.period_id ?? '');
    if (!periodId) throw badRequest('period_id مطلوب');
    res.json({ run: await latestRun(periodId, 'tb_validation') });
  } catch (e) { next(e); }
});

analysisRouter.post('/statements/generate', requirePermission('analysis.run'), async (req, res, next) => {
  try {
    const d = parse(base, req.body);
    const r = await runStatements(d.engagement_id, d.period_id, req.user!.id);
    const e = await loadEngagement(d.engagement_id);
    await audit(req, { action: 'analysis.statements', entityType: 'analysis_run', entityId: r.run_id, clientId: e.client_id, details: { period_id: d.period_id, balanced: r.statements.sfp.balanced } });
    res.json(r);
  } catch (e) { next(e); }
});

analysisRouter.get('/statements', async (req, res, next) => {
  try {
    const periodId = String(req.query.period_id ?? ''); const engagementId = String(req.query.engagement_id ?? '');
    if (!periodId || !engagementId) throw badRequest('engagement_id و period_id مطلوبان');
    await loadPeriod(periodId, engagementId);
    const pkg = await getStatementsPackage(periodId);
    res.json({ package: pkg });
  } catch (e) { next(e); }
});

analysisRouter.post('/journal/validate', requirePermission('analysis.run'), async (req, res, next) => {
  try {
    const d = parse(base, req.body);
    const r = await runJournalChecks(d.engagement_id, d.period_id, req.user!.id);
    const e = await loadEngagement(d.engagement_id);
    await audit(req, { action: 'analysis.journal', entityType: 'analysis_run', entityId: r.run_id, clientId: e.client_id, details: { period_id: d.period_id, ...r.summary } });
    res.json(r);
  } catch (e) { next(e); }
});

analysisRouter.post('/subledger/analyze', requirePermission('analysis.run'), async (req, res, next) => {
  try {
    const d = parse(base.extend({ record_type: z.enum(['receivable', 'payable', 'inventory', 'fixed_asset', 'bank_transaction']) }), req.body);
    const r = await runSubledgerAnalysis(d.engagement_id, d.period_id, d.record_type, req.user!.id);
    const e = await loadEngagement(d.engagement_id);
    await audit(req, { action: `analysis.subledger_${d.record_type}`, entityType: 'analysis_run', entityId: r.run_id, clientId: e.client_id, details: { period_id: d.period_id, records: r.records, findings: r.findings.length } });
    res.json(r);
  } catch (e) { next(e); }
});

analysisRouter.get('/runs', async (req, res, next) => {
  try {
    const engagementId = String(req.query.engagement_id ?? '');
    if (!engagementId) throw badRequest('engagement_id مطلوب');
    const runs = await many(`SELECT r.id, r.run_type, r.status, r.summary, r.started_at, r.finished_at, r.error_message, p.label AS period_label, r.period_id, u.full_name AS started_by_name
      FROM analysis_runs r LEFT JOIN financial_periods p ON p.id = r.period_id LEFT JOIN users u ON u.id = r.started_by WHERE r.engagement_id = $1 ORDER BY r.started_at DESC LIMIT 100`, [engagementId]);
    res.json({ runs });
  } catch (e) { next(e); }
});

analysisRouter.get('/runs/:id', async (req, res, next) => {
  try {
    const run = await one('SELECT * FROM analysis_runs WHERE id = $1', [req.params.id]);
    if (!run) throw badRequest('التشغيل غير موجود');
    res.json({ run });
  } catch (e) { next(e); }
});

/** حالة اكتمال المراحل للارتباط (لعرض التقدم) */
analysisRouter.get('/progress', async (req, res, next) => {
  try {
    const engagementId = String(req.query.engagement_id ?? '');
    if (!engagementId) throw badRequest('engagement_id مطلوب');
    const e = await loadEngagement(engagementId);
    const periods = await many<{ id: string; label: string; role: string }>('SELECT id, label, role FROM financial_periods WHERE engagement_id = $1 ORDER BY start_date', [engagementId]);
    const out = [] as unknown[];
    for (const p of periods) {
      const s = await one<Record<string, string>>(`SELECT
        (SELECT count(*) FROM trial_balance_entries WHERE period_id = $1) AS tb_rows,
        (SELECT count(*) FROM journal_entries WHERE period_id = $1) AS je_count,
        (SELECT count(*) FROM subledger_records WHERE period_id = $1) AS sub_count,
        (SELECT max(started_at) FROM analysis_runs WHERE period_id = $1 AND run_type = 'tb_validation' AND status = 'completed') AS tb_validated_at,
        (SELECT max(started_at) FROM analysis_runs WHERE period_id = $1 AND run_type = 'statements' AND status = 'completed') AS statements_at,
        (SELECT max(started_at) FROM analysis_runs WHERE period_id = $1 AND run_type = 'ai_analysis' AND status = 'completed') AS ai_at,
        (SELECT count(*) FROM findings WHERE period_id = $1 AND review_status IN ('open','under_review')) AS open_findings,
        (SELECT count(*) FROM findings WHERE period_id = $1) AS total_findings,
        (SELECT count(*) FROM generated_reports WHERE period_id = $1) AS reports,
        (SELECT count(*) FROM generated_reports WHERE period_id = $1 AND status IN ('approved','issued')) AS approved_reports`, [p.id]);
      out.push({ period: p, ...s });
    }
    const docs = await one<{ c: string }>('SELECT count(*) AS c FROM source_documents WHERE engagement_id = $1 AND deleted_at IS NULL', [engagementId]);
    res.json({ engagement: e, documents: Number(docs?.c ?? 0), periods: out });
  } catch (e) { next(e); }
});
