import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// يُحمَّل ملف .env من جذر المشروع أو من مجلد الخادم أو من مجلد التشغيل الحالي
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [path.resolve(process.cwd(), '.env'), path.resolve(here, '../.env'), path.resolve(here, '../../.env')],
  quiet: true,
});

function bool(v: string | undefined, def = false): boolean {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}
function num(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : def;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const jwtSecret = process.env.JWT_SECRET ?? '';
if (nodeEnv === 'production' && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

export const config = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: num(process.env.PORT, 4000),
  databaseUrl: nodeEnv === 'test'
    ? (process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '')
    : (process.env.DATABASE_URL ?? ''),
  jwtSecret: jwtSecret || 'dev-only-insecure-secret-change-me-0123456789',
  sessionHours: num(process.env.SESSION_HOURS, 12),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  storageDir: path.resolve(process.env.STORAGE_DIR ?? './storage'),
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 25),
  fileEncryptionKey: process.env.FILE_ENCRYPTION_KEY ?? '',
  ai: {
    provider: (process.env.AI_PROVIDER ?? 'none') as 'none' | 'anthropic',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.AI_MODEL ?? 'claude-sonnet-5-5',
    allowExternal: bool(process.env.AI_ALLOW_EXTERNAL, false),
  },
  chromiumPath: process.env.CHROMIUM_PATH ?? '',
  admin: {
    email: process.env.ADMIN_EMAIL ?? 'admin@office.local',
    password: process.env.ADMIN_PASSWORD ?? '',
    name: process.env.ADMIN_NAME ?? 'مدير النظام',
  },
};
