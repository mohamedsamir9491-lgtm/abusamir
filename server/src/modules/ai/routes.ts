import { Router } from 'express';
import { z } from 'zod';
import { many } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { loadEngagement } from '../../middleware/scope.js';
import { runAiAnalysis, latestAiAnalysis, draftSection, aiStatus } from './service.js';

export const aiRouter = Router();
aiRouter.use(authenticate, requirePermission('clients.view'));

aiRouter.get('/status', async (_req, res, next) => { try { res.json(await aiStatus()); } catch (e) { next(e); } });

aiRouter.post('/analyze', requirePermission('ai.run'), async (req, res, next) => {
  try {
    const d = parse(z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid(), confirm_external_transfer: z.literal(true) }), req.body);
    const e = await loadEngagement(d.engagement_id);
    await audit(req, { action: 'ai.analysis_requested', entityType: 'engagement', entityId: e.id, clientId: e.client_id, details: { period_id: d.period_id } });
    const r = await runAiAnalysis(d.engagement_id, d.period_id, req.user!.id);
    await audit(req, { action: 'ai.analysis_completed', entityType: 'analysis_run', entityId: r.run_id, clientId: e.client_id, details: { ...r.usage, observations: r.analysis.observations.length, unverified: r.analysis._verification.unverified_numbers.length } });
    res.json(r);
  } catch (e) { next(e); }
});

aiRouter.get('/latest', async (req, res, next) => {
  try {
    const periodId = String(req.query.period_id ?? '');
    if (!periodId) throw badRequest('period_id مطلوب');
    res.json({ analysis: await latestAiAnalysis(periodId) });
  } catch (e) { next(e); }
});

aiRouter.post('/draft-section', requirePermission('ai.run'), async (req, res, next) => {
  try {
    const d = parse(z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid(), section_title: z.string().min(2).max(200), instructions: z.string().max(2000).default(''), confirm_external_transfer: z.literal(true) }), req.body);
    const e = await loadEngagement(d.engagement_id);
    const r = await draftSection({ engagementId: d.engagement_id, periodId: d.period_id, sectionTitle: d.section_title, instructions: d.instructions, userId: req.user!.id });
    await audit(req, { action: 'ai.section_drafted', entityType: 'ai_request', entityId: r.request_id, clientId: e.client_id, details: { section: d.section_title } });
    res.json(r);
  } catch (e) { next(e); }
});

aiRouter.get('/requests', async (req, res, next) => {
  try {
    const engagementId = String(req.query.engagement_id ?? '');
    if (!engagementId) throw badRequest('engagement_id مطلوب');
    const rows = await many(`SELECT r.id, r.provider, r.model, r.purpose, r.status, r.input_tokens, r.output_tokens, r.error_message, r.created_at, r.finished_at, u.full_name AS created_by_name FROM ai_requests r LEFT JOIN users u ON u.id = r.created_by WHERE r.engagement_id = $1 ORDER BY r.created_at DESC LIMIT 50`, [engagementId]);
    res.json({ requests: rows });
  } catch (e) { next(e); }
});
