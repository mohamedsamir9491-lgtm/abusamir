/** طلبات المعلومات من العميل: قائمة واحدة للعميل (كل شركات المجموعة)، توليد تلقائي منطقي، متابعة الحالة، ربط المستند، تصدير */
import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { many, one, query, withTransaction } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { notFound } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { buildLocalContext } from '../ai/local.js';
import { runLocalAnalysis } from '../ai/service.js';
import { latestRun } from '../analysis/service.js';
import { groupCompaniesForPeriod, listComponents } from '../engagements/group.js';
import { resolveRoot, loadRegister } from '../valuation/service.js';
import { deriveRequests, type ReqCompany } from './generate.js';
import { getOfficeSettings } from '../office/routes.js';
import { fmtDate } from '../reports/format.js';

export const requestsRouter = Router();
requestsRouter.use(authenticate, requirePermission('clients.view'));

export const STATUS_LABELS: Record<string, string> = { pending: 'لم يُرسل', sent: 'أُرسل للعميل', received: 'وصل', not_available: 'غير متوفر لدى العميل', dismissed: 'مستبعد' };
export const PRIORITY_LABELS: Record<string, string> = { essential: 'أساسي', supporting: 'داعم' };

async function companiesFor(rootId: string, rootPeriodId: string) {
  const comps = await listComponents(rootId);
  if (!comps.length) { const ctx = await buildLocalContext(rootId, rootPeriodId).catch(() => null); return [{ engagement_id: rootId, period_id: rootPeriodId, name: ctx?.company ?? '', role: 'parent' as const }]; }
  return (await groupCompaniesForPeriod(rootId, rootPeriodId)).companies.map((c) => ({ engagement_id: c.engagement_id, period_id: c.period_id, name: c.name, role: c.role }));
}

