import { Router } from 'express';
import { invalidateLetterheadCache, detectLetterheadBounds, letterheadDesign, designErrors, loadLetterhead, wrapWithLetterhead } from '../reports/render.js';
import { htmlToPdf } from '../reports/pdf.js';
import { z } from 'zod';
import { one, many, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { upload } from '../../middleware/upload.js';
import { badRequest } from '../../lib/errors.js';
import { checkUpload, saveFile, getFile, readFileData } from '../files/storage.js';

export const officeRouter = Router();
officeRouter.use(authenticate);

export async function getOfficeSettings() {
  return (await one('SELECT * FROM office_settings WHERE id = 1'))!;
}

officeRouter.get('/', async (_req, res, next) => {
  try { res.json({ settings: await getOfficeSettings() }); } catch (e) { next(e); }
});

const settingsSchema = z.object({
  name_ar: z.string().max(300).optional(),
  name_en: z.string().max(300).optional(),
  cr_number: z.string().max(100).nullable().optional(),
  license_number: z.string().max(100).nullable().optional(),
  license_authority: z.string().max(200).nullable().optional(),
  address_ar: z.string().max(500).nullable().optional(),
  address_en: z.string().max(500).nullable().optional(),
  phone: z.string().max(100).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  website: z.string().max(200).nullable().optional(),
  vat_number: z.string().max(50).nullable().optional(),
  signatory_name: z.string().max(200).nullable().optional(),
  signatory_title: z.string().max(200).nullable().optional(),
  use_signature: z.boolean().optional(),
  use_stamp: z.boolean().optional(),
  footer_ar: z.string().max(2000).nullable().optional(),
  footer_en: z.string().max(2000).nullable().optional(),
  disclaimer_ar: z.string().max(5000).nullable().optional(),
  disclaimer_en: z.string().max(5000).nullable().optional(),
  confidentiality_ar: z.string().max(300).optional(),
  confidentiality_en: z.string().max(300).optional(),
  letterhead_mode: z.enum(['generated', 'design']).optional(),
  letterhead_template_ar: z.string().max(20000).nullable().optional(),
  letterhead_template_en: z.string().max(20000).nullable().optional(),
  page_margin_top_mm: z.number().min(5).max(60).optional(),
  page_margin_bottom_mm: z.number().min(5).max(60).optional(),
  page_margin_left_mm: z.number().min(5).max(60).optional(),
  page_margin_right_mm: z.number().min(5).max(60).optional(),
  header_height_mm: z.number().min(0).max(80).optional(),
  footer_height_mm: z.number().min(0).max(60).optional(),
  page_numbering: z.enum(['page_of_total', 'page_only', 'none']).optional(),
  default_font: z.enum(['Noto Naskh Arabic', 'Cairo']).optional(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

officeRouter.put('/', requirePermission('office.manage'), async (req, res, next) => {
  try {
    const d = parse(settingsSchema, req.body);
    const keys = Object.keys(d) as (keyof typeof d)[];
    if (keys.length === 0) throw badRequest('لا توجد حقول للتحديث');
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await query(`UPDATE office_settings SET ${sets}, updated_by = $1, updated_at = now() WHERE id = 1`,
      [req.user!.id, ...keys.map((k) => d[k])]);
    await audit(req, { action: 'office.settings_updated', entityType: 'office_settings', entityId: 1, details: { fields: keys } });
    res.json({ settings: await getOfficeSettings() });
  } catch (e) { next(e); }
});

const BRAND_FIELDS: Record<string, string> = { logo: 'logo_file_id', signature: 'signature_file_id', stamp: 'stamp_file_id', letterhead: 'letterhead_file_id' };

officeRouter.post('/branding/:kind', requirePermission('office.manage'), upload.single('file'), async (req, res, next) => {
  try {
    const kind = req.params.kind as string;
    const col = BRAND_FIELDS[kind];
    if (!col) throw badRequest('نوع غير معروف');
    if (!req.file) throw badRequest('لم يُرفع أي ملف');
    checkUpload(kind === 'letterhead' ? 'letterhead' : 'image', req.file.originalname, req.file.mimetype);
    const f = await saveFile({ purpose: kind, subdir: 'branding', originalName: req.file.originalname, mime: req.file.mimetype, data: req.file.buffer, userId: req.user!.id });
    await query(`UPDATE office_settings SET ${col} = $1, updated_by = $2, updated_at = now() WHERE id = 1`, [f.id, req.user!.id]);
    if (kind === 'signature') await query('UPDATE office_settings SET use_signature = TRUE WHERE id = 1'); // رفع التوقيع يفعّل استخدامه تلقائيًا
    if (kind === 'stamp') await query('UPDATE office_settings SET use_stamp = TRUE WHERE id = 1');
    if (kind === 'letterhead') { // تصميم مرفوع: يُفعَّل وضع التصميم تلقائيًا وتُحجز مساحة كافية للرأس والتذييل
      const b = await detectLetterheadBounds(f.id);
      await query(`UPDATE office_settings SET letterhead_mode = 'design', letterhead_top_mm = $1, letterhead_bottom_mm = $2, page_margin_top_mm = LEAST(page_margin_top_mm, 8), page_margin_bottom_mm = LEAST(page_margin_bottom_mm, 8) WHERE id = 1`, [b?.top_mm ?? null, b?.bottom_mm ?? null]);
      invalidateLetterheadCache();
    }
    await audit(req, { action: `office.${kind}_uploaded`, entityType: 'stored_file', entityId: f.id });
    res.json({ file_id: f.id, settings: await getOfficeSettings() });
  } catch (e) { next(e); }
});

officeRouter.delete('/branding/:kind', requirePermission('office.manage'), async (req, res, next) => {
  try {
    const col = BRAND_FIELDS[req.params.kind as string];
    if (!col) throw badRequest('نوع غير معروف');
    await query(`UPDATE office_settings SET ${col} = NULL, updated_by = $1, updated_at = now() WHERE id = 1`, [req.user!.id]);
    if (req.params.kind === 'letterhead') { await query(`UPDATE office_settings SET letterhead_mode = 'generated', letterhead_top_mm = NULL, letterhead_bottom_mm = NULL WHERE id = 1`); invalidateLetterheadCache(); }
    await audit(req, { action: `office.${req.params.kind}_removed` });
    res.json({ settings: await getOfficeSettings() });
  } catch (e) { next(e); }
});

/** تشخيص الترويسة من داخل البرنامج: الإصدار، الترحيلات، وضع الترويسة، الملف، بايثون، نتيجة استخراج التصميم */
officeRouter.get('/letterhead-diagnostics', requirePermission('office.manage'), async (_req, res, next) => {
  try {
    const fs = await import('node:fs'); const { execFileSync } = await import('node:child_process');
    const s = await getOfficeSettings();
    const migrations = (await many<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name')).map((m) => m.name);
    const file = s.letterhead_file_id ? await one<{ mime_type: string; size_bytes: string; original_name: string }>('SELECT mime_type, size_bytes, original_name FROM stored_files WHERE id = $1', [s.letterhead_file_id]) : null;
    let python = 'غير متاح'; try { python = execFileSync('python3', ['-c', 'import PIL, pypdfium2, sys; print("ok", sys.version.split()[0])'], { timeout: 20000 }).toString().trim(); } catch (e) { python = 'فشل: ' + String((e as Error).message).slice(0, 200); }
    let build = 'dev'; try { if (fs.existsSync('/app/BUILD_TIME')) build = fs.readFileSync('/app/BUILD_TIME', 'utf8').trim(); } catch { /* ignore */ }
    invalidateLetterheadCache();
    const design = s.letterhead_file_id ? await letterheadDesign(String(s.letterhead_file_id)) : null;
    res.json({ build, migrations, letterhead_mode: s.letterhead_mode, file, python, design: design ? { ok: true, top_mm: design.top_mm, bottom_mm: design.bottom_mm, top_kb: Math.round(design.top_png.length * 0.75 / 1024), bottom_kb: Math.round(design.bottom_png.length * 0.75 / 1024) } : { ok: false, error: s.letterhead_file_id ? (designErrors.get(String(s.letterhead_file_id)) ?? 'لم يُستخرج التصميم (راجع سجل الحاوية)') : 'لا توجد ترويسة مرفوعة' } });
  } catch (e) { next(e); }
});
/** صفحة اختبار PDF على الترويسة الحالية (للتحقق البصري من داخل البرنامج) */
officeRouter.get('/letterhead-test.pdf', requirePermission('office.manage'), async (_req, res, next) => {
  try {
    const lh = await loadLetterhead(await getOfficeSettings());
    const body = `<h2>صفحة اختبار الترويسة</h2><p>الوضع: ${lh.letterhead_mode === 'design' ? 'التصميم المرفوع' : 'ترويسة مولّدة'} | استُخرج التصميم: ${lh.design ? 'نعم' : 'لا'} | الهوامش: أعلى ${lh.page_margin_top_mm} مم، أسفل ${lh.page_margin_bottom_mm} مم</p>${Array.from({ length: 60 }, (_, i) => `<p>سطر اختبار رقم ${i + 1}: يجب أن يبقى هذا النص داخل المساحة البيضاء وألا يغطي شريطي الرأس والتذييل على أي صفحة.</p>`).join('')}`;
    const html = wrapWithLetterhead(body, lh, { title: 'اختبار الترويسة', reference_no: 'TEST', client_name: lh.name_ar, confidentiality: lh.confidentiality_ar }, { forPdf: true, watermark: 'اختبار' });
    const pdf = await htmlToPdf(html, lh);
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'inline; filename="letterhead-test.pdf"'); res.send(pdf);
  } catch (e) { next(e); }
});

/** خدمة ملفات الهوية (الشعار/التوقيع/الختم) للمستخدمين المسجلين */
officeRouter.get('/branding/:kind', async (req, res, next) => {
  try {
    const col = BRAND_FIELDS[req.params.kind as string];
    if (!col) throw badRequest('نوع غير معروف');
    const s = await getOfficeSettings();
    const id = s[col] as string | null;
    if (!id) { res.status(404).end(); return; }
    const f = await getFile(id);
    res.setHeader('Content-Type', f.mime_type);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(readFileData(f));
  } catch (e) { next(e); }
});
