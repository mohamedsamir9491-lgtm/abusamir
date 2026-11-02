import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';

/**
 * تنظيف البيانات لمالك النظام (صلاحية data.delete): يعرض المرشحين للحذف بالعدد والحجم أولًا، ثم ينفذ الحذف بتأكيد صريح، وكل عملية تُسجَّل في سجل التدقيق.
 * لا يُحذف شيء تلقائيًا؛ المستندات الأصلية التي اعتُمدت بياناتها لا تُحذف من هنا (تتبع).
 */
export const cleanupRouter = Router();
cleanupRouter.use(authenticate, requirePermission('data.delete'));

const CATEGORIES = {
  draft_reports: { label: 'تقارير مسودة قديمة', sql: (d: number) => `SELECT r.id, r.reference_no AS name, r.title AS detail, r.updated_at AS at, c.legal_name_ar AS client FROM generated_reports r JOIN clients c ON c.id = r.client_id WHERE r.status = 'draft' AND r.updated_at < now() - ($1 || ' days')::interval`, del: `DELETE FROM generated_reports WHERE id = ANY($1::uuid[])` },
  superseded_reports: { label: 'تقارير مسودة متجاوَزة (يوجد تقرير أحدث لنفس الفترة والقالب)', sql: () => `SELECT r.id, r.reference_no AS name, r.title AS detail, r.updated_at AS at, c.legal_name_ar AS client FROM generated_reports r JOIN clients c ON c.id = r.client_id WHERE r.status = 'draft' AND EXISTS (SELECT 1 FROM generated_reports r2 WHERE r2.period_id = r.period_id AND r2.template_id = r.template_id AND r2.created_at > r.created_at) AND $1::int >= 0`, del: `DELETE FROM generated_reports WHERE id = ANY($1::uuid[])` },
  failed_imports: { label: 'مهام استيراد فاشلة أو ملغاة أو غير مكتملة', sql: () => `SELECT j.id, j.data_type AS name, j.status AS detail, j.created_at AS at, c.legal_name_ar AS client FROM import_jobs j JOIN clients c ON c.id = j.client_id WHERE j.status IN ('failed','cancelled','created','mapped','validated') AND j.created_at < now() - ($1 || ' days')::interval`, del: `DELETE FROM import_jobs WHERE id = ANY($1::uuid[])` },
  superseded_imports: { label: 'استيرادات معتمدة استُبدلت باستيراد أحدث لنفس النوع والفترة', sql: () => `SELECT j.id, j.data_type AS name, to_char(j.committed_at, 'YYYY-MM-DD HH24:MI') AS detail, j.committed_at AS at, c.legal_name_ar AS client FROM import_jobs j JOIN clients c ON c.id = j.client_id WHERE j.status = 'committed' AND EXISTS (SELECT 1 FROM import_jobs j2 WHERE j2.period_id = j.period_id AND j2.data_type = j.data_type AND j2.status = 'committed' AND j2.committed_at > j.committed_at) AND $1::int >= 0`, del: `DELETE FROM import_jobs WHERE id = ANY($1::uuid[])` },
  orphan_documents: { label: 'مستندات مرفوعة لم تُستورد قط', sql: () => `SELECT d.id, f.original_name AS name, d.document_type AS detail, d.uploaded_at AS at, c.legal_name_ar AS client FROM source_documents d JOIN stored_files f ON f.id = d.file_id JOIN clients c ON c.id = d.client_id WHERE d.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM import_jobs j WHERE j.document_id = d.id AND j.status = 'committed') AND d.uploaded_at < now() - ($1 || ' days')::interval`, del: `UPDATE source_documents SET deleted_at = now() WHERE id = ANY($1::uuid[])` },
  superseded_runs: { label: 'تشغيلات تحليل متجاوَزة (يوجد تشغيل أحدث لنفس النوع والفترة)', sql: () => `SELECT a.id, a.run_type AS name, a.status AS detail, a.started_at AS at, c.legal_name_ar AS client FROM analysis_runs a JOIN clients c ON c.id = a.client_id WHERE EXISTS (SELECT 1 FROM analysis_runs a2 WHERE a2.period_id = a.period_id AND a2.run_type = a.run_type AND a2.started_at > a.started_at AND a2.status = 'completed') AND $1::int >= 0`, del: `DELETE FROM analysis_runs WHERE id = ANY($1::uuid[])` },
  rejected_findings: { label: 'ملاحظات مرفوضة أو معالَجة قديمة', sql: (d: number) => `SELECT f.id, f.finding_ref AS name, f.title AS detail, f.updated_at AS at, c.legal_name_ar AS client FROM findings f JOIN clients c ON c.id = f.client_id WHERE f.review_status IN ('rejected','resolved') AND f.updated_at < now() - ($1 || ' days')::interval`, del: `DELETE FROM findings WHERE id = ANY($1::uuid[])` },
  demo_clients: { label: 'عملاء تجريبيون وكل بياناتهم', sql: () => `SELECT c.id, c.legal_name_ar AS name, 'تجريبي' AS detail, c.created_at AS at, c.legal_name_ar AS client FROM clients c WHERE c.is_demo = TRUE AND c.deleted_at IS NULL AND $1::int >= 0`, del: 'PURGE_CLIENTS' },
  archived_clients: { label: 'عملاء مؤرشفون (تطهير نهائي لكل بياناتهم)', sql: () => `SELECT c.id, c.legal_name_ar AS name, to_char(c.deleted_at, 'YYYY-MM-DD') AS detail, c.deleted_at AS at, c.legal_name_ar AS client FROM clients c WHERE c.deleted_at IS NOT NULL AND $1::int >= 0`, del: 'PURGE_CLIENTS' },
} as const;
type Cat = keyof typeof CATEGORIES;

