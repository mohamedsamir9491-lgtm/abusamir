import { Router } from 'express';
import { many, one } from '../../db/pool.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate, requirePermission('clients.view'));

dashboardRouter.get('/', async (_req, res, next) => {
  try {
    const counts = await one(`SELECT
      (SELECT count(*) FROM clients WHERE deleted_at IS NULL AND is_demo = FALSE) AS clients,
      (SELECT count(*) FROM clients WHERE deleted_at IS NULL AND is_demo = TRUE) AS demo_clients,
      (SELECT count(*) FROM engagements e JOIN clients c ON c.id = e.client_id WHERE c.deleted_at IS NULL AND e.status <> 'closed') AS active_engagements,
      (SELECT count(*) FROM findings WHERE review_status IN ('open','under_review')) AS open_findings,
      (SELECT count(*) FROM findings WHERE review_status IN ('open','under_review') AND severity IN ('critical','high')) AS high_findings,
      (SELECT count(*) FROM proposed_adjustments WHERE status IN ('proposed','under_review')) AS pending_adjustments,
      (SELECT count(*) FROM generated_reports WHERE status = 'draft') AS draft_reports,
      (SELECT count(*) FROM generated_reports WHERE status = 'reviewed') AS reports_awaiting_approval,
      (SELECT count(*) FROM source_documents WHERE deleted_at IS NULL AND status = 'uploaded') AS unprocessed_documents`);
    const recentEngagements = await many(`SELECT e.id, e.title, e.status, e.updated_at, c.legal_name_ar AS client_name, c.is_demo,
      (SELECT count(*) FROM findings f WHERE f.engagement_id = e.id AND f.review_status IN ('open','under_review')) AS open_findings
      FROM engagements e JOIN clients c ON c.id = e.client_id WHERE c.deleted_at IS NULL ORDER BY e.updated_at DESC LIMIT 8`);
    const recentActivity = await many(`SELECT a.action, a.entity_type, a.entity_id, a.created_at, u.full_name AS user_name, c.legal_name_ar AS client_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN clients c ON c.id = a.client_id ORDER BY a.created_at DESC LIMIT 15`);
    const office = await one('SELECT name_ar, name_en, logo_file_id, signatory_name FROM office_settings WHERE id = 1');
    res.json({ counts, recent_engagements: recentEngagements, recent_activity: recentActivity, office_configured: !!(office?.name_ar) });
  } catch (e) { next(e); }
});
