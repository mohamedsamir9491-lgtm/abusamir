import { one, type Queryable } from '../db/pool.js';
import { notFound, forbidden } from '../lib/errors.js';

/**
 * ضمان عزل بيانات العملاء: كل كيان مرتبط بالارتباط يجب أن ينتمي للعميل نفسه.
 * تُستخدم في كل مسار يتعامل مع engagement/period/document.
 */
export async function loadEngagement(engagementId: string, db?: Queryable) {
  const e = await one<{ id: string; client_id: string; status: string; currency: string; framework: string; engagement_type: string; title: string }>(
    'SELECT id, client_id, status, currency, framework, engagement_type, title FROM engagements WHERE id = $1', [engagementId], db);
  if (!e) throw notFound('الارتباط غير موجود');
  return e;
}

export async function loadPeriod(periodId: string, engagementId: string, db?: Queryable) {
  const p = await one<{ id: string; client_id: string; engagement_id: string; label: string; start_date: string; end_date: string; role: string }>(
    'SELECT id, client_id, engagement_id, label, start_date, end_date, role FROM financial_periods WHERE id = $1', [periodId], db);
  if (!p) throw notFound('الفترة المالية غير موجودة');
  if (p.engagement_id !== engagementId) throw forbidden('الفترة لا تنتمي لهذا الارتباط (منع خلط بيانات العملاء)');
  return p;
}

export async function assertSameClient(a: { client_id: string }, b: { client_id: string }) {
  if (a.client_id !== b.client_id) throw forbidden('العناصر تنتمي لعملاء مختلفين - تم منع العملية حفاظًا على عزل البيانات');
}