/** تطهير عميل نهائيًا: الارتباطات تُحذف أولًا (تتسلسل إليها الفترات والمستندات والاستيرادات والموازين والملاحظات والتقارير) ثم دليل الحسابات ثم العميل */
export async function purgeClient(clientId: string) {
  await query('DELETE FROM engagements WHERE client_id = $1', [clientId]);
  await query('DELETE FROM chart_of_accounts WHERE client_id = $1', [clientId]);
  await query('DELETE FROM findings WHERE client_id = $1', [clientId]);
  await query('DELETE FROM clients WHERE id = $1', [clientId]);
}

cleanupRouter.get('/candidates', async (req, res, next) => {
  try {
    const days = Math.max(0, Number(req.query.older_than_days ?? 0) || 0);
    const out: Record<string, { label: string; count: number; items: Record<string, unknown>[] }> = {};
    for (const [k, c] of Object.entries(CATEGORIES)) {
      const rows = await many<Record<string, unknown>>(c.sql(days) + ' ORDER BY at DESC LIMIT 500', [String(days)]);
      out[k] = { label: c.label, count: rows.length, items: rows.slice(0, 50) };
    }
    res.json({ older_than_days: days, categories: out });
  } catch (e) { next(e); }
});

cleanupRouter.post('/run', async (req, res, next) => {
  try {
    const d = parse(z.object({ categories: z.array(z.enum(Object.keys(CATEGORIES) as [Cat, ...Cat[]])).min(1), older_than_days: z.number().int().min(0).max(3650).default(0), confirm: z.literal('DELETE') }), req.body);
    const done: Record<string, number> = {};
    for (const k of d.categories) {
      const c = CATEGORIES[k];
      const rows = await many<{ id: string; name: string }>(c.sql(d.older_than_days), [String(d.older_than_days)]);
      if (!rows.length) { done[k] = 0; continue; }
      if (c.del === 'PURGE_CLIENTS') { for (const r of rows) await purgeClient(r.id); }
      else await query(c.del, [rows.map((r) => r.id)]);
      done[k] = rows.length;
      await audit(req, { action: 'system.cleanup', entityType: 'cleanup', entityId: null, details: { category: k, count: rows.length, sample: rows.slice(0, 20).map((r) => r.name), older_than_days: d.older_than_days } });
    }
    res.json({ deleted: done });
  } catch (e) { next(e); }
});
