import { Router } from 'express';
import { z } from 'zod';
import { many, one, query, withTransaction } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest, notFound, forbidden } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { loadEngagement, loadPeriod } from '../../middleware/scope.js';
import { collectSnapshot, type Snapshot } from './snapshot.js';
import { buildReportContent, buildSection, type ReportContent, type ReportSectionContent } from './builder.js';
import { renderReportHtml, loadLetterhead } from './render.js';
import { htmlToPdf } from './pdf.js';
import { reportToExcel } from './excel.js';
import { saveFile, getFile, readFileData } from '../files/storage.js';
import { getOfficeSettings } from '../office/routes.js';
import type { TemplateSection } from './templates.js';

export const reportsRouter = Router();
reportsRouter.use(authenticate, requirePermission('clients.view'));

async function loadReport(id: string) {
  const r = await one<Record<string, unknown> & { id: string; client_id: string; engagement_id: string; period_id: string | null; status: string; current_version_no: number; prepared_by: string | null; reviewed_by: string | null; approved_by: string | null }>(
    `SELECT r.*, c.legal_name_ar AS client_name, p.label AS period_label, u1.full_name AS prepared_by_name, u2.full_name AS reviewed_by_name, u3.full_name AS approved_by_name, t.name_ar AS template_name
     FROM generated_reports r JOIN clients c ON c.id = r.client_id LEFT JOIN financial_periods p ON p.id = r.period_id LEFT JOIN users u1 ON u1.id = r.prepared_by LEFT JOIN users u2 ON u2.id = r.reviewed_by LEFT JOIN users u3 ON u3.id = r.approved_by LEFT JOIN report_templates t ON t.id = r.template_id WHERE r.id = $1`, [id]);
  if (!r) throw notFound('التقرير غير موجود');
  return r;
}
async function loadVersion(reportId: string, versionNo?: number) {
  const v = await one<{ id: string; version_no: number; content: ReportContent; snapshot: Snapshot; pdf_file_id: string | null; xlsx_file_id: string | null; created_at: string; change_note: string | null }>(
    versionNo ? 'SELECT * FROM report_versions WHERE report_id = $1 AND version_no = $2' : 'SELECT * FROM report_versions WHERE report_id = $1 ORDER BY version_no DESC LIMIT 1', versionNo ? [reportId, versionNo] : [reportId]);
  if (!v) throw notFound('لا توجد نسخة للتقرير');
  return v;
}
async function nextRef(): Promise<string> {
  const r = await one<{ n: string }>(`SELECT nextval('reports_ref_seq') AS n`);
  const y = new Date().getFullYear();
  return `RPT-${y}-${String(r!.n).padStart(4, '0')}`;
}

reportsRouter.get('/', async (req, res, next) => {
  try {
    const engagementId = typeof req.query.engagement_id === 'string' ? req.query.engagement_id : null;
    const rows = await many(`SELECT r.id, r.reference_no, r.title, r.report_type, r.status, r.language, r.current_version_no, r.created_at, r.updated_at, r.approved_at, r.issued_at, c.legal_name_ar AS client_name, c.is_demo, p.label AS period_label, r.engagement_id, r.period_id, u.full_name AS prepared_by_name
      FROM generated_reports r JOIN clients c ON c.id = r.client_id LEFT JOIN financial_periods p ON p.id = r.period_id LEFT JOIN users u ON u.id = r.prepared_by WHERE ($1::uuid IS NULL OR r.engagement_id = $1) ORDER BY r.updated_at DESC LIMIT 200`, [engagementId]);
    res.json({ reports: rows });
  } catch (e) { next(e); }
});

