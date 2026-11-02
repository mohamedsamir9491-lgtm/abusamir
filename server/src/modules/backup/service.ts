import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../../config.js';
import { query } from '../../db/pool.js';
import { badRequest } from '../../lib/errors.js';

const execFileP = promisify(execFile);
const dir = () => path.join(config.storageDir, 'backups');

/** نسخة احتياطية: pg_dump (صيغة مخصصة مضغوطة) + أرشيف الملفات المرفوعة */
export async function createBackup(userId: string | null) {
  fs.mkdirSync(dir(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `backup-${stamp}`;
  const dbFile = path.join(dir(), `${name}.dump`);
  const filesTar = path.join(dir(), `${name}-files.tar.gz`);
  await execFileP('pg_dump', ['--format=custom', '--no-owner', `--file=${dbFile}`, config.databaseUrl], { timeout: 10 * 60 * 1000 });
  await execFileP('tar', ['-czf', filesTar, '-C', config.storageDir, 'uploads', 'branding', 'reports'], { timeout: 10 * 60 * 1000 }).catch(() => { /* قد لا توجد مجلدات بعد */ });
  const size = fs.statSync(dbFile).size + (fs.existsSync(filesTar) ? fs.statSync(filesTar).size : 0);
  await query(`INSERT INTO stored_files (purpose, original_name, stored_path, mime_type, size_bytes, sha256, uploaded_by) VALUES ('backup',$1,$2,'application/octet-stream',$3,'',$4)`, [name, path.relative(config.storageDir, dbFile), size, userId]);
  return { name, db_file: dbFile, files_archive: fs.existsSync(filesTar) ? filesTar : null, size_bytes: size, created_at: new Date().toISOString() };
}

export async function listBackups() {
  if (!fs.existsSync(dir())) return [];
  return fs.readdirSync(dir()).filter((f) => f.endsWith('.dump')).sort().reverse().map((f) => {
    const st = fs.statSync(path.join(dir(), f)); const name = f.replace(/\.dump$/, '');
    return { name, size_bytes: st.size, created_at: st.mtime.toISOString(), has_files_archive: fs.existsSync(path.join(dir(), `${name}-files.tar.gz`)) };
  });
}

/** اختبار الاستعادة: pg_restore --list يتحقق من سلامة الأرشيف دون كتابة لقاعدة البيانات */
export async function verifyBackup(name: string) {
  if (!/^backup-[\w-]+$/.test(name)) throw badRequest('اسم غير صالح');
  const file = path.join(dir(), `${name}.dump`);
  if (!fs.existsSync(file)) throw badRequest('النسخة غير موجودة');
  const { stdout } = await execFileP('pg_restore', ['--list', file], { timeout: 60000, maxBuffer: 32 * 1024 * 1024 });
  const tables = (stdout.match(/TABLE DATA/g) ?? []).length;
  return { name, valid: tables > 0, table_data_entries: tables, note: 'للاستعادة الكاملة: pg_restore --clean --if-exists -d <DATABASE_URL> <file>.dump ثم فك أرشيف الملفات في مجلد التخزين' };
}
