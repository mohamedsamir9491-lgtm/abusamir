import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { unauthorized, badRequest } from '../../lib/errors.js';
import { authenticate, COOKIE_NAME, signSession } from '../../middleware/auth.js';
import { sha256 } from '../../lib/crypto.js';
import { audit } from '../../middleware/audit.js';
import { config } from '../../config.js';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate_limited', message: 'محاولات كثيرة، حاول لاحقًا' } });

const loginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = parse(loginSchema, req.body);
    const user = await one<{ id: string; password_hash: string; is_active: boolean; failed_logins: number; locked_until: string | null; full_name: string; role_code: string; must_change_password: boolean }>(
      'SELECT id, password_hash, is_active, failed_logins, locked_until, full_name, role_code, must_change_password FROM users WHERE lower(email) = lower($1)', [email]);
    if (!user || !user.is_active) {
      await audit(req, { action: 'auth.login_failed', details: { email } });
      throw unauthorized('بيانات الدخول غير صحيحة');
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw unauthorized('الحساب مقفل مؤقتًا بسبب محاولات فاشلة متكررة');
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const failed = user.failed_logins + 1;
      await query('UPDATE users SET failed_logins = $2, locked_until = CASE WHEN $2 >= 5 THEN now() + interval \'15 minutes\' ELSE NULL END WHERE id = $1', [user.id, failed]);
      await audit(req, { action: 'auth.login_failed', entityType: 'user', entityId: user.id });
      throw unauthorized('بيانات الدخول غير صحيحة');
    }
    const sessionId = crypto.randomUUID();
    const token = signSession(sessionId, user.id);
    const expires = new Date(Date.now() + config.sessionHours * 3600 * 1000);
    await query('INSERT INTO sessions (id, user_id, token_hash, expires_at, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6)',
      [sessionId, user.id, sha256(token), expires, req.ip, req.headers['user-agent'] ?? null]);
    await query('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
    await audit(req, { action: 'auth.login', entityType: 'user', entityId: user.id });
    res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, expires, path: '/' });
    res.json({ user: { id: user.id, email, full_name: user.full_name, role_code: user.role_code, must_change_password: user.must_change_password }, token });
  } catch (e) { next(e); }
});

authRouter.post('/logout', authenticate, async (req, res, next) => {
  try {
    await query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [req.user!.session_id]);
    await audit(req, { action: 'auth.logout', entityType: 'user', entityId: req.user!.id });
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

authRouter.get('/me', authenticate, async (req, res) => {
  const u = req.user!;
  const row = await one<{ must_change_password: boolean }>('SELECT must_change_password FROM users WHERE id = $1', [u.id]);
  res.json({ user: { id: u.id, email: u.email, full_name: u.full_name, role_code: u.role_code, permissions: u.permissions, must_change_password: row?.must_change_password ?? false } });
});

const changePwSchema = z.object({ current_password: z.string().min(1), new_password: z.string().min(10).max(200) });
authRouter.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { current_password, new_password } = parse(changePwSchema, req.body);
    const u = await one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
    if (!u || !(await bcrypt.compare(current_password, u.password_hash))) throw badRequest('كلمة المرور الحالية غير صحيحة');
    const hash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash = $2, must_change_password = FALSE, updated_at = now() WHERE id = $1', [req.user!.id, hash]);
    await query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL', [req.user!.id, req.user!.session_id]);
    await audit(req, { action: 'auth.password_changed', entityType: 'user', entityId: req.user!.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