reportsRouter.post('/', requirePermission('reports.create'), async (req, res, next) => {
  try {
    const d = parse(z.object({ engagement_id: z.string().uuid(), period_id: z.string().uuid(), template_id: z.string().uuid(), title: z.string().min(3).max(300).optional() }), req.body);
    const e = await loadEngagement(d.engagement_id);
    await loadPeriod(d.period_id, d.engagement_id);
    const tpl = await one<{ id: string; name_ar: string; report_type: string; sections: TemplateSection[] }>('SELECT id, name_ar, report_type, sections FROM report_templates WHERE id = $1 AND is_active', [d.template_id]);
    if (!tpl) throw notFound('القالب غير موجود');
    const snapshot = await collectSnapshot(d.engagement_id, d.period_id, req.user!.id);
    const ref = await nextRef();
    const title = d.title ?? tpl.name_ar;
    const content = buildReportContent({ title, referenceNo: ref, sections: tpl.sections, snapshot, status: 'draft', preparer: snapshot.preparer?.full_name ?? null });
    const id = await withTransaction(async (tx) => {
      const r = await one<{ id: string }>(`INSERT INTO generated_reports (client_id, engagement_id, period_id, template_id, report_type, reference_no, title, prepared_by, current_version_no) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1) RETURNING id`, [e.client_id, d.engagement_id, d.period_id, tpl.id, tpl.report_type, ref, title, req.user!.id], tx);
      await query(`INSERT INTO report_versions (report_id, version_no, content, snapshot, change_note, created_by) VALUES ($1,1,$2,$3,'توليد أولي من القالب',$4)`, [r!.id, JSON.stringify(content), JSON.stringify(snapshot), req.user!.id], tx);
      await query(`INSERT INTO approval_history (entity_type, entity_id, from_status, to_status, user_id) VALUES ('report',$1,NULL,'draft',$2)`, [r!.id, req.user!.id], tx);
      return r!.id;
    });
    await audit(req, { action: 'report.created', entityType: 'report', entityId: id, clientId: e.client_id, details: { reference: ref, template: tpl.name_ar, period_id: d.period_id } });
    res.status(201).json({ id, reference_no: ref });
  } catch (e) { next(e); }
});

reportsRouter.get('/:id', async (req, res, next) => {
  try {
    const r = await loadReport(req.params.id as string);
    const v = await loadVersion(r.id);
    const versions = await many(`SELECT v.version_no, v.change_note, v.created_at, v.pdf_file_id, v.xlsx_file_id, u.full_name AS created_by_name FROM report_versions v LEFT JOIN users u ON u.id = v.created_by WHERE v.report_id = $1 ORDER BY v.version_no DESC`, [r.id]);
    const history = await many(`SELECT h.*, u.full_name FROM approval_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.entity_type = 'report' AND h.entity_id = $1 ORDER BY h.created_at`, [r.id]);
    const comments = await many(`SELECT c.*, u.full_name FROM review_comments c JOIN users u ON u.id = c.user_id WHERE c.entity_type = 'report' AND c.entity_id = $1 ORDER BY c.created_at`, [r.id]);
    res.json({ report: r, version: { version_no: v.version_no, content: v.content, created_at: v.created_at, pdf_file_id: v.pdf_file_id, xlsx_file_id: v.xlsx_file_id, snapshot_generated_at: v.snapshot.generated_at }, versions, history, comments });
  } catch (e) { next(e); }
});

const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string().max(20000) }), z.object({ type: z.literal('heading'), text: z.string().max(300) }),
  z.object({ type: z.literal('list'), items: z.array(z.string().max(2000)).max(200), ordered: z.boolean().optional() }), z.object({ type: z.literal('kv'), items: z.array(z.object({ label: z.string().max(200), value: z.string().max(2000) })).max(100) }),
  z.object({ type: z.literal('note'), text: z.string().max(3000), tone: z.enum(['info', 'warning', 'danger']) }), z.object({ type: z.literal('page_break') }),
  z.object({ type: z.literal('table'), caption: z.string().max(300).optional(), columns: z.array(z.object({ key: z.string(), label: z.string(), numeric: z.boolean().optional(), width: z.string().optional() })).max(30), rows: z.array(z.record(z.string(), z.string().nullable())).max(5000), total_rows: z.array(z.record(z.string(), z.string().nullable())).optional(), repeat_header: z.boolean().optional() }),
  z.object({ type: z.literal('findings'), items: z.array(z.record(z.string(), z.union([z.string(), z.null()]))).max(500) }),
]);
const sectionSchema = z.object({ key: z.string().max(60), type: z.string().max(40), title: z.string().min(1).max(300), enabled: z.boolean(), order: z.number().int(), blocks: z.array(blockSchema).max(300), options: z.record(z.string(), z.unknown()).optional() });

