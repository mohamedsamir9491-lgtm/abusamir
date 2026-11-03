import { Router } from 'express';
import { formatFeeAmount, currencyInfo } from '../../lib/amountWords.js';
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
import { listComponents } from './group.js';
import { LETTER_TEMPLATES, templateFor, ORDINALS, DEFAULT_OPTIONS, defaultValuation, BASIS_LABELS, valuationTermsRows, type LetterFields, type LetterSection, type LetterOptions, type ValuationTerms } from './letterTemplates.js';

/**
 * خطاب الارتباط (Engagement Letter): شاشة يُعبأ منها الخطاب لكل ارتباط ويُطبع على ترويسة المكتب.
 * البنية مطابقة لنموذج المكتب: صفحة غلاف (خطاب ارتباط / اسم المنشأة / الكيان القانوني) ثم التاريخ والمرسل إليه والسجل والتحية والموضوع والتمهيد،
 * ثم أقسام مرقمة (أولًا، ثانيًا، ...) بعناوين وفقرات وبنود، ثم الخاتمة وتوقيع الطرفين. الحقول تُحفظ كـ JSON ليعدلها المكتب لكل عميل.
 */
export const letterRouter = Router({ mergeParams: true });
type P = { id: string };
letterRouter.use(authenticate, requirePermission('clients.view'));

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
async function defaults(engagementId: string, templateCode?: string | null, subjectDetail?: string | null): Promise<LetterFields> {
  const e = await one<Record<string, string | null>>(`SELECT e.*, c.legal_name_ar AS client_name, c.cr_number, c.contact_name, c.contact_phone, c.contact_email, c.entity_type FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.id = $1`, [engagementId]);
  if (!e) throw notFound('الارتباط غير موجود');
  // فترة الخطاب = الفترة الحالية للارتباط (لا تُدمج معها الفترة السابقة المخصصة للمقارنة)
  const periods = await one<{ s: string | null; e: string | null }>(`SELECT start_date::text AS s, end_date::text AS e FROM financial_periods WHERE engagement_id = $1 ORDER BY (role = 'current') DESC, end_date DESC LIMIT 1`, [engagementId]);
  const office = await getOfficeSettings();
  const typeLabel = ENGAGEMENT_TYPE_LABELS[e.engagement_type ?? ''] ?? e.engagement_type ?? '';
  const period = periods?.s ? `${fmtDate(periods.s, false)} إلى ${fmtDate(periods.e ?? periods.s, false)}` : '    /    /        م إلى    /    /        م';
  const entity = e.client_name ?? '';
  const tpl = templateFor(templateCode, e.engagement_type);
  const t = tpl.build({ entity, period, office: String(office.name_ar ?? ''), subject_detail: subjectDetail ?? undefined });
  const endDate = periods?.e ?? null;
  return {
    template_code: tpl.code, template_name: tpl.name,
    options: { ...DEFAULT_OPTIONS, fee_currency: String(e.currency ?? 'SAR'), include_valuation: tpl.code === 'VALUATION' || tpl.code === 'GROUP_VALUATION' },
    valuation: { ...defaultValuation({ entity, period, valuation_date: endDate ?? '' }), ...(tpl.code === 'GROUP_VALUATION' ? { basis: 'book' as const, approaches: ['asset' as const], subject: `100% من حقوق ملكية ${entity} على أساس موحد` } : {}) },
    entity_name: entity, legal_form: ENTITY_LABELS[e.entity_type ?? ''] ?? '', client_attention: `السادة / ${entity}`, client_cr: e.cr_number ?? '', greeting: 'السلام عليكم ورحمة الله وبركاته،،',
    subject: t.subject, intro: t.intro,
    summary_service: t.summary_service, summary_period: period, summary_deliverables: t.summary_deliverables, fees_amount: '', vat_note: '', duration: t.duration,
    office_contact: [office.signatory_name, office.phone, office.email].filter(Boolean).join(' - '), client_contact: [e.contact_name, e.contact_phone, e.contact_email].filter(Boolean).join(' - '),
    fees_schedule: t.fees_schedule, sections: t.sections, closing: 'وتفضلوا بقبول خالص التحية والتقدير،،',
    party1_label: 'الطرف الأول (العميل)', party1_name: entity, party1_signatory: e.contact_name ?? '', party2_label: 'الطرف الثاني (المكتب)', party2_name: String(office.name_ar ?? ''), party2_signatory: String(office.signatory_name ?? ''),
    engagement_title: e.title ?? '', engagement_type: typeLabel,
  };
}
const sectionSchema = z.object({ title: z.string().max(200), paragraphs: z.array(z.string().max(3000)).max(20), items: z.array(z.string().max(1000)).max(40), items_style: z.enum(['numbered', 'bullets', 'none']), after: z.array(z.string().max(3000)).max(10).default([]) });
const optionsSchema = z.object({ show_cover: z.boolean(), show_letter_no: z.boolean(), show_hijri: z.boolean(), show_summary: z.boolean(), show_contacts: z.boolean(), show_duration: z.boolean(), vat_mode: z.enum(['exclusive', 'inclusive', 'hidden']), vat_rate: z.string().max(10), show_fee_schedule: z.boolean(), fee_currency: z.string().max(3).default('SAR'), show_fee_words: z.boolean().default(true), show_client_signature: z.boolean(), show_office_signature: z.boolean(), show_stamp: z.boolean(), include_valuation: z.boolean() }).partial();
const valuationSchema = z.object({ purpose: z.string().max(500), subject: z.string().max(300), basis: z.enum(['book', 'adjusted_nav', 'fair_value', 'market_value', 'investment_value']), valuation_date: z.string().max(20), premise: z.enum(['going_concern', 'orderly_liquidation', 'forced_liquidation']), approaches: z.array(z.enum(['asset', 'income', 'market'])).max(3), currency: z.string().max(40), shares_count: z.string().max(40), intended_users: z.string().max(300), standard: z.string().max(300), licensed_valuer: z.enum(['required', 'not_required', 'to_confirm']), discounts: z.string().max(1000), key_assumptions: z.array(z.string().max(500)).max(20), limitations: z.array(z.string().max(500)).max(20) }).partial();
const fieldsSchema = z.object({
  template_code: z.string().max(40).default(''), template_name: z.string().max(200).default(''), options: optionsSchema.optional(), valuation: valuationSchema.optional(),
  summary_service: z.string().max(500).default(''), summary_period: z.string().max(200).default(''), summary_deliverables: z.string().max(500).default(''), fees_amount: z.string().max(100).default(''), vat_note: z.string().max(200).default(''), duration: z.string().max(300).default(''), office_contact: z.string().max(300).default(''), client_contact: z.string().max(300).default(''),
  fees_schedule: z.array(z.object({ stage: z.string().max(200), pct: z.string().max(40), due: z.string().max(200) })).max(12).default([]),
  entity_name: z.string().max(300), legal_form: z.string().max(200), client_attention: z.string().max(300), client_cr: z.string().max(50), greeting: z.string().max(200), subject: z.string().max(300), intro: z.array(z.string().max(3000)).max(10),
  sections: z.array(sectionSchema).max(30), closing: z.string().max(500),
  party1_label: z.string().max(100), party1_name: z.string().max(300), party1_signatory: z.string().max(200), party2_label: z.string().max(100), party2_name: z.string().max(300), party2_signatory: z.string().max(200),
  engagement_title: z.string().max(300), engagement_type: z.string().max(100),
});

