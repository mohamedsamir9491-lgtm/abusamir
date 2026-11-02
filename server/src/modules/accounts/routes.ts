import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { FS_LINES } from '../../engine/fsLines.js';
import { classifyAccount, SUB_TYPE_LABELS, TYPE_LABELS } from '../../engine/classification.js';

export const accountsRouter = Router();
accountsRouter.use(authenticate, requirePermission('clients.view'));

accountsRouter.get('/fs-lines', (_req, res) => res.json({ lines: FS_LINES, sub_types: SUB_TYPE_LABELS, types: TYPE_LABELS }));

accountsRouter.get('/', async (req, res, next) => {
  try {
    const clientId = typeof req.query.client_id === 'string' ? req.query.client_id : null;
    if (!clientId) throw badRequest('client_id مطلوب');
    const rows = await many(`SELECT a.*, l.label_ar AS fs_line_label FROM chart_of_accounts a LEFT JOIN fs_line_items l ON l.code = a.fs_line_code WHERE a.client_id = $1 ORDER BY a.code`, [clientId]);
    res.json({ accounts: rows });
  } catch (e) { next(e); }
});

const acctSchema = z.object({
  code: z.string().min(1).max(50), name_ar: z.string().min(1).max(300), name_en: z.string().max(300).nullable().optional(),
  account_type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense', 'other']), sub_type: z.string().max(50).nullable().optional(),
  normal_balance: z.enum(['debit', 'credit']), parent_code: z.string().max(50).nullable().optional(), fs_line_code: z.string().max(50).nullable().optional(),
  is_suspense: z.boolean().default(false), is_bank: z.boolean().default(false), is_active: z.boolean().default(true),
});

accountsRouter.post('/', requirePermission('imports.run'), async (req, res, next) => {
  try {
    const d = parse(acctSchema.extend({ client_id: z.string().uuid() }), req.body);
    if (d.fs_line_code && !(await one('SELECT 1 FROM fs_line_items WHERE code = $1', [d.fs_line_code]))) throw badRequest('بند القوائم غير معروف');
    const row = await one<{ id: string }>(`INSERT INTO chart_of_accounts (client_id, code, name_ar, name_en, account_type, sub_type, normal_balance, parent_code, fs_line_code, is_suspense, is_bank, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (client_id, code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, account_type = EXCLUDED.account_type, sub_type = EXCLUDED.sub_type,
      normal_balance = EXCLUDED.normal_balance, parent_code = EXCLUDED.parent_code, fs_line_code = EXCLUDED.fs_line_code, is_suspense = EXCLUDED.is_suspense, is_bank = EXCLUDED.is_bank, is_active = EXCLUDED.is_active, updated_at = now() RETURNING id`,
      [d.client_id, d.code, d.name_ar, d.name_en ?? null, d.account_type, d.sub_type ?? null, d.normal_balance, d.parent_code ?? null, d.fs_line_code ?? null, d.is_suspense, d.is_bank, d.is_active]);
    await audit(req, { action: 'account.upserted', entityType: 'chart_of_accounts', entityId: row!.id, clientId: d.client_id, details: { code: d.code, fs_line_code: d.fs_line_code } });
    res.status(201).json({ id: row!.id });
  } catch (e) { next(e); }
});

accountsRouter.put('/:id', requirePermission('imports.run'), async (req, res, next) => {
  try {
    const d = parse(acctSchema.partial(), req.body);
    const a = await one<{ id: string; client_id: string; code: string }>('SELECT id, client_id, code FROM chart_of_accounts WHERE id = $1', [req.params.id]);
    if (!a) throw notFound('الحساب غير موجود');
    if (d.fs_line_code && !(await one('SELECT 1 FROM fs_line_items WHERE code = $1', [d.fs_line_code]))) throw badRequest('بند القوائم غير معروف');
    const keys = Object.keys(d) as (keyof typeof d)[];
    if (!keys.length) throw badRequest('لا توجد حقول');
    await query(`UPDATE chart_of_accounts SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`, [a.id, ...keys.map((k) => d[k] ?? null)]);
    await audit(req, { action: 'account.updated', entityType: 'chart_of_accounts', entityId: a.id, clientId: a.client_id, details: { code: a.code, ...d } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/** إعادة التصنيف التلقائي لحسابات العميل (بناءً على الأسماء) */
accountsRouter.post('/auto-classify', requirePermission('imports.run'), async (req, res, next) => {
  try {
    const d = parse(z.object({ client_id: z.string().uuid(), only_unmapped: z.boolean().default(true) }), req.body);
    const rows = await many<{ id: string; code: string; name_ar: string; fs_line_code: string | null }>('SELECT id, code, name_ar, fs_line_code FROM chart_of_accounts WHERE client_id = $1', [d.client_id]);
    let updated = 0;
    for (const r of rows) {
      if (d.only_unmapped && r.fs_line_code && r.fs_line_code !== 'UNMAPPED') continue;
      const c = classifyAccount(r.code, r.name_ar);
      await query('UPDATE chart_of_accounts SET account_type = $2, sub_type = $3, normal_balance = $4, fs_line_code = $5, is_suspense = $6, is_bank = $7, updated_at = now() WHERE id = $1',
        [r.id, c.account_type, c.sub_type, c.normal_balance, c.fs_line_code, c.is_suspense, c.is_bank]);
      updated++;
    }
    await audit(req, { action: 'accounts.auto_classified', entityType: 'client', entityId: d.client_id, clientId: d.client_id, details: { updated } });
    res.json({ updated });
  } catch (e) { next(e); }
});