/** حفظ نسخة جديدة بعد تعديل المحاسب للمحتوى (أقسام: إضافة/حذف/إخفاء/ترتيب/تعديل نصوص) */
reportsRouter.put('/:id/content', requirePermission('reports.create'), async (req, res, next) => {
  try {
    const d = parse(z.object({ title: z.string().min(3).max(300).optional(), sections: z.array(sectionSchema).min(1).max(60), change_note: z.string().max(500).optional() }), req.body);
    const r = await loadReport(req.params.id as string);
    if (['approved', 'issued'].includes(r.status)) throw badRequest('لا يمكن تعديل تقرير معتمد أو صادر؛ أنشئ نسخة جديدة من التقرير');
    const v = await loadVersion(r.id);
    const content: ReportContent = { ...v.content, meta: { ...v.content.meta, title: d.title ?? v.content.meta.title }, sections: d.sections as unknown as ReportSectionContent[] };
    const newNo = v.version_no + 1;
    await withTransaction(async (tx) => {
      await query(`INSERT INTO report_versions (report_id, version_no, content, snapshot, change_note, created_by) VALUES ($1,$2,$3,$4,$5,$6)`, [r.id, newNo, JSON.stringify(content), JSON.stringify(v.snapshot), d.change_note ?? 'تعديل المحتوى', req.user!.id], tx);
      await query(`UPDATE generated_reports SET current_version_no = $2, title = $3, status = CASE WHEN status = 'reviewed' THEN 'draft' ELSE status END, updated_at = now() WHERE id = $1`, [r.id, newNo, content.meta.title], tx);
      if (r.status === 'reviewed') await query(`INSERT INTO approval_history (entity_type, entity_id, from_status, to_status, user_id, note) VALUES ('report',$1,'reviewed','draft',$2,'أُعيد إلى مسودة بسبب تعديل المحتوى')`, [r.id, req.user!.id], tx);
    });
    await audit(req, { action: 'report.content_updated', entityType: 'report', entityId: r.id, clientId: r.client_id, details: { version: newNo, note: d.change_note } });
    res.json({ version_no: newNo });
  } catch (e) { next(e); }
});

/** إعادة توليد التقرير من أحدث البيانات (لقطة جديدة) مع الحفاظ على الأقسام المعطلة والعناوين المعدلة */
reportsRouter.post('/:id/regenerate', requirePermission('reports.create'), async (req, res, next) => {
  try {
    const r = await loadReport(req.params.id as string);
    if (['approved', 'issued'].includes(r.status)) throw badRequest('لا يمكن إعادة توليد تقرير معتمد أو صادر');
    const v = await loadVersion(r.id);
    const snapshot = await collectSnapshot(r.engagement_id, r.period_id!, r.prepared_by ?? req.user!.id);
    const secs: TemplateSection[] = v.content.sections.map((s) => ({ key: s.key, type: s.type as TemplateSection['type'], title_ar: s.title, title_en: s.title, enabled: s.enabled, order: s.order, options: s.options }));
    const content = buildReportContent({ title: v.content.meta.title, referenceNo: v.content.meta.reference_no, sections: secs, snapshot, status: r.status, preparer: snapshot.preparer?.full_name ?? null });
    // الإبقاء على النصوص الحرة التي عدّلها المحاسب في الأقسام النصية
    for (const s of content.sections) { const old = v.content.sections.find((o) => o.key === s.key); if (old && ['custom_text', 'intro', 'scope', 'disclaimer', 'recommendations', 'summary'].includes(s.type) && old.blocks.some((b) => b.type === 'paragraph' && b.text)) s.blocks = old.blocks; }
    const newNo = v.version_no + 1;
    await withTransaction(async (tx) => {
      await query(`INSERT INTO report_versions (report_id, version_no, content, snapshot, change_note, created_by) VALUES ($1,$2,$3,$4,'إعادة توليد من أحدث البيانات',$5)`, [r.id, newNo, JSON.stringify(content), JSON.stringify(snapshot), req.user!.id], tx);
      await query(`UPDATE generated_reports SET current_version_no = $2, status = 'draft', updated_at = now() WHERE id = $1`, [r.id, newNo], tx);
    });
    await audit(req, { action: 'report.regenerated', entityType: 'report', entityId: r.id, clientId: r.client_id, details: { version: newNo } });
    res.json({ version_no: newNo });
  } catch (e) { next(e); }
});

