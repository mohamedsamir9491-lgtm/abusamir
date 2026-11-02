import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { notFound } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { getOfficeSettings } from '../office/routes.js';
import { loadLetterhead, wrapWithLetterhead } from '../reports/render.js';
import { htmlToPdf } from '../reports/pdf.js';
import { saveFile, getFile, readFileData } from '../files/storage.js';
import { fmtDate, ENGAGEMENT_TYPE_LABELS, ENTITY_LABELS } from '../reports/format.js';
import { agreedUponProcedures, generalEngagement, ORDINALS, type LetterFields, type LetterSection } from './letterTemplates.js';

/**
 * خطاب الارتباط (Engagement Letter): شاشة يُعبأ منها الخطاب لكل ارتباط ويُطبع على ترويسة المكتب.
 * البنية مطابقة لنموذج المكتب: صفحة غلاف (خطاب ارتباط / اسم المنشأة / الكيان القانوني) ثم التاريخ والمرسل إليه والسجل والتحية والموضوع والتمهيد،
 * ثم أقسام مرقمة (أولًا، ثانيًا، ...) بعناوين وفقرات وبنود، ثم الخاتمة وتوقيع الطرفين. الحقول تُحفظ كـ JSON ليعدلها المكتب لكل عميل.
 */
export const letterRouter = Router({ mergeParams: true });
type P = { id: string };
letterRouter.use(authenticate, requirePermission('clients.view'));

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const SCOPE_BY_TYPE: Record<string, string[]> = {
  management_analysis: ['استلام ميزان المراجعة والقوائم والسجلات المحاسبية وفحص توازنها واتساقها وتصنيف الحسابات.', 'إعداد القوائم المالية المشتقة من ميزان المراجعة (المركز المالي، الدخل، التغيرات في حقوق الملكية، التدفقات النقدية الاسترشادية) وتحليل النسب والفروقات.', 'تحديد الملاحظات المحاسبية والأرصدة غير الطبيعية والحسابات المعلقة والتسويات المقترحة مع أدلتها.', 'إعداد تقرير تحليل مالي إداري موجه للإدارة والمساهمين مع قائمة المستندات الناقصة والاستفسارات.'],
  bookkeeping: ['قيد العمليات المالية وفق المستندات المقدمة من الشركة.', 'إعداد ميزان المراجعة الدوري والتسويات الدورية.', 'إعداد القوائم المالية الدورية غير المدققة.'],
  tax_analysis: ['فحص الإقرارات الزكوية والضريبية ومطابقتها بالدفاتر.', 'تحديد الفروقات والمخاطر وتقديم التوصيات.', 'لا يشمل الارتباط التمثيل أمام الجهات إلا باتفاق مستقل.'],
  assurance_audit: ['تنفيذ ارتباط التأكيد وفق المعايير المعتمدة في المملكة العربية السعودية.', 'إصدار تقرير مستقل وفق نطاق الارتباط.'],
};
const DELIVERABLES = ['وصف موضوع العمل والفترة محل الفحص.', 'بيان الإجراءات التي تم تنفيذها ومصادر البيانات المستخدمة وبصماتها.', 'القوائم المالية المشتقة والنسب والمقارنات.', 'الملاحظات والتسويات المقترحة مرتبة حسب الأهمية مع المبلغ والمصدر والتوصية.', 'بيان المستندات الناقصة والاستفسارات الموجهة للإدارة.', 'بيان أي قيود أو صعوبات واجهت تنفيذ العمل.'];

async function defaults(engagementId: string): Promise<LetterFields> {
  const e = await one<Record<string, string | null>>(`SELECT e.*, c.legal_name_ar AS client_name, c.cr_number, c.contact_name, c.entity_type FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.id = $1`, [engagementId]);
  if (!e) throw notFound('الارتباط غير موجود');
  const periods = await one<{ s: string | null; e: string | null }>('SELECT min(start_date)::text AS s, max(end_date)::text AS e FROM financial_periods WHERE engagement_id = $1', [engagementId]);
  const office = await getOfficeSettings();
  const typeLabel = ENGAGEMENT_TYPE_LABELS[e.engagement_type ?? ''] ?? e.engagement_type ?? '';
  const period = periods?.s ? `${fmtDate(periods.s, false)} إلى ${fmtDate(periods.e ?? periods.s, false)}` : '    /    /        م إلى    /    /        م';
  const entity = e.client_name ?? '';
  const t = e.engagement_type === 'agreed_upon_review' ? agreedUponProcedures({ entity, period }) : generalEngagement({ entity, period, typeLabel, scope: SCOPE_BY_TYPE[e.engagement_type ?? ''] ?? SCOPE_BY_TYPE.management_analysis, deliverables: DELIVERABLES });
  return {
    entity_name: entity, legal_form: ENTITY_LABELS[e.entity_type ?? ''] ?? '', client_attention: `السادة / ${entity}`, client_cr: e.cr_number ?? '', greeting: 'السلام عليكم ورحمة الله وبركاته،،',
    subject: t.subject, intro: t.intro, sections: t.sections, closing: 'وتفضلوا بقبول خالص التحية والتقدير،،',
    party1_label: 'الطرف الأول', party1_name: entity, party1_signatory: e.contact_name ?? '', party2_label: 'الطرف الثاني', party2_name: String(office.name_ar ?? ''), party2_signatory: String(office.signatory_name ?? ''),
    engagement_title: e.title ?? '', engagement_type: typeLabel,
  };
}
const sectionSchema = z.object({ title: z.string().max(200), paragraphs: z.array(z.string().max(3000)).max(20), items: z.array(z.string().max(1000)).max(40), items_style: z.enum(['numbered', 'bullets', 'none']), after: z.array(z.string().max(3000)).max(10).default([]) });
const fieldsSchema = z.object({
  entity_name: z.string().max(300), legal_form: z.string().max(200), client_attention: z.string().max(300), client_cr: z.string().max(50), greeting: z.string().max(200), subject: z.string().max(300), intro: z.array(z.string().max(3000)).max(10),
  sections: z.array(sectionSchema).max(30), closing: z.string().max(500),
  party1_label: z.string().max(100), party1_name: z.string().max(300), party1_signatory: z.string().max(200), party2_label: z.string().max(100), party2_name: z.string().max(300), party2_signatory: z.string().max(200),
  engagement_title: z.string().max(300), engagement_type: z.string().max(100),
});

