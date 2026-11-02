import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { SECTION_TYPE_LABELS } from './templates.js';

export const templatesRouter = Router();
templatesRouter.use(authenticate, requirePermission('clients.view'));

const sectionSchema = z.object({ key: z.string().min(1).max(60), type: z.string().min(1).max(40), title_ar: z.string().min(1).max(300), title_en: z.string().max(300).default(''), enabled: z.boolean().default(true), order: z.number().int(), options: z.record(z.string(), z.unknown()).optional() });

templatesRouter.get('/', async (_req, res, next) => {
  try { res.json({ templates: await many('SELECT * FROM report_templates WHERE is_active ORDER BY is_system DESC, name_ar'), section_types: SECTION_TYPE_LABELS }); } catch (e) { next(e); }
});

templatesRouter.post('/', requirePermission('templates.manage'), async (req, res, next) => {
  try {
    const d = parse(z.object({ code: z.string().regex(/^[A-Z0-9_]{3,40}$/), report_type: z.string().min(2).max(60), name_ar: z.string().min(2).max(200), name_en: z.string().max(200).default(''), description: z.string().max(1000).optional(), sections: z.array(sectionSchema).min(1), clone_from: z.string().uuid().optional() }), req.body);
    if (await one('SELECT 1 FROM report_templates WHERE code = $1', [d.code])) throw badRequest('رمز القالب مستخدم');
    const row = await one<{ id: string }>(`INSERT INTO report_templates (code, report_type, name_ar, name_en, description, sections, is_system, created_by) VALUES ($1,$2,$3,$4,$5,$6,FALSE,$7) RETURNING id`, [d.code, d.report_type, d.name_ar, d.name_en, d.description ?? null, JSON.stringify(d.sections), req.user!.id]);
    await audit(req, { action: 'template.created', entityType: 'report_template', entityId: row!.id, details: { code: d.code } });
    res.status(201).json({ id: row!.id });
  } catch (e) { next(e); }
});

templatesRouter.delete('/:id', requirePermission('templates.manage'), async (req, res, next) => {
  try {
    const t = await one<{ id: string; code: string; is_system: boolean }>('SELECT id, code, is_system FROM report_templates WHERE id = $1', [req.params.id]);
    if (!t) throw notFound('القالب غير موجود');
    if (t.is_system) throw badRequest('قوالب النظام لا تُحذف؛ يمكن تعطيلها');
    await query('DELETE FROM report_templates WHERE id = $1', [t.id]);
    await audit(req, { action: 'template.deleted', entityType: 'report_template', entityId: t.id, details: { code: t.code } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

templatesRouter.put('/:id', requirePermission('templates.manage'), async (req, res, next) => {
  try {
    const d = parse(z.object({ name_ar: z.string().min(2).max(200).optional(), name_en: z.string().max(200).optional(), description: z.string().max(1000).nullable().optional(), sections: z.array(sectionSchema).min(1).optional(), is_active: z.boolean().optional() }), req.body);
    const t = await one<{ id: string; is_system: boolean }>('SELECT id, is_system FROM report_templates WHERE id = $1', [req.params.id]);
    if (!t) throw notFound('القالب غير موجود');
    if (t.is_system && d.is_active === false) throw badRequest('لا يمكن تعطيل قالب نظامي؛ يمكن نسخه وتعديله');
    const sets: string[] = []; const vals: unknown[] = [t.id];
    for (const [k, v] of Object.entries(d)) { sets.push(`${k} = $${vals.length + 1}`); vals.push(k === 'sections' ? JSON.stringify(v) : v); }
    if (!sets.length) throw badRequest('لا توجد حقول');
    await query(`UPDATE report_templates SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, vals);
    await audit(req, { action: 'template.updated', entityType: 'report_template', entityId: t.id, details: { fields: Object.keys(d) } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
