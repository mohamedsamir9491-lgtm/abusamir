import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query, one } from './pool.js';
import { config } from '../config.js';
import { FS_LINES } from '../engine/fsLines.js';
import { SYSTEM_TEMPLATES } from '../modules/reports/templates.js';
import { logger } from '../lib/logger.js';

/** بيانات مرجعية (idempotent): بنود القوائم، القوالب النظامية، المستخدم الأول */
export async function seedReferenceData() {
  for (const l of FS_LINES) {
    await query(`INSERT INTO fs_line_items (code, statement, section, label_ar, label_en, normal_sign, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (code) DO UPDATE SET statement = EXCLUDED.statement, section = EXCLUDED.section, label_ar = EXCLUDED.label_ar, label_en = EXCLUDED.label_en, normal_sign = EXCLUDED.normal_sign, sort_order = EXCLUDED.sort_order`,
      [l.code, l.statement, l.section, l.label_ar, l.label_en, l.normal_sign, l.sort_order]);
  }
  for (const t of SYSTEM_TEMPLATES) {
    await query(`INSERT INTO report_templates (code, report_type, name_ar, name_en, description, sections, is_system) VALUES ($1,$2,$3,$4,$5,$6,TRUE)
      ON CONFLICT (code) DO UPDATE SET report_type = EXCLUDED.report_type, name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, description = EXCLUDED.description, sections = CASE WHEN report_templates.is_system THEN EXCLUDED.sections ELSE report_templates.sections END, updated_at = now()`,
      [t.code, t.report_type, t.name_ar, t.name_en, t.description, JSON.stringify(t.sections)]);
  }
  const users = await one<{ c: string }>('SELECT count(*) AS c FROM users');
  if (Number(users?.c ?? 0) === 0) {
    if (!config.admin.password || config.admin.password.length < 10) {
      logger.warn('لم يُنشأ مستخدم أولي: ADMIN_PASSWORD غير مضبوط أو أقصر من 10 أحرف');
    } else {
      const hash = await bcrypt.hash(config.admin.password, 12);
      await query(`INSERT INTO users (email, password_hash, full_name, role_code, must_change_password) VALUES ($1,$2,$3,'admin',TRUE)`, [config.admin.email.toLowerCase(), hash, config.admin.name]);
      logger.info({ email: config.admin.email }, 'تم إنشاء المستخدم الأول (مدير النظام) - يجب تغيير كلمة المرور عند أول دخول');
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  seedReferenceData().then(() => { console.log('تم تحميل البيانات المرجعية'); return pool.end(); }).catch((e) => { console.error(e); process.exit(1); });
}