async function loadLetter(engagementId: string) {
  const l = await one<{ id: string; engagement_id: string; client_id: string; letter_no: string | null; letter_date: string; fields: LetterFields; status: string; pdf_file_id: string | null; updated_at: string }>('SELECT *, letter_date::text AS letter_date FROM engagement_letters WHERE engagement_id = $1', [engagementId]);
  if (l && !Array.isArray((l.fields as unknown as { sections?: unknown }).sections)) l.fields = { ...(await defaults(engagementId)), ...pickKnown(l.fields as unknown as Record<string, unknown>) }; // خطابات محفوظة بالبنية القديمة
  return l;
}
function pickKnown(old: Record<string, unknown>): Partial<LetterFields> { const o: Partial<LetterFields> = {}; if (typeof old.client_cr === 'string') o.client_cr = old.client_cr; if (typeof old.subject === 'string') o.subject = old.subject; return o; }

function letterHtml(l: { letter_no: string | null; letter_date: string; status: string; fields: LetterFields }, lh: Awaited<ReturnType<typeof loadLetterhead>>, forPdf: boolean) {
  const f = l.fields;
  const list = (s: LetterSection) => !s.items.length || s.items_style === 'none' ? '' : s.items_style === 'bullets' ? `<ul>${s.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<ol>${s.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
  const paras = (ps: string[]) => ps.filter((x) => x.trim()).map((x) => `<p>${esc(x)}</p>`).join('');
  const sections = f.sections.map((s, i) => `<div class="sec"><h3>${esc(ORDINALS[i] ?? String(i + 1))}: ${esc(s.title)}</h3>${paras(s.paragraphs)}${list(s)}${paras(s.after ?? [])}</div>`).join('');
  const cover = `<div class="lcover"><div class="lt">خطاب ارتباط</div><div class="ln">اسم المنشأة: ${esc(f.entity_name)}</div><div class="ln">الكيان القانوني: ${esc(f.legal_form)}</div></div><div class="page-break"></div>`;
  const head = `<div class="ldate">التاريخ: ${esc(fmtDate(l.letter_date, true))}</div>
    <div class="laddr"><div><b>${esc(f.client_attention)}</b></div>${f.client_cr ? `<div>السجل التجاري رقم ${esc(f.client_cr)}</div>` : ''}<div>المحترمين</div></div>
    <p>${esc(f.greeting)}</p><p><b>الموضوع: ${esc(f.subject)}</b></p>${paras(f.intro)}`;
  const sig = `<p style="text-align:center;margin-top:5mm">${esc(f.closing)}</p>
    <table class="lsig"><tr><th>${esc(f.party1_label)}</th><th>${esc(f.party2_label)}</th></tr>
    <tr><td>${esc(f.party1_name)}</td><td>${esc(f.party2_name)}</td></tr>
    <tr><td><div class="sigbox"></div>${esc(f.party1_signatory || '')}</td><td><div class="sigbox">${lh.signature_data_url ? `<img src="${lh.signature_data_url}">` : ''}</div>${esc(f.party2_signatory || lh.signatory_name || '')}</td></tr>
    <tr><td>التوقيع: ______________</td><td>التوقيع: ______________${lh.license_number ? `<div class="muted">قيد رقم (${esc(lh.license_number)})</div>` : ''}</td></tr>
    <tr><td>التاريخ: ______________</td><td>التاريخ: ${esc(fmtDate(l.letter_date, false))}${lh.stamp_data_url ? `<div><img src="${lh.stamp_data_url}" style="max-height:30mm;margin-top:2mm"></div>` : ''}</td></tr></table>`;
  const css = `.lcover{text-align:center;padding-top:70mm;page-break-after:always}.lcover .lt{font-size:20pt;font-weight:700;text-decoration:underline;margin-bottom:22mm}.lcover .ln{font-size:13pt;font-weight:700;margin:6mm 0}
    .ldate{font-weight:700;margin-bottom:5mm}.laddr{margin-bottom:4mm;line-height:1.7}.sec{margin-top:3mm}.sec h3{font-size:11.5pt;margin:3mm 0 1.5mm;page-break-after:avoid}ol,ul{padding-right:8mm}li{margin-bottom:1.2mm}
    .lsig{width:100%;margin-top:8mm;border:0;page-break-inside:avoid}.lsig th,.lsig td{border:0;text-align:center;padding:2mm;vertical-align:top;width:50%}.lsig th{font-weight:700;background:none;color:#1b1f24}.sigbox{height:22mm}.sigbox img{max-height:22mm;max-width:50mm}.muted{color:#555;font-size:9pt}`;
  return wrapWithLetterhead(cover + head + sections + sig, lh, { title: f.subject, reference_no: l.letter_no ?? '', client_name: f.entity_name, confidentiality: lh.confidentiality_ar }, { forPdf, watermark: l.status === 'draft' ? 'مسودة' : null, extraCss: css });
}

letterRouter.get('/', async (req, res, next) => {
  try {
    const id = String((req.params as P).id); const l = await loadLetter(id);
    if (l) return res.json({ letter: l, exists: true });
    res.json({ exists: false, letter: { engagement_id: id, letter_no: null, letter_date: new Date().toISOString().slice(0, 10), status: 'draft', fields: await defaults(id), pdf_file_id: null } });
  } catch (e) { next(e); }
});
letterRouter.post('/reset', requirePermission('clients.manage'), async (req, res, next) => {
  try { res.json({ fields: await defaults(String((req.params as P).id)) }); } catch (e) { next(e); }
});
letterRouter.put('/', requirePermission('clients.manage'), async (req, res, next) => {
  try {
    const id = String((req.params as P).id);
    const d = parse(z.object({ letter_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(['draft', 'issued']).default('draft'), fields: fieldsSchema }), req.body);
    const e = await one<{ client_id: string }>('SELECT client_id FROM engagements WHERE id = $1', [id]); if (!e) throw notFound('الارتباط غير موجود');
    const existing = await loadLetter(id);
    const letterNo = existing?.letter_no ?? `ENG-${new Date().getFullYear()}-${String((await one<{ n: string }>(`SELECT nextval('letters_ref_seq') AS n`))!.n).padStart(4, '0')}`;
    await query(`INSERT INTO engagement_letters (engagement_id, client_id, letter_no, letter_date, fields, status, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
      ON CONFLICT (engagement_id) DO UPDATE SET letter_date = EXCLUDED.letter_date, fields = EXCLUDED.fields, status = EXCLUDED.status, updated_by = EXCLUDED.updated_by, updated_at = now()`, [id, e.client_id, letterNo, d.letter_date, JSON.stringify(d.fields), d.status, req.user!.id]);
    await audit(req, { action: existing ? 'engagement_letter.update' : 'engagement_letter.create', entityType: 'engagement', entityId: id, clientId: e.client_id, details: { letter_no: letterNo, status: d.status } });
    res.json({ letter: await loadLetter(id) });
  } catch (e) { next(e); }
});
letterRouter.get('/preview', async (req, res, next) => {
  try {
    const id = String((req.params as P).id); const l = await loadLetter(id);
    const lh = await loadLetterhead(await getOfficeSettings());
    const data = l ?? { letter_no: null, letter_date: new Date().toISOString().slice(0, 10), status: 'draft', fields: await defaults(id) };
    res.type('html').send(letterHtml(data, lh, false));
  } catch (e) { next(e); }
});
letterRouter.post('/pdf', requirePermission('reports.export'), async (req, res, next) => {
  try {
    const id = String((req.params as P).id); const l = await loadLetter(id); if (!l) throw notFound('احفظ الخطاب أولًا');
    const lh = await loadLetterhead(await getOfficeSettings());
    const pdf = await htmlToPdf(letterHtml(l, lh, true), lh);
    const f = await saveFile({ purpose: 'engagement_letter', subdir: 'letters', originalName: `${l.letter_no ?? 'letter'}.pdf`, mime: 'application/pdf', data: pdf, userId: req.user!.id });
    await query('UPDATE engagement_letters SET pdf_file_id = $1, updated_at = now() WHERE id = $2', [f.id, l.id]);
    await audit(req, { action: 'engagement_letter.pdf', entityType: 'engagement', entityId: id, clientId: l.client_id, details: { letter_no: l.letter_no, file_id: f.id } });
    res.json({ file_id: f.id });
  } catch (e) { next(e); }
});
letterRouter.get('/pdf', async (req, res, next) => {
  try {
    const l = await loadLetter(String((req.params as P).id)); if (!l?.pdf_file_id) throw notFound('لم يُولَّد ملف PDF بعد');
    const f = await getFile(l.pdf_file_id);
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.original_name)}`); res.send(readFileData(f));
  } catch (e) { next(e); }
});
