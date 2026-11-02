import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { createBackup, listBackups, verifyBackup } from '../backup/service.js';
import { config } from '../../config.js';
import { encryptionEnabled } from '../../lib/crypto.js';

export const systemRouter = Router();
systemRouter.use(authenticate);

systemRouter.get('/settings', requirePermission('audit.view'), async (_req, res, next) => {
  try {
    const rows = await many<{ key: string; value: unknown; updated_at: string }>('SELECT key, value, updated_at FROM system_settings ORDER BY key');
    res.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])), env: { ai_provider: config.ai.provider, ai_allow_external: config.ai.allowExternal, file_encryption: encryptionEnabled(), max_upload_mb: config.maxUploadMb, node_env: config.nodeEnv } });
  } catch (e) { next(e); }
});

systemRouter.put('/settings/:key', requirePermission('system.manage'), async (req, res, next) => {
  try {
    const key = req.params.key as string;
    const schemas: Record<string, z.ZodTypeAny> = {
      retention_policy: z.object({ documents_years: z.number().int().min(1).max(50), reports_years: z.number().int().min(1).max(50), audit_log_years: z.number().int().min(1).max(50), auto_delete: z.boolean() }),
      ai_policy: z.object({ allow_external: z.boolean(), share_client_names: z.boolean(), training_opt_out: z.literal(true) }),
    };
    if (!schemas[key]) throw badRequest('مفتاح إعداد غير معروف');
    const value = parse(schemas[key], req.body);
    await query('INSERT INTO system_settings (key, value, updated_by) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()', [key, JSON.stringify(value), req.user!.id]);
    await audit(req, { action: 'system.setting_updated', entityType: 'system_settings', entityId: key, details: value as Record<string, unknown> });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

systemRouter.get('/backups', requirePermission('system.manage'), async (_req, res, next) => { try { res.json({ backups: await listBackups() }); } catch (e) { next(e); } });
systemRouter.post('/backups', requirePermission('system.manage'), async (req, res, next) => {
  try { const b = await createBackup(req.user!.id); await audit(req, { action: 'system.backup_created', entityType: 'backup', entityId: b.name, details: { size: b.size_bytes } }); res.status(201).json({ backup: b }); } catch (e) { next(e); }
});
systemRouter.post('/backups/:name/verify', requirePermission('system.manage'), async (req, res, next) => {
  try { const r = await verifyBackup(req.params.name as string); await audit(req, { action: 'system.backup_verified', entityType: 'backup', entityId: req.params.name as string, details: r as unknown as Record<string, unknown> }); res.json(r); } catch (e) { next(e); }
});

/** طلبات حذف البيانات وفق سياسة الاحتفاظ: طلب -> اعتماد -> تنفيذ (حذف منطقي للمستندات والسجلات مع الإبقاء على سجل التدقيق) */
systemRouter.get('/deletion-requests', requirePermission('data.delete'), async (_req, res, next) => {
  try { res.json({ requests: await many(`SELECT r.*, c.legal_name_ar AS client_name, u.full_name AS requested_by_name FROM data_deletion_requests r JOIN clients c ON c.id = r.client_id LEFT JOIN users u ON u.id = r.requested_by ORDER BY r.created_at DESC`) }); } catch (e) { next(e); }
});
systemRouter.post('/deletion-requests', requirePermission('data.delete'), async (req, res, next) => {
  try {
    const d = parse(z.object({ client_id: z.string().uuid(), scope: z.enum(['client', 'engagement', 'documents']).default('client'), engagement_id: z.string().uuid().nullable().optional(), reason: z.string().min(5).max(2000) }), req.body);
    const row = await one<{ id: string }>('INSERT INTO data_deletion_requests (client_id, scope, engagement_id, reason, requested_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [d.client_id, d.scope, d.engagement_id ?? null, d.reason, req.user!.id]);
    await audit(req, { action: 'data.deletion_requested', entityType: 'data_deletion_request', entityId: row!.id, clientId: d.client_id, details: d });
    res.status(201).json({ id: row!.id });
  } catch (e) { next(e); }
});
systemRouter.post('/deletion-requests/:id/:action', requirePermission('system.manage'), async (req, res, next) => {
  try {
    const action = req.params.action as string;
    const r = await one<{ id: string; client_id: string; scope: string; engagement_id: string | null; status: string; requested_by: string }>('SELECT * FROM data_deletion_requests WHERE id = $1', [req.params.id]);
    if (!r) throw notFound('الطلب غير موجود');
    if (action === 'approve') {
      if (r.status !== 'requested') throw badRequest('الطلب ليس في حالة تسمح بالاعتماد');
      if (r.requested_by === req.user!.id) throw badRequest('لا يمكن اعتماد طلب الحذف من الشخص نفسه الذي قدّمه (فصل المهام)');
      await query(`UPDATE data_deletion_requests SET status = 'approved', approved_by = $2 WHERE id = $1`, [r.id, req.user!.id]);
    } else if (action === 'reject') {
      await query(`UPDATE data_deletion_requests SET status = 'rejected', approved_by = $2 WHERE id = $1`, [r.id, req.user!.id]);
    } else if (action === 'execute') {
      if (r.status !== 'approved') throw badRequest('يجب اعتماد الطلب أولًا');
      const engFilter = r.scope === 'client' ? 'client_id = $1' : 'engagement_id = $2';
      await query(`UPDATE source_documents SET deleted_at = now() WHERE ${engFilter}`, [r.client_id, r.engagement_id]);
      await query(`UPDATE stored_files f SET deleted_at = now() FROM source_documents d WHERE d.file_id = f.id AND d.${engFilter}`, [r.client_id, r.engagement_id]);
      if (r.scope !== 'documents') {
        await query(`DELETE FROM trial_balance_entries WHERE ${engFilter}`, [r.client_id, r.engagement_id]);
        await query(`DELETE FROM journal_entries WHERE ${engFilter}`, [r.client_id, r.engagement_id]);
        await query(`DELETE FROM subledger_records WHERE ${engFilter}`, [r.client_id, r.engagement_id]);
        await query(`DELETE FROM imported_records ir USING import_jobs j WHERE ir.import_job_id = j.id AND j.${engFilter}`, [r.client_id, r.engagement_id]);
      }
      if (r.scope === 'client') await query('UPDATE clients SET is_active = FALSE, deleted_at = now() WHERE id = $1', [r.client_id]);
      await query(`UPDATE data_deletion_requests SET status = 'executed', executed_at = now() WHERE id = $1`, [r.id]);
    } else throw badRequest('إجراء غير معروف');
    await audit(req, { action: `data.deletion_${action}`, entityType: 'data_deletion_request', entityId: r.id, clientId: r.client_id, details: { scope: r.scope } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
