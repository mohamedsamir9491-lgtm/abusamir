import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db/pool.js';
import { sha256 } from '../lib/crypto.js';
import { unauthorized, forbidden } from '../lib/errors.js';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role_code: string;
  permissions: string[];
  session_id: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

export const COOKIE_NAME = 'abusamir_session';

export function signSession(sessionId: string, userId: string): string {
  return jwt.sign({ sid: sessionId, sub: userId }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
}

export async function resolveUser(token: string): Promise<AuthUser | null> {
  let payload: { sid: string; sub: string };
  try {
    payload = jwt.verify(token, config.jwtSecret) as { sid: string; sub: string };
  } catch { return null; }
  const row = await one<{
    id: string; email: string; full_name: string; role_code: string; is_active: boolean; permissions: string[];
  }>(
    `SELECT u.id, u.email, u.full_name, u.role_code, u.is_active,
            COALESCE(array_agg(rp.permission_code) FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS permissions
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN role_permissions rp ON rp.role_code = u.role_code
      WHERE s.id = $1 AND s.user_id = $2 AND s.revoked_at IS NULL AND s.expires_at > now()
        AND s.token_hash = $3
      GROUP BY u.id`,
    [payload.sid, payload.sub, sha256(token)],
  );
  if (!row || !row.is_active) return null;
  return { id: row.id, email: row.email, full_name: row.full_name, role_code: row.role_code,
    permissions: row.permissions, session_id: payload.sid };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    const token = (req.cookies?.[COOKIE_NAME] as string | undefined) ?? bearer;
    if (!token) throw unauthorized();
    const user = await resolveUser(token);
    if (!user) throw unauthorized('انتهت الجلسة أو غير صالحة');
    req.user = user;
    next();
  } catch (e) { next(e); }
}

export function requirePermission(...perms: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u = req.user;
    if (!u) return next(unauthorized());
    const ok = perms.every((p) => u.permissions.includes(p));
    if (!ok) return next(forbidden());
    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u = req.user;
    if (!u) return next(unauthorized());
    if (!roles.includes(u.role_code)) return next(forbidden());
    next();
  };
}