async function loadLetter(engagementId: string) {
  const l = await one<{ id: string; engagement_id: string; client_id: string; letter_no: string | null; letter_date: string; fields: LetterFields; status: string; pdf_file_id: string | null; updated_at: string }>('SELECT *, letter_date::text AS letter_date FROM engagement_letters WHERE engagement_id = $1', [engagementId]);
  if (l && (!Array.isArray((l.fields as unknown as { sections?: unknown }).sections) || !(l.fields as unknown as { template_code?: string }).template_code)) l.fields = { ...(await defaults(engagementId)), ...pickKnown(l.fields as unknown as Record<string, unknown>) }; // خطابات محفوظة بالبنية القديمة
  if (l) { // تنقية الخطابات المحفوظة بصياغة قديمة: لا تُذكر مدينة بعينها
    const fix = (t: string) => t.replace('خارج مدينة الرياض', 'خارج مدينة مقر المكتب').replace('المختصة في مدينة الرياض', 'المختصة في المملكة العربية السعودية').replace('الأتعاب المبينة في ملخص الارتباط وجدول السداد أدناه، وهي غير شاملة ضريبة القيمة المضافة (15%) التي تُضاف على الفاتورة.', 'الأتعاب المبينة في ملخص الارتباط وجدول السداد أدناه.');
    const legacyVat = (l.fields.vat_note ?? '').trim();
    l.fields = { ...l.fields, options: { ...DEFAULT_OPTIONS, ...(l.fields.options ?? {}), ...(l.fields.options ? {} : legacyVat === '' && !l.fields.options ? {} : {}) }, valuation: { ...defaultValuation({ entity: l.fields.entity_name, period: l.fields.summary_period }), ...(l.fields.valuation ?? {}) }, intro: (l.fields.intro ?? []).map(fix), sections: (l.fields.sections ?? []).map((sec) => ({ ...sec, paragraphs: sec.paragraphs.map(fix), items: sec.items.map(fix), after: (sec.after ?? []).map(fix) })) };
  }
  return l;
}
function pickKnown(old: Record<string, unknown>): Partial<LetterFields> { const o: Partial<LetterFields> = {}; if (typeof old.client_cr === 'string') o.client_cr = old.client_cr; if (typeof old.subject === 'string') o.subject = old.subject; return o; }

