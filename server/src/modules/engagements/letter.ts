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
import { fmtDate, ENGAGEMENT_TYPE_LABELS } from '../reports/format.js';

/**
 * خطاب الارتباط (Engagement Letter): شاشة يُعبأ منها الخطاب لكل ارتباط ويُطبع على ترويسة المكتب.
 * الحقول تُحفظ كـ JSON ليتمكن المكتب من تعديل الصياغة لكل عميل؛ القيم الافتراضية تُشتق من بيانات العميل والارتباط وإعدادات المكتب.
 */
export const letterRouter = Router({ mergeParams: true });
type P = { id: string };
letterRouter.use(authenticate, requirePermission('clients.view'));

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const SCOPE_BY_TYPE: Record<string, string[]> = {
  management_analysis: ['استلام ميزان المراجعة والقوائم والسجلات المحاسبية وفحص توازنها واتساقها', 'إعداد القوائم المالية المشتقة من ميزان المراجعة وتحليل النسب والفروقات', 'تحديد الملاحظات المحاسبية والتسويات المقترحة مع أدلتها', 'إعداد تقرير تحليل مالي إداري موجه للإدارة والمساهمين'],
  agreed_upon_review: ['تنفيذ الإجراءات المتفق عليها الموضحة في الملحق والإبلاغ عن النتائج الفعلية', 'لا يُبدى رأي تأكيد ولا يُقدَّم ضمان'],
  bookkeeping: ['قيد العمليات المالية وفق المستندات المقدمة', 'إعداد ميزان المراجعة الشهري والتسويات الدورية', 'إعداد القوائم المالية الدورية غير المدققة'],
  tax_analysis: ['فحص الإقرارات الزكوية والضريبية ومطابقتها بالدفاتر', 'تحديد الفروقات والمخاطر وتقديم التوصيات', 'لا يشمل التمثيل أمام الجهات إلا باتفاق مستقل'],
  assurance_audit: ['تنفيذ ارتباط التأكيد وفق المعايير المعتمدة في المملكة العربية السعودية', 'إصدار تقرير مستقل وفق نطاق الارتباط'],
};
async function defaults(engagementId: string) {
  const e = await one<Record<string, string | null>>(`SELECT e.*, c.legal_name_ar AS client_name, c.legal_name_en AS client_name_en, c.cr_number, c.address AS client_address, c.contact_name, NULL::text AS contact_title, c.entity_type FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.id = $1`, [engagementId]);
  if (!e) throw notFound('الارتباط غير موجود');
  const periods = await one<{ s: string | null; e: string | null }>('SELECT min(start_date)::text AS s, max(end_date)::text AS e FROM financial_periods WHERE engagement_id = $1', [engagementId]);
  const office = await getOfficeSettings();
  const typeLabel = ENGAGEMENT_TYPE_LABELS[e.engagement_type ?? ''] ?? e.engagement_type ?? '';
  const period = periods?.s ? `من ${fmtDate(periods.s, false)} إلى ${fmtDate(periods.e ?? periods.s, false)}` : 'الفترة المالية المحددة في الارتباط';
  return {
    client_name: e.client_name ?? '', client_attention: e.contact_name ? `السيد/ ${e.contact_name}${e.contact_title ? ` - ${e.contact_title}` : ''}` : 'السادة/ الإدارة والمساهمين',
    client_address: e.client_address ?? '', client_cr: e.cr_number ?? '',
    subject: `خطاب ارتباط: ${typeLabel} - ${e.title ?? ''}`,
    intro: `تحية طيبة وبعد، يسرنا تأكيد قبولنا تقديم خدمات ${typeLabel} لشركتكم للفترة ${period}، ويوضح هذا الخطاب نطاق الخدمات ومسؤوليات الطرفين والأتعاب وشروط الارتباط.`,
    period, scope: SCOPE_BY_TYPE[e.engagement_type ?? ''] ?? SCOPE_BY_TYPE.management_analysis,
    deliverables: ['تقرير مكتوب باللغة العربية على ترويسة المكتب بصيغة PDF مع ملف Excel داعم', 'قائمة بالملاحظات والتسويات المقترحة والمستندات الناقصة', 'عرض النتائج للإدارة في اجتماع ختامي'],
    management_resp: ['تقديم السجلات والمستندات كاملة وصحيحة في مواعيدها، وتظل الإدارة مسؤولة عن صحتها واكتمالها', 'إتاحة الوصول إلى الموظفين والمعلومات اللازمة والرد على الاستفسارات', 'اتخاذ القرارات بشأن التسويات المقترحة وتنفيذها في السجلات', 'إبلاغ المكتب بأي أحداث لاحقة أو معلومات مؤثرة'],
    office_resp: ['تنفيذ العمل بعناية مهنية واستقلالية وفق نطاق هذا الخطاب', 'ربط كل نتيجة بمصدرها والتمييز بين الحقائق والافتراضات والبيانات الناقصة', 'المحافظة على سرية المعلومات وعدم إفشائها لغير المخولين', 'عدم إبداء رأي تأكيد أو مراجعة مستقلة ما لم ينص الارتباط على ذلك صراحة'],
    limitations: 'لا يُعد هذا الارتباط مراجعة أو تدقيقًا وفق معايير المراجعة، ولا يهدف إلى اكتشاف الغش أو الأخطاء كافة. تعتمد النتائج على البيانات التي تقدمها الإدارة ولا تمثل قيمة عادلة ولا رأيًا نظاميًا ما لم يُذكر صراحة.',
    fees: 'الأتعاب: ______ ريال سعودي (غير شاملة ضريبة القيمة المضافة)، تُسدد: 50% عند التوقيع و50% عند تسليم التقرير.',
    timeline: 'المدة المتوقعة لإنجاز العمل: ______ يوم عمل من تاريخ استلام كامل المستندات.',
    confidentiality: 'يلتزم الطرفان بسرية المعلومات والمستندات المتبادلة، ولا تُستخدم إلا لأغراض هذا الارتباط، ويحتفظ المكتب بأوراق العمل وفق متطلبات المهنة.',
    termination: 'يجوز لأي من الطرفين إنهاء الارتباط بإشعار كتابي قبل 15 يومًا، مع سداد أتعاب العمل المنجز حتى تاريخ الإنهاء. يخضع هذا الخطاب لأنظمة المملكة العربية السعودية.',
    closing: 'نرجو التكرم بالتوقيع على نسخة من هذا الخطاب تأكيدًا لموافقتكم على شروطه، ونتطلع إلى التعاون معكم.',
    office_signatory: office.signatory_name ?? '', office_signatory_title: office.signatory_title ?? '', client_signatory: e.contact_name ?? '', client_signatory_title: e.contact_title ?? '',
    engagement_title: e.title ?? '', engagement_type: typeLabel,
  };
}
type Fields = Awaited<ReturnType<typeof defaults>>;
const fieldsSchema = z.object({
  client_name: z.string().max(300), client_attention: z.string().max(300), client_address: z.string().max(500), client_cr: z.string().max(50), subject: z.string().max(300), intro: z.string().max(3000), period: z.string().max(300),
  scope: z.array(z.string().max(500)).max(30), deliverables: z.array(z.string().max(500)).max(30), management_resp: z.array(z.string().max(500)).max(30), office_resp: z.array(z.string().max(500)).max(30),
  limitations: z.string().max(3000), fees: z.string().max(2000), timeline: z.string().max(1000), confidentiality: z.string().max(2000), termination: z.string().max(2000), closing: z.string().max(1000),
  office_signatory: z.string().max(200), office_signatory_title: z.string().max(200), client_signatory: z.string().max(200), client_signatory_title: z.string().max(200), engagement_title: z.string().max(300), engagement_type: z.string().max(100),
});