export async function refreshRequests(rootId: string, rootPeriodId: string, userId: string) {
  const list = await companiesFor(rootId, rootPeriodId);
  const cons = list.length > 1 ? await latestRun(rootPeriodId, 'consolidation') : null;
  const C = (cons?.result ?? null) as Record<string, any> | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  const scope = (C?.worksheet?.scope ?? []) as { key: string; investment_cost: string; receivable: string }[];
  const companies: ReqCompany[] = [];
  for (const c of list) {
    const ctx = c.period_id && c.role !== 'at_cost' ? await buildLocalContext(c.engagement_id, c.period_id).catch(() => null) : null;
    const sc = scope.find((s) => s.key === c.engagement_id);
    companies.push({ engagementId: c.engagement_id, periodId: c.period_id, name: ctx?.company ?? c.name, role: c.role, ctx, investment: sc ? Number(sc.investment_cost) : null, receivable: sc ? Number(sc.receivable) : null });
  }
  const parentCtx = companies.find((c) => c.role === 'parent')?.ctx ?? null;
  const register = await loadRegister(rootId, parentCtx);
  const drafts = deriveRequests({ companies, register, consolidationRegister: (C?.worksheet?.register ?? []) as never, periodEnd: parentCtx ? fmtDate(parentCtx.period.end, false) : '' });
  return withTransaction(async (db) => {
    const existing = await many<{ id: string; engagement_id: string; req_key: string; status: string; source: string }>('SELECT id, engagement_id, req_key, status, source FROM client_requests WHERE root_engagement_id = $1', [rootId], db);
    let next = Number((await one<{ n: string }>('SELECT COALESCE(max(ref_no),0) AS n FROM client_requests WHERE root_engagement_id = $1', [rootId], db))?.n ?? 0);
    const seen = new Set<string>(); let added = 0; let updated = 0; let removed = 0;
    for (const d of drafts) {
      const k = `${d.engagementId}|${d.key}`; seen.add(k); const ex = existing.find((e) => `${e.engagement_id}|${e.req_key}` === k);
      if (ex) { if (ex.status !== 'dismissed') { await query(`UPDATE client_requests SET title=$2, reason=$3, amount=$4, priority=$5, links=$6, category=$7, period_id=$8, obsolete=false, updated_at=now() WHERE id=$1 AND source='auto'`, [ex.id, d.title, d.reason, d.amount, d.priority, JSON.stringify(d.links), d.category, d.periodId], db); updated++; } }
      else { next++; await query(`INSERT INTO client_requests (root_engagement_id, engagement_id, period_id, req_key, ref_no, category, title, reason, amount, links, priority, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [rootId, d.engagementId, d.periodId, d.key, next, d.category, d.title, d.reason, d.amount, JSON.stringify(d.links), d.priority, userId], db); added++; }
    }
    for (const e of existing.filter((x) => x.source === 'auto' && !seen.has(`${x.engagement_id}|${x.req_key}`))) {
      if (e.status === 'pending') { await query('DELETE FROM client_requests WHERE id = $1', [e.id], db); removed++; } else await query('UPDATE client_requests SET obsolete = true, updated_at = now() WHERE id = $1', [e.id], db);
    }
    return { added, updated, removed, total: drafts.length };
  });
}

export async function listRequests(rootId: string, opts: { engagementId?: string; activeOnly?: boolean } = {}) {
  const rows = await many<Record<string, any>>(`SELECT r.*, c.legal_name_ar AS company, e.entity_role, d.title AS document_title, u.full_name AS created_by_name FROM client_requests r JOIN engagements e ON e.id = r.engagement_id JOIN clients c ON c.id = e.client_id LEFT JOIN source_documents d ON d.id = r.document_id AND d.deleted_at IS NULL LEFT JOIN users u ON u.id = r.created_by
    WHERE r.root_engagement_id = $1 ${opts.engagementId ? 'AND r.engagement_id = $2' : ''} ORDER BY CASE WHEN e.id = r.root_engagement_id THEN 0 ELSE 1 END, e.created_at, CASE r.priority WHEN 'essential' THEN 0 ELSE 1 END, r.ref_no`, opts.engagementId ? [rootId, opts.engagementId] : [rootId]); // eslint-disable-line @typescript-eslint/no-explicit-any
  return opts.activeOnly ? rows.filter((r) => !r.obsolete && ['pending', 'sent', 'not_available'].includes(r.status)) : rows;
}
const ref = (n: number) => `R-${String(n).padStart(3, '0')}`;

requestsRouter.get('/', async (req, res, next) => {
  try {
    const q = parse(z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid() }), req.query);
    const { rootId, rootPeriodId } = await resolveRoot(q.engagement_id, q.period_id);
    const companies = await companiesFor(rootId, rootPeriodId);
    const rows = (await listRequests(rootId)).map((r) => ({ ...r, ref: ref(r.ref_no) }) as Record<string, any>); // eslint-disable-line @typescript-eslint/no-explicit-any
    const stats = { total: rows.filter((r) => r.status !== 'dismissed' && !r.obsolete).length, essential_open: rows.filter((r) => r.priority === 'essential' && ['pending', 'sent'].includes(r.status) && !r.obsolete).length, received: rows.filter((r) => r.status === 'received').length };
    res.json({ root_engagement_id: rootId, root_period_id: rootPeriodId, companies, requests: rows, stats });
  } catch (e) { next(e); }
});

requestsRouter.post('/refresh', requirePermission('analysis.run'), async (req, res, next) => {
  try {
    const d = parse(z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid(), reanalyze: z.boolean().optional() }), req.body);
    const { rootId, rootPeriodId } = await resolveRoot(d.engagement_id, d.period_id);
    let analyzed = 0;
    if (d.reanalyze) for (const c of await companiesFor(rootId, rootPeriodId)) if (c.period_id && c.role !== 'at_cost') { try { await runLocalAnalysis(c.engagement_id, c.period_id, req.user!.id); analyzed++; } catch { /* شركة بلا ميزان */ } }
    const r = await refreshRequests(rootId, rootPeriodId, req.user!.id);
    await audit(req, { action: 'requests.refreshed', entityType: 'engagement', entityId: rootId, details: { ...r, analyzed } });
    res.json({ ...r, analyzed });
  } catch (e) { next(e); }
});

requestsRouter.post('/', requirePermission('findings.edit'), async (req, res, next) => {
  try {
    const d = parse(z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid(), title: z.string().min(3).max(500), reason: z.string().max(1000).optional().nullable(), priority: z.enum(['essential', 'supporting']).default('essential'), category: z.enum(['document', 'explanation', 'confirmation']).default('document') }), req.body);
    const { rootId } = await resolveRoot(d.engagement_id, d.period_id);
    const n = Number((await one<{ n: string }>('SELECT COALESCE(max(ref_no),0) AS n FROM client_requests WHERE root_engagement_id = $1', [rootId]))?.n ?? 0) + 1;
    const r = await one<{ id: string }>(`INSERT INTO client_requests (root_engagement_id, engagement_id, period_id, req_key, ref_no, category, title, reason, priority, source, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',$10) RETURNING id`, [rootId, d.engagement_id, d.period_id, `manual:${Date.now()}`, n, d.category, d.title, d.reason ?? null, d.priority, req.user!.id]);
    await audit(req, { action: 'request.created', entityType: 'client_request', entityId: r!.id, details: { title: d.title } });
    res.status(201).json({ id: r!.id });
  } catch (e) { next(e); }
});

requestsRouter.patch('/bulk/status', requirePermission('findings.edit'), async (req, res, next) => {
  try {
    const d = parse(z.object({ ids: z.array(z.string().uuid()).min(1).max(500), status: z.enum(['pending', 'sent', 'received', 'not_available', 'dismissed']) }), req.body);
    await query(`UPDATE client_requests SET status = $2, sent_at = CASE WHEN $2 = 'sent' THEN COALESCE(sent_at, now()) ELSE sent_at END, received_at = CASE WHEN $2 = 'received' THEN COALESCE(received_at, now()) ELSE received_at END, updated_at = now() WHERE id = ANY($1)`, [d.ids, d.status]);
    await audit(req, { action: 'requests.status', entityType: 'client_request', details: { count: d.ids.length, status: d.status } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

requestsRouter.patch('/:id', requirePermission('findings.edit'), async (req, res, next) => {
  try {
    const d = parse(z.object({ status: z.enum(['pending', 'sent', 'received', 'not_available', 'dismissed']).optional(), title: z.string().min(3).max(500).optional(), reason: z.string().max(1000).nullable().optional(), priority: z.enum(['essential', 'supporting']).optional(), response_note: z.string().max(2000).nullable().optional(), document_id: z.string().uuid().nullable().optional() }), req.body);
    const cur = await one<{ id: string; status: string }>('SELECT id, status FROM client_requests WHERE id = $1', [req.params.id]);
    if (!cur) throw notFound('الطلب غير موجود');
    const status = d.status ?? (d.document_id ? 'received' : undefined);
    const sets: string[] = []; const vals: unknown[] = [req.params.id];
    const put = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
    if (status) { put('status', status); if (status === 'sent') sets.push('sent_at = COALESCE(sent_at, now())'); if (status === 'received') sets.push('received_at = COALESCE(received_at, now())'); }
    if (d.title !== undefined) put('title', d.title); if (d.reason !== undefined) put('reason', d.reason); if (d.priority !== undefined) put('priority', d.priority);
    if (d.response_note !== undefined) put('response_note', d.response_note); if (d.document_id !== undefined) put('document_id', d.document_id);
    if (d.title !== undefined || d.reason !== undefined) sets.push(`source = 'manual'`); // تعديل يدوي لا يُستبدل عند التحديث
    if (sets.length) await query(`UPDATE client_requests SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals);
    await audit(req, { action: 'request.updated', entityType: 'client_request', entityId: cur.id, details: d });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

requestsRouter.delete('/:id', requirePermission('findings.edit'), async (req, res, next) => {
  try {
    const cur = await one<{ id: string; source: string }>('SELECT id, source FROM client_requests WHERE id = $1', [req.params.id]);
    if (!cur) throw notFound('الطلب غير موجود');
    // التلقائي يُستبعد (لا يعود عند التحديث)، واليدوي يُحذف
    if (cur.source === 'auto') await query(`UPDATE client_requests SET status = 'dismissed', updated_at = now() WHERE id = $1`, [cur.id]); else await query('DELETE FROM client_requests WHERE id = $1', [cur.id]);
    await audit(req, { action: 'request.deleted', entityType: 'client_request', entityId: cur.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

async function exportRows(q: { engagement_id: string; period_id: string; scope?: string }) {
  const { rootId } = await resolveRoot(q.engagement_id, q.period_id);
  const rows = (await listRequests(rootId, { activeOnly: q.scope !== 'all' })).filter((r) => r.status !== 'dismissed');
  const root = await one<{ client_name: string }>('SELECT c.legal_name_ar AS client_name FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.id = $1', [rootId]);
  return { rows, client: root?.client_name ?? '' };
}

requestsRouter.get('/export.xlsx', requirePermission('reports.export'), async (req, res, next) => {
  try {
    const q = parse(z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid(), scope: z.string().optional() }), req.query);
    const { rows, client } = await exportRows(q);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('طلبات العميل', { views: [{ rightToLeft: true }] });
    ws.columns = [{ header: 'المرجع', key: 'ref', width: 9 }, { header: 'الشركة', key: 'company', width: 26 }, { header: 'الأولوية', key: 'priority', width: 10 }, { header: 'المطلوب', key: 'title', width: 60 }, { header: 'السبب', key: 'reason', width: 60 }, { header: 'المبلغ المرتبط', key: 'amount', width: 16 }, { header: 'الحالة', key: 'status', width: 16 }, { header: 'رد العميل / ملاحظة', key: 'note', width: 36 }];
    ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF4' } };
    for (const r of rows) { const row = ws.addRow({ ref: ref(r.ref_no), company: r.company, priority: PRIORITY_LABELS[r.priority], title: r.title, reason: r.reason ?? '', amount: r.amount == null ? null : Number(r.amount), status: STATUS_LABELS[r.status] ?? r.status, note: r.response_note ?? '' }); row.alignment = { wrapText: true, vertical: 'top' }; }
    ws.getColumn('amount').numFmt = '#,##0.00;(#,##0.00);"-"';
    await audit(req, { action: 'requests.exported', entityType: 'engagement', entityId: q.engagement_id, details: { format: 'xlsx', count: rows.length } });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`طلبات ${client}.xlsx`)}`);
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  } catch (e) { next(e); }
});

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
requestsRouter.get('/print', requirePermission('reports.export'), async (req, res, next) => {
  try {
    const q = parse(z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid(), scope: z.string().optional() }), req.query);
    const { rows, client } = await exportRows(q); const office = await getOfficeSettings() as Record<string, string | null>;
    const byCo = new Map<string, typeof rows>(); for (const r of rows) byCo.set(r.company, [...(byCo.get(r.company) ?? []), r]);
    const money = (v: unknown) => v == null ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const body = [...byCo.entries()].map(([co, rs]) => `<h2>${esc(co)}</h2><table><thead><tr><th style="width:7%">المرجع</th><th style="width:9%">الأولوية</th><th>المطلوب</th><th style="width:34%">السبب</th><th style="width:12%">المبلغ</th></tr></thead><tbody>${rs.map((r) => `<tr><td>${ref(r.ref_no)}</td><td>${PRIORITY_LABELS[r.priority]}</td><td>${esc(r.title)}</td><td class="m">${esc(r.reason)}</td><td class="n">${money(r.amount)}</td></tr>`).join('')}</tbody></table>`).join('');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>طلبات ${esc(client)}</title><style>body{font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif;margin:24px;color:#111;font-size:12.5px}h1{font-size:18px;margin:0}h2{font-size:14px;margin:18px 0 6px;color:#1d3a8a}table{width:100%;border-collapse:collapse}th,td{border:1px solid #c8ced8;padding:6px 8px;vertical-align:top;text-align:right}th{background:#eef2f8}td.n{text-align:left;direction:ltr;white-space:nowrap}td.m{color:#444}.hd{display:flex;justify-content:space-between;border-bottom:2px solid #1d3a8a;padding-bottom:8px;margin-bottom:10px}@media print{button{display:none}}</style></head><body><div class="hd"><div><h1>قائمة المعلومات والمستندات المطلوبة</h1><div>${esc(client)}</div></div><div style="text-align:left">${esc(office.name_ar ?? office.office_name_ar ?? '')}<br>${new Date().toISOString().slice(0, 10)}</div></div><p>نرجو تزويدنا بالمستندات والإيضاحات التالية لاستكمال التحليل والتقييم؛ البنود «الأساسية» يتوقف عليها احتساب أرقام في التقرير.</p>${body || '<p>لا توجد طلبات مفتوحة.</p>'}<button onclick="print()" style="margin-top:16px">طباعة / حفظ PDF</button></body></html>`);
  } catch (e) { next(e); }
});