/** نص الضريبة بحسب اختيار المستخدم */
function vatText(o: LetterOptions): string { return o.vat_mode === 'hidden' ? '' : o.vat_mode === 'inclusive' ? `شاملة ضريبة القيمة المضافة (${o.vat_rate}%)` : `غير شاملة ضريبة القيمة المضافة (${o.vat_rate}%) التي تُضاف على الفاتورة`; }
/** شركات المجموعة المشمولة بخطاب ارتباط المجموعة (من بيانات الارتباط، لا تُحفظ في الخطاب لتبقى محدثة) */
type LetterEntity = { name: string; cr_number: string | null; role: 'parent' | 'subsidiary' | 'at_cost'; ownership_pct: string | null };
async function letterEntities(engagementId: string): Promise<LetterEntity[]> {
  const comps = await listComponents(engagementId); if (!comps.length) return [];
  const p = await one<{ legal_name_ar: string; cr_number: string | null }>('SELECT c.legal_name_ar, c.cr_number FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.id = $1', [engagementId]);
  return [{ name: p?.legal_name_ar ?? '', cr_number: p?.cr_number ?? null, role: 'parent', ownership_pct: null }, ...comps.map((c) => ({ name: c.client_name, cr_number: c.cr_number, role: c.entity_role, ownership_pct: c.ownership_pct }))];
}
function letterHtml(l: { letter_no: string | null; letter_date: string; status: string; fields: LetterFields }, lh: Awaited<ReturnType<typeof loadLetterhead>>, forPdf: boolean, entities: LetterEntity[] = []) {
  const f = l.fields; const o: LetterOptions = { ...DEFAULT_OPTIONS, ...(f.options ?? {}) }; const issued = l.status === 'issued'; // التوقيع والختم يظهران على النسخة الصادرة فقط
  const vat = vatText(o);
  const list = (s: LetterSection) => !s.items.length || s.items_style === 'none' ? '' : s.items_style === 'bullets' ? `<ul>${s.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<ol>${s.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
  const paras = (ps: string[]) => ps.filter((x) => x.trim()).map((x) => `<p>${esc(x)}</p>`).join('');
  const feeTable = o.show_fee_schedule && f.fees_schedule?.length ? `<table class="ltab"><thead><tr><th>مرحلة السداد</th><th>النسبة</th><th>موعد الاستحقاق</th></tr></thead><tbody>${f.fees_schedule.map((r) => `<tr><td>${esc(r.stage)}</td><td>${esc(r.pct)}</td><td>${esc(r.due)}</td></tr>`).join('')}</tbody></table>` : '';
  const fee = formatFeeAmount(f.fees_amount, o.fee_currency, o.show_fee_words);
  const amount = `<b>${esc(fee.text || `______ ${currencyInfo(o.fee_currency).name}`)}</b>${fee.words ? ` (${esc(fee.words)})` : ''}${vat ? ` ${esc(vat)}` : ''}`;
  const feeLine = `<p>مبلغ الأتعاب: ${amount}.</p>`;
  const v: ValuationTerms | null = o.include_valuation ? { ...defaultValuation({ entity: f.entity_name, period: f.summary_period }), ...(f.valuation ?? {}) } : null;
  const valTable = v ? `<table class="ltab lsum"><tbody>${valuationTermsRows(v).map(([k, val]) => `<tr><th>${esc(k)}</th><td>${esc(val)}</td></tr>`).join('')}</tbody></table>${v.key_assumptions?.length ? `<p><b>الافتراضات الرئيسية:</b></p><ul>${v.key_assumptions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${v.limitations?.length ? `<p><b>قيود التقييم:</b></p><ul>${v.limitations.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}<p class="muted">يُعد تقرير التقييم على أساس هذه الشروط حصرًا، وأي تغيير في الغرض أو أساس القيمة أو تاريخ التقييم يتطلب تعديلًا كتابيًا لهذا الخطاب.</p>` : '';
  const valSection = v ? { title: 'شروط التقييم المتفق عليها', html: valTable } : null;
  const blocks: { title: string; html: string }[] = f.sections.map((s) => ({ title: s.title, html: `${/الأتعاب/.test(s.title) ? feeLine : ''}${paras(s.paragraphs)}${list(s)}${/الأتعاب/.test(s.title) ? feeTable : ''}${paras(s.after ?? [])}` }));
  if (valSection) { const at = Math.max(0, blocks.findIndex((b) => /نطاق/.test(b.title))); blocks.splice(at + 1, 0, valSection); } // بعد "نطاق العمل" مباشرة
  if (entities.length) {
    const RL: Record<string, string> = { parent: 'الشركة الأم', subsidiary: 'شركة تابعة', at_cost: 'استثمار (بلا قوائم مقدمة)' };
    const SC: Record<string, string> = { parent: 'قوائم منفصلة + القوائم الموحدة للمجموعة', subsidiary: 'قوائم منفصلة + إدخالها في التوحيد', at_cost: 'إدراج بالتكلفة لدى الأم إلى حين تقديم قوائمها' };
    const pct = (v: string | null) => v ? `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 8 })}%` : '—';
    const html = `<p>يشمل هذا الارتباط الشركات التالية، ويُعد لكل منها تحليل وتقييم منفصل على أساس ميزان مراجعتها، إضافة إلى التوحيد الدفتري للمجموعة، وتُعرض النتائج في تقرير واحد ما لم يُتفق كتابيًا على غير ذلك:</p><table class="ltab"><thead><tr><th>م</th><th>الشركة</th><th>السجل التجاري</th><th>العلاقة</th><th>نسبة الملكية</th><th>نطاق العمل</th></tr></thead><tbody>${entities.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.name)}</td><td>${esc(e.cr_number ?? '—')}</td><td>${esc(RL[e.role] ?? e.role)}</td><td>${e.role === 'parent' ? '—' : pct(e.ownership_pct)}</td><td>${esc(SC[e.role] ?? '')}</td></tr>`).join('')}</tbody></table>`;
    const at = blocks.findIndex((b) => /نطاق/.test(b.title));
    blocks.splice(at >= 0 ? at + 1 : 0, 0, { title: 'الشركات المشمولة بالارتباط', html });
  }
  const sections = blocks.map((b, i) => `<div class="sec"><h3>${esc(ORDINALS[i] ?? String(i + 1))}: ${esc(b.title)}</h3>${b.html}</div>`).join('');
  const rows: string[] = [`<tr><th>الخدمة</th><td>${esc(f.summary_service)}</td></tr>`, `<tr><th>الفترة / تاريخ العمل</th><td>${esc(f.summary_period)}</td></tr>`, `<tr><th>المخرجات</th><td>${esc(f.summary_deliverables)}</td></tr>`, `<tr><th>مبلغ الأتعاب</th><td>${amount}</td></tr>`];
  if (entities.length) rows.splice(1, 0, `<tr><th>الشركات المشمولة</th><td>${entities.map((e) => esc(e.name)).join('، ')}</td></tr>`);
  if (v) rows.splice(1, 0, `<tr><th>أساس القيمة وتاريخ التقييم</th><td>${esc(BASIS_LABELS[v.basis])} - ${esc(v.valuation_date ? fmtDate(v.valuation_date, false) : 'يُحدد كتابيًا')}</td></tr>`);
  if (o.show_duration) rows.push(`<tr><th>المدة المتوقعة</th><td>${esc(f.duration)}</td></tr>`);
  if (o.show_contacts) rows.push(`<tr><th>جهة الاتصال - المكتب</th><td>${esc(f.office_contact)}</td></tr>`, `<tr><th>جهة الاتصال - العميل</th><td>${esc(f.client_contact || '______')}</td></tr>`);
  const summary = o.show_summary ? `<div class="sec"><h3>ملخص الارتباط</h3><table class="ltab lsum"><tbody>${rows.join('')}</tbody></table></div>` : '';
  const cover = o.show_cover ? `<div class="lcover"><div class="lt">خطاب ارتباط</div><div class="ls">${esc(f.template_name)}</div><div class="ln">اسم المنشأة: ${esc(f.entity_name)}</div><div class="ln">الكيان القانوني: ${esc(f.legal_form)}</div><div class="ln">الفترة: ${esc(f.summary_period)}</div>${o.show_letter_no ? `<div class="lr">${esc(l.letter_no ?? '')} | ${esc(fmtDate(l.letter_date, false))}</div>` : ''}</div>` : '';
  const head = `<div class="ldate">${o.show_letter_no && l.letter_no ? `الرقم: ${esc(l.letter_no)} &nbsp;|&nbsp; ` : ''}التاريخ: ${esc(fmtDate(l.letter_date, o.show_hijri))}</div>
    <div class="laddr"><div><b>${esc(f.client_attention)}</b></div>${f.client_cr ? `<div>السجل التجاري رقم ${esc(f.client_cr)}</div>` : ''}<div>المحترمين</div></div>
    <p>${esc(f.greeting)}</p><p><b>الموضوع: ${esc(f.subject)}</b></p>${paras(f.intro)}${summary}`;
  const sigImg = issued && o.show_office_signature && lh.signature_data_url ? `<img src="${lh.signature_data_url}" alt="">` : '';
  const stampImg = issued && o.show_stamp && lh.stamp_data_url ? `<img class="stamp" src="${lh.stamp_data_url}" alt="">` : '';
  const office = `<td class="pn">${esc(f.party2_name)}</td>`; const client = `<td class="pn">${esc(f.party1_name)}</td>`;
  const sigRows = o.show_client_signature
    ? `<tr><th>${esc(f.party1_label)}</th><th>${esc(f.party2_label)}</th></tr><tr>${client}${office}</tr>
      <tr><td>${esc(f.party1_signatory || '')}</td><td>${esc(f.party2_signatory || lh.signatory_name || '')}${lh.license_number ? ` <span class="muted">(قيد رقم ${esc(lh.license_number)})</span>` : ''}</td></tr>
      <tr><td><div class="sl"><span>التوقيع:</span><span class="si"></span></div></td><td><div class="sl"><span>التوقيع:</span><span class="si">${sigImg}</span></div></td></tr>
      <tr><td><div class="sl"><span>التاريخ:</span><span class="si dt"></span></div></td><td><div class="sl"><span>التاريخ:</span><span class="si dt">${esc(fmtDate(l.letter_date, false))}</span></div></td></tr>
      <tr><td></td><td>${stampImg}</td></tr>`
    : `<tr><th></th><th>${esc(f.party2_label)}</th></tr><tr><td></td>${office}</tr><tr><td></td><td>${esc(f.party2_signatory || lh.signatory_name || '')}</td></tr>
      <tr><td></td><td><div class="sl"><span>التوقيع:</span><span class="si">${sigImg}</span></div></td></tr><tr><td></td><td><div class="sl"><span>التاريخ:</span><span class="si dt">${esc(fmtDate(l.letter_date, false))}</span></div></td></tr><tr><td></td><td>${stampImg}</td></tr>`;
  const sig = `<p style="text-align:center;margin:4mm 0 3mm">${esc(f.closing)}</p><table class="lsig">${sigRows}</table>`;
  const css = `.lcover{text-align:center;padding-top:60mm;page-break-after:always;break-after:page}.lcover .lt{font-size:20pt;font-weight:700;text-decoration:underline;margin-bottom:22mm}.lcover .ln{font-size:13pt;font-weight:700;margin:5mm 0}.lcover .ls{font-size:12pt;color:#1f3a5f;margin:-16mm 0 18mm}.lcover .lr{font-size:10pt;color:#555;margin-top:14mm}
    .ltab{width:100%;border-collapse:collapse;margin:2mm 0 3mm;font-size:10pt}.ltab th,.ltab td{border:1px solid #c9d1dc;padding:1.5mm 2.5mm;text-align:right;vertical-align:top}.ltab thead th{background:#1f3a5f;color:#fff}.lsum th{width:32%;background:#f1f4f8;font-weight:700}
    .ldate{font-weight:700;margin-bottom:5mm}.laddr{margin-bottom:4mm;line-height:1.7}.sec{margin-top:3mm}.sec h3{font-size:11.5pt;margin:3mm 0 1.5mm;page-break-after:avoid}ol,ul{padding-right:8mm}li{margin-bottom:1.2mm}
    .lsig{width:100%;margin-top:4mm;border:0;page-break-inside:avoid}.lsig th,.lsig td{border:0;text-align:center;padding:1mm 2mm;vertical-align:top;width:50%}.lsig th{font-weight:700;background:none;color:#1b1f24;padding-bottom:2mm}.lsig td.pn{font-weight:700}
    .sl{display:flex;align-items:flex-end;justify-content:center;gap:2.5mm}.sl>span:first-child{padding-bottom:1mm;white-space:nowrap}.si{display:inline-block;width:46mm;height:14mm;border-bottom:1px solid #555;text-align:center;position:relative}.si img{max-height:17mm;max-width:44mm;position:absolute;bottom:-2mm;left:50%;transform:translateX(-50%)}.si.dt{height:auto;padding-bottom:1mm}
    .stamp{max-height:28mm;max-width:40mm;margin-top:1mm}.muted{color:#555;font-size:9pt}`;
  return wrapWithLetterhead(cover + head + sections + sig, lh, { title: f.subject, reference_no: o.show_letter_no ? (l.letter_no ?? '') : '', client_name: f.entity_name, confidentiality: lh.confidentiality_ar }, { forPdf, watermark: l.status === 'draft' ? 'مسودة' : null, extraCss: css });
}

