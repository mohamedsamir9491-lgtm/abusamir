import { Router } from 'express';
import { z } from 'zod';
import { many } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { loadEngagement } from '../../middleware/scope.js';
import { runAiAnalysis, latestAiAnalysis, draftSection, aiStatus, runLocalAnalysis, externalChat } from './service.js';
import { answerQuestion } from './chat.js';
import { isLegalQuestion, legalAnswer, standardAnswer, LEGAL_NOT_FOUND } from '../legal/answer.js';
import { officeAnswer, OFFICE_SUGGEST } from './office.js';

export const aiRouter = Router();
aiRouter.use(authenticate, requirePermission('clients.view'));

aiRouter.get('/status', async (_req, res, next) => { try { res.json(await aiStatus()); } catch (e) { next(e); } });

aiRouter.post('/analyze', requirePermission('ai.run'), async (req, res, next) => {
  try {
    const d = parse(z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid(), engine: z.enum(['local', 'external']).default('local'), confirm_external_transfer: z.boolean().optional() }), req.body);
    const e = await loadEngagement(d.engagement_id);
    if (d.engine === 'local') {
      const r = await runLocalAnalysis(d.engagement_id, d.period_id, req.user!.id);
      await audit(req, { action: 'ai.local_analysis', entityType: 'analysis_run', entityId: r.run_id, clientId: e.client_id, details: { observations: r.analysis.observations.length } });
      res.json(r); return;
    }
    if (d.confirm_external_transfer !== true) throw badRequest('يلزم تأكيد إرسال البيانات للمزوّد الخارجي');
    await audit(req, { action: 'ai.analysis_requested', entityType: 'engagement', entityId: e.id, clientId: e.client_id, details: { period_id: d.period_id } });
    const r = await runAiAnalysis(d.engagement_id, d.period_id, req.user!.id);
    await audit(req, { action: 'ai.analysis_completed', entityType: 'analysis_run', entityId: r.run_id, clientId: e.client_id, details: { ...r.usage, observations: r.analysis.observations.length, unverified: r.analysis._verification.unverified_numbers.length } });
    res.json(r);
  } catch (e) { next(e); }
});

/** المحادثة: محلية افتراضيًا (بيانات البرنامج + المعرفة المحاسبية)، أو عبر المزوّد الخارجي إن فُعّل وطلبه المستخدم صراحة */
aiRouter.post('/chat', async (req, res, next) => {
  try {
    const d = parse(z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid(), message: z.string().min(1).max(1000), engine: z.enum(['local', 'external']).default('local'), confirm_external_transfer: z.boolean().optional() }), req.body);
    const e = await loadEngagement(d.engagement_id);
    await audit(req, { action: 'ai.chat', entityType: 'engagement', entityId: e.id, clientId: e.client_id, details: { engine: d.engine, question: d.message.slice(0, 200) } });
    if (d.engine === 'external') { if (d.confirm_external_transfer !== true) throw badRequest('يلزم تأكيد إرسال البيانات للمزوّد الخارجي'); res.json({ engine: 'external', ...(await externalChat(d.engagement_id, d.period_id, d.message, req.user!.id)) }); return; }
    if (isLegalQuestion(d.message)) { res.json({ engine: 'local', scope: 'legal', ...((await legalAnswer(d.message)) ?? LEGAL_NOT_FOUND()) }); return; }
    res.json({ engine: 'local', ...(await answerQuestion(d.engagement_id, d.period_id, d.message)) });
  } catch (e) { next(e); }
});

/** مساعد سهم الذكي (الشريط العلوي): أسئلة المكتب أولًا، ثم أسئلة الارتباط المختار؛ محلي دائمًا */
aiRouter.post('/assistant', async (req, res, next) => {
  try {
    const d = parse(z.object({ engagement_id: z.string().uuid().nullable().optional(), period_id: z.string().uuid().nullable().optional(), message: z.string().min(1).max(1000) }), req.body);
    await audit(req, { action: 'ai.assistant', entityType: 'office', entityId: null, details: { question: d.message.slice(0, 200), engagement_id: d.engagement_id ?? null } });
    if (isLegalQuestion(d.message)) { res.json({ engine: 'local', scope: 'legal', ...((await legalAnswer(d.message)) ?? LEGAL_NOT_FOUND()) }); return; }
    const office = await officeAnswer(d.message);
    if (office) { res.json({ engine: 'local', scope: 'office', ...office }); return; }
    if (d.engagement_id && d.period_id) { await loadEngagement(d.engagement_id); res.json({ engine: 'local', scope: 'engagement', ...(await answerQuestion(d.engagement_id, d.period_id, d.message)) }); return; }
    const std = await standardAnswer(d.message);
    if (std) { res.json({ engine: 'local', scope: 'standard', ...std }); return; }
    res.json({ engine: 'local', scope: 'help', intent: 'help', company: 'المكتب', period: '', sources: [], suggestions: OFFICE_SUGGEST,
      text: ['أجيب عن أسئلة المكتب: المستحقات، والتحصيل، والإيرادات، والمكتسب، والمواعيد، والخطابات، والملاحظات، والطلبات، وأي عميل بالاسم.', 'ولأسئلة القوائم والحسابات (الأصول، الأرباح، النسب…) اختر الارتباط من الشريط العلوي ثم اسألني.', 'وأجيب عن أسئلة الزكاة والضريبة والجمارك بنص المادة ومرجعها من المكتبة النظامية.'] });
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