/** إضافة قسم (نصي أو من نوع بيانات) لتقرير قائم */
reportsRouter.post('/:id/sections', requirePermission('reports.create'), async (req, res, next) => {
  try {
    const d = parse(z.object({ type: z.string().max(40), title: z.string().min(1).max(300), after_key: z.string().optional(), options: z.record(z.string(), z.unknown()).optional() }), req.body);
    const r = await loadReport(req.params.id as string);
    if (['approved', 'issued'].includes(r.status)) throw badRequest('التقرير معتمد');
    const v = await loadVersion(r.id);
    const key = `${d.type}_${Date.now().toString(36)}`;
    const idx = d.after_key ? v.content.sections.findIndex((s) => s.key === d.after_key) : v.content.sections.length - 1;
    const order = idx >= 0 ? (v.content.sections[idx].order + 0.5) : 50;
    const sec = buildSection({ key, type: d.type as TemplateSection['type'], title_ar: d.title, title_en: d.title, enabled: true, order, options: d.options }, v.snapshot, v.content.meta);
    const sections = [...v.content.sections, sec].sort((a, b) => a.order - b.order).map((s, i) => ({ ...s, order: i + 1 }));
    const newNo = v.version_no + 1;
    await withTransaction(async (tx) => {
      await query(`INSERT INTO report_versions (report_id, version_no, content, snapshot, change_note, created_by) VALUES ($1,$2,$3,$4,$5,$6)`, [r.id, newNo, JSON.stringify({ ...v.content, sections }), JSON.stringify(v.snapshot), `إضافة قسم: ${d.title}`, req.user!.id], tx);
      await query(`UPDATE generated_reports SET current_version_no = $2, updated_at = now() WHERE id = $1`, [r.id, newNo], tx);
    });
    res.json({ version_no: newNo, section_key: key });
  } catch (e) { next(e); }
});

