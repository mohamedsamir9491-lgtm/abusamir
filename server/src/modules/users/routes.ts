import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { many, one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';

export const usersRouter = Router();
usersRouter.use(authenticate, requirePermission('users.manage'));

const ROLE_CODES = ['admin', 'office_manager', 'accountant', 'reviewer', 'readonly'] as const;

usersRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await many(`SELECT u.id, u.email, u.full_name, u.role_code, r.name_ar AS role_name_ar, u.is_active,
      u.must_change_password, u.last_login_at, u.created_at FROM users u JOIN roles r ON r.code = u.role_code ORDER BY u.created_at`);
    res.json({ users: rows });
  } catch (e) { next(e); }
});

usersRouter.get('/roles', async (_req, res, next) => {
  try {
    const roles = await many(`SELECT r.code, r.name_ar, r.name_en, r.rank,
      COALESCE(array_agg(rp.permission_code ORDER BY rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS permissions
      FROM roles r LEFT JOIN role_permissions rp ON rp.role_code = r.code GROUP BY r.code ORDER BY r.rank DESC`);
    const permissions = await many('SELECT code, description FROM permissions ORDER BY code');
    res.json({ roles, permissions });
  } catch (e) { next(e); }
});

const createSchema = z.object({
  email: z.string().email().max(200),
  full_name: z.string().min(2).max(200),
  role_code: z.enum(ROLE_CODES),
  password: z.string().min(10).max(200),
});
usersRouter.post('/', async (req, res, next) => {
  try {
    const d = parse(createSchema, req.body);
    const exists = await one('SELECT 1 FROM users WHERE lower(email) = lower($1)', [d.email]);
    if (exists) throw conflict('البريد الإلكتروني مستخدم مسبقًا');
    const hash = await bcrypt.hash(d.password, 12);
    const row = await one<{ id: string }>(
      'INSERT INTO users (email, password_hash, full_name, role_code, must_change_password) VALUES ($1,$2,$3,$4,TRUE) RETURNING id',
      [d.email.toLowerCase(), hash, d.full_name, d.role_code]);
    await audit(req, { action: 'user.created', entityType: 'user', entityId: row!.id, details: { email: d.email, role: d.role_code } });
    res.status(201).json({ id: row!.id });
  } catch (e) { next(e); }
});

const updateSchema = z.object({
  full_name: z.string().min(2).max(200).optional(),
  role_code: z.enum(ROLE_CODES).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(10).max(200).optional(),
});
usersRouter.patch('/:id', async (req, res, next) => {
  try {
    const d = parse(updateSchema, req.body);
    const target = await one<{ id: string; role_code: string }>('SELECT id, role_code FROM users WHERE id = $1', [req.params.id]);
    if (!target) throw notFound('المستخدم غير موجود');
    if (target.id === req.user!.id && (d.is_active === false || (d.role_code && d.role_code !== 'admin'))) {
      throw badRequest('لا يمكنك تعطيل حسابك أو تخفيض دورك بنفسك');
    }
    if (d.full_name !== undefined) await query('UPDATE users SET full_name = $2, updated_at = now() WHERE id = $1', [target.id, d.full_name]);
    if (d.role_code !== undefined) await query('UPDATE users SET role_code = $2, updated_at = now() WHERE id = $1', [target.id, d.role_code]);
    if (d.is_active !== undefined) {
      await query('UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1', [target.id, d.is_active]);
      if (!d.is_active) await query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [target.id]);
    }
    if (d.password !== undefined) {
      const hash = await bcrypt.hash(d.password, 12);
      await query('UPDATE users SET password_hash = $2, must_change_password = TRUE, updated_at = now() WHERE id = $1', [target.id, hash]);
      await query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [target.id]);
    }
    await audit(req, { action: 'user.updated', entityType: 'user', entityId: target.id, details: { ...d, password: d.password ? '[changed]' : undefined } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