async function loadLetter(engagementId: string) {
  return one<{ id: string; engagement_id: string; client_id: string; letter_no: string | null; letter_date: string; fields: Fields; status: string; pdf_file_id: string | null; updated_at: string }>('SELECT *, letter_date::text AS letter_date FROM engagement_letters WHERE engagement_id = $1', [engagementId]);
}
function letterHtml(l: { letter_no: string | null; letter_date: string; status: string; fields: Fields }, lh: Awaited<ReturnType<typeof loadLetterhead>>, forPdf: boolean) {
  const f = l.fields; const li = (items: string[]) => `<ol>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
  const body = `<div style="display:flex;justify-content:space-between;margin:2mm 0 6mm"><div>الرقم: <b>${esc(l.letter_no ?? '—')}</b></div><div>التاريخ: <b>${esc(fmtDate(l.letter_date, true))}</b></div></div>
    <div style="margin-bottom:4mm"><div><b>${esc(f.client_attention)}</b></div><div><b>${esc(f.client_name)}</b>${f.client_cr ? ` - س.ت ${esc(f.client_cr)}` : ''}</div>${f.client_address ? `<div>${esc(f.client_address)}</div>` : ''}<div>المحترمين</div></div>
    <div style="margin-bottom:4mm"><b>الموضوع: ${esc(f.subject)}</b></div>
    <p>${esc(f.intro)}</p>
    <h3>أولًا: نطاق الخدمات</h3>${li(f.scope)}
    <h3>ثانيًا: المخرجات</h3>${li(f.deliverables)}
    <h3>ثالثًا: مسؤوليات الإدارة</h3>${li(f.management_resp)}
    <h3>رابعًا: مسؤوليات المكتب</h3>${li(f.office_resp)}
    <h3>خامسًا: حدود الارتباط</h3><p>${esc(f.limitations)}</p>
    <h3>سادسًا: الأتعاب والسداد</h3><p>${esc(f.fees)}</p><p>${esc(f.timeline)}</p>
    <h3>سابعًا: السرية</h3><p>${esc(f.confidentiality)}</p>
    <h3>ثامنًا: مدة الارتباط وإنهاؤه والنظام الواجب التطبيق</h3><p>${esc(f.termination)}</p>
    <p>${esc(f.closing)}</p>
    <div class="signatures" style="margin-top:12mm"><div class="box">${lh.signature_data_url ? `<img src="${lh.signature_data_url}">` : '<div style="height:22mm"></div>'}<div><b>عن المكتب</b></div><div>${esc(f.office_signatory || lh.signatory_name || lh.name_ar)}</div><div style="font-size:9pt;color:#555">${esc(f.office_signatory_title || lh.signatory_title || '')}</div>${lh.stamp_data_url ? `<img src="${lh.stamp_data_url}" style="margin-top:2mm">` : ''}</div>
    <div class="box"><div style="height:22mm"></div><div><b>موافقة العميل</b></div><div>${esc(f.client_signatory || '________________')}</div><div style="font-size:9pt;color:#555">${esc(f.client_signatory_title || '')}</div><div style="font-size:9pt;color:#555;margin-top:2mm">التوقيع والختم والتاريخ</div></div></div>`;
  return wrapWithLetterhead(body, lh, { title: f.subject, reference_no: l.letter_no ?? '', client_name: f.client_name, confidentiality: lh.confidentiality_ar }, { forPdf, watermark: l.status === 'draft' ? 'مسودة' : null, extraCss: 'h3{margin:5mm 0 1.5mm}ol{padding-right:7mm}' });
}

letterRouter.get('/', async (req, res, next) => {
  try {
    const id = String((req.params as P).id); const l = await loadLetter(id);
    if (l) return res.json({ letter: l, exists: true });
    res.json({ exists: false, letter: { engagement_id: id, letter_no: null, letter_date: new Date().toISOString().slice(0, 10), status: 'draft', fields: await defaults(id), pdf_file_id: null } });
  } catch (e) { next(e); }
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