/** سير العمل: draft -> reviewed -> approved -> issued (الاعتماد يتطلب صلاحية reports.approve ومستخدمًا مختلفًا عن المُعد) */
reportsRouter.post('/:id/status', async (req, res, next) => {
  try {
    const d = parse(z.object({ status: z.enum(['draft', 'reviewed', 'approved', 'issued']), note: z.string().max(2000).optional() }), req.body);
    const r = await loadReport(req.params.id as string);
    const perms = req.user!.permissions;
    const allowed: Record<string, string[]> = { draft: ['reviewed'], reviewed: ['approved', 'draft'], approved: ['issued', 'draft'], issued: [] };
    if (!allowed[r.status].includes(d.status)) throw badRequest(`لا يمكن الانتقال من ${r.status} إلى ${d.status}`);
    if (d.status === 'reviewed' && !perms.includes('reports.review') && !perms.includes('reports.create')) throw forbidden();
    if (['approved', 'issued'].includes(d.status) && !perms.includes('reports.approve')) throw forbidden('اعتماد التقارير للإصدار يتطلب صلاحية المراجع/المدير');
    if (d.status === 'approved' && r.prepared_by === req.user!.id && req.user!.role_code !== 'admin' && req.user!.role_code !== 'office_manager') throw forbidden('لا يمكن لمُعد التقرير اعتماده بنفسه (فصل المهام)');
    if (d.status === 'draft' && !perms.includes('reports.create') && !perms.includes('reports.approve')) throw forbidden();
    const sets: Record<string, string> = { reviewed: 'reviewed_by = $3, reviewed_at = now()', approved: 'approved_by = $3, approved_at = now()', issued: 'issued_at = now()', draft: 'reviewed_by = NULL, reviewed_at = NULL, approved_by = NULL, approved_at = NULL' };
    await withTransaction(async (tx) => {
      await query(`UPDATE generated_reports SET status = $2, ${sets[d.status]}, updated_at = now() WHERE id = $1`, d.status === 'draft' || d.status === 'issued' ? [r.id, d.status] : [r.id, d.status, req.user!.id], tx);
      await query(`INSERT INTO approval_history (entity_type, entity_id, from_status, to_status, user_id, note) VALUES ('report',$1,$2,$3,$4,$5)`, [r.id, r.status, d.status, req.user!.id, d.note ?? null], tx);
      // تحديث حالة التقرير داخل المحتوى (لإزالة علامة المسودة وتعبئة أسماء المراجع/المعتمد)
      const v = await loadVersion(r.id);
      const names = await one<{ reviewer: string | null; approver: string | null }>(`SELECT (SELECT full_name FROM users WHERE id = r.reviewed_by) AS reviewer, (SELECT full_name FROM users WHERE id = r.approved_by) AS approver FROM generated_reports r WHERE r.id = $1`, [r.id], tx);
      const content: ReportContent = { ...v.content, meta: { ...v.content.meta, status: d.status, reviewer: names?.reviewer ?? null, approver: names?.approver ?? null } };
      for (const s of content.sections) if (s.type === 'signatures') { const kv = s.blocks.find((b) => b.type === 'kv'); if (kv && kv.type === 'kv') { for (const it of kv.items) { if (it.label === 'راجعه') it.value = names?.reviewer ?? '______________'; if (it.label === 'اعتمده') it.value = names?.approver ?? '______________'; } } }
      await query('UPDATE report_versions SET content = $3 WHERE report_id = $1 AND version_no = $2', [r.id, v.version_no, JSON.stringify(content)], tx);
    });
    await audit(req, { action: `report.${d.status}`, entityType: 'report', entityId: r.id, clientId: r.client_id, details: { from: r.status, to: d.status, note: d.note } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

reportsRouter.post('/:id/comments', async (req, res, next) => {
  try {
    const d = parse(z.object({ comment: z.string().min(1).max(5000) }), req.body);
    const r = await loadReport(req.params.id as string);
    const row = await one<{ id: string }>(`INSERT INTO review_comments (entity_type, entity_id, user_id, comment) VALUES ('report',$1,$2,$3) RETURNING id`, [r.id, req.user!.id, d.comment]);
    await audit(req, { action: 'report.commented', entityType: 'report', entityId: r.id, clientId: r.client_id });
    res.status(201).json({ id: row!.id });
  } catch (e) { next(e); }
});

/** معاينة HTML (نفس القالب المستخدم في PDF) */
reportsRouter.get('/:id/preview', async (req, res, next) => {
  try {
    const r = await loadReport(req.params.id as string);
    const v = await loadVersion(r.id, req.query.version ? Number(req.query.version) : undefined);
    const lh = await loadLetterhead(await getOfficeSettings());
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderReportHtml(v.content, lh, { forPdf: req.query.print === '1' }));
  } catch (e) { next(e); }
});

reportsRouter.post('/:id/export/pdf', requirePermission('reports.export'), async (req, res, next) => {
  try {
    const r = await loadReport(req.params.id as string);
    const v = await loadVersion(r.id);
    const lh = await loadLetterhead(await getOfficeSettings());
    const html = renderReportHtml(v.content, lh, { forPdf: true });
    const pdf = await htmlToPdf(html, lh);
    const f = await saveFile({ purpose: 'report_pdf', subdir: `reports/${r.client_id}`, originalName: `${v.content.meta.reference_no}-v${v.version_no}.pdf`, mime: 'application/pdf', data: pdf, userId: req.user!.id });
    await query('UPDATE report_versions SET pdf_file_id = $3 WHERE report_id = $1 AND version_no = $2', [r.id, v.version_no, f.id]);
    await audit(req, { action: 'report.exported_pdf', entityType: 'report', entityId: r.id, clientId: r.client_id, details: { version: v.version_no, file_id: f.id, bytes: pdf.length, status: r.status } });
    res.json({ file_id: f.id, bytes: pdf.length, version_no: v.version_no });
  } catch (e) { next(e); }
});

reportsRouter.post('/:id/export/xlsx', requirePermission('reports.export'), async (req, res, next) => {
  try {
    const r = await loadReport(req.params.id as string);
    const v = await loadVersion(r.id);
    const buf = await reportToExcel(v.content, v.snapshot);
    const f = await saveFile({ purpose: 'report_xlsx', subdir: `reports/${r.client_id}`, originalName: `${v.content.meta.reference_no}-v${v.version_no}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: buf, userId: req.user!.id });
    await query('UPDATE report_versions SET xlsx_file_id = $3 WHERE report_id = $1 AND version_no = $2', [r.id, v.version_no, f.id]);
    await audit(req, { action: 'report.exported_xlsx', entityType: 'report', entityId: r.id, clientId: r.client_id, details: { version: v.version_no, file_id: f.id } });
    res.json({ file_id: f.id, bytes: buf.length, version_no: v.version_no });
  } catch (e) { next(e); }
});

reportsRouter.get('/:id/files/:fileId', async (req, res, next) => {
  try {
    const r = await loadReport(req.params.id as string);
    const ok = await one('SELECT 1 FROM report_versions WHERE report_id = $1 AND (pdf_file_id = $2 OR xlsx_file_id = $2)', [r.id, req.params.fileId]);
    if (!ok) throw notFound('الملف غير مرتبط بالتقرير');
    const f = await getFile(req.params.fileId as string);
    await audit(req, { action: 'report.file_downloaded', entityType: 'report', entityId: r.id, clientId: r.client_id, details: { file_id: f.id } });
    res.setHeader('Content-Type', f.mime_type);
    res.setHeader('Content-Disposition', `${req.query.inline === '1' ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
    res.send(readFileData(f));
  } catch (e) { next(e); }
});
