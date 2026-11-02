import { Router } from 'express';
import { many, one } from '../../db/pool.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';

export const auditRouter = Router();
auditRouter.use(authenticate, requirePermission('audit.view'));

auditRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 500); const offset = Number(req.query.offset ?? 0);
    const action = typeof req.query.action === 'string' ? `${req.query.action}%` : null;
    const userId = typeof req.query.user_id === 'string' ? req.query.user_id : null;
    const clientId = typeof req.query.client_id === 'string' ? req.query.client_id : null;
    const entityId = typeof req.query.entity_id === 'string' ? req.query.entity_id : null;
    const from = typeof req.query.from === 'string' ? req.query.from : null; const to = typeof req.query.to === 'string' ? req.query.to : null;
    const where = `WHERE ($1::text IS NULL OR a.action LIKE $1) AND ($2::uuid IS NULL OR a.user_id = $2) AND ($3::uuid IS NULL OR a.client_id = $3) AND ($4::text IS NULL OR a.entity_id = $4)
      AND ($5::timestamptz IS NULL OR a.created_at >= $5) AND ($6::timestamptz IS NULL OR a.created_at < $6::timestamptz + interval '1 day')`;
    const params = [action, userId, clientId, entityId, from, to];
    const rows = await many(`SELECT a.*, u.full_name AS user_name, u.email AS user_email, c.legal_name_ar AS client_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN clients c ON c.id = a.client_id ${where} ORDER BY a.created_at DESC LIMIT $7 OFFSET $8`, [...params, limit, offset]);
    const total = await one<{ c: string }>(`SELECT count(*) AS c FROM audit_logs a ${where}`, params);
    res.json({ logs: rows, total: Number(total?.c ?? 0) });
  } catch (e) { next(e); }
});