letterRouter.get('/', async (req, res, next) => {
  try {
    const id = String((req.params as P).id); const l = await loadLetter(id);
    if (l) return res.json({ letter: l, exists: true });
    res.json({ exists: false, letter: { engagement_id: id, letter_no: null, letter_date: new Date().toISOString().slice(0, 10), status: 'draft', fields: await defaults(id), pdf_file_id: null } });
  } catch (e) { next(e); }
});
letterRouter.get('/templates', async (_req, res) => { res.json({ templates: LETTER_TEMPLATES.map((t) => ({ code: t.code, name: t.name, description: t.description, standard: t.standard, default_for: t.default_for })) }); });
letterRouter.post('/reset', requirePermission('clients.manage'), async (req, res, next) => {
  try {
    const d = parse(z.object({ template_code: z.string().max(40).nullable().optional(), subject_detail: z.string().max(300).nullable().optional() }), req.body ?? {});
    res.json({ fields: await defaults(String((req.params as P).id), d.template_code, d.subject_detail) });
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
letterRouter.delete('/', requirePermission('data.delete'), async (req, res, next) => {
  try {
    const id = String((req.params as P).id); const l = await loadLetter(id); if (!l) throw notFound('لا يوجد خطاب');
    await query('DELETE FROM engagement_letters WHERE id = $1', [l.id]);
    await audit(req, { action: 'engagement_letter.deleted', entityType: 'engagement', entityId: id, clientId: l.client_id, details: { letter_no: l.letter_no } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
/** معاينة فورية لحقول لم تُحفظ بعد (لا تُخزن شيئًا) */
letterRouter.post('/preview', async (req, res, next) => {
  try {
    const id = String((req.params as P).id);
    const d = parse(z.object({ letter_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(['draft', 'issued']).default('draft'), fields: fieldsSchema }), req.body);
    const l = await loadLetter(id); const lh = await loadLetterhead(await getOfficeSettings());
    res.type('html').send(letterHtml({ letter_no: l?.letter_no ?? null, letter_date: d.letter_date, status: d.status, fields: d.fields as unknown as LetterFields }, lh, false, await letterEntities(id)));
  } catch (e) { next(e); }
});
letterRouter.get('/preview', async (req, res, next) => {
  try {
    const id = String((req.params as P).id); const l = await loadLetter(id);
    const lh = await loadLetterhead(await getOfficeSettings());
    const data = l ?? { letter_no: null, letter_date: new Date().toISOString().slice(0, 10), status: 'draft', fields: await defaults(id) };
    res.type('html').send(letterHtml(data, lh, false, await letterEntities(id)));
  } catch (e) { next(e); }
});
letterRouter.post('/pdf', requirePermission('reports.export'), async (req, res, next) => {
  try {
    const id = String((req.params as P).id); const l = await loadLetter(id); if (!l) throw notFound('احفظ الخطاب أولًا');
    const lh = await loadLetterhead(await getOfficeSettings());
    const pdf = await htmlToPdf(letterHtml(l, lh, true, await letterEntities(id)), lh);
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
