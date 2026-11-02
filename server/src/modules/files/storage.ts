import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { one, type Queryable } from '../../db/pool.js';
import { sha256, writeStoredFile, readStoredFile } from '../../lib/crypto.js';
import { badRequest, notFound } from '../../lib/errors.js';

export const ALLOWED_MIME: Record<string, string[]> = {
  document: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
    'text/csv', 'text/plain', 'application/csv', 'application/pdf', 'image/png', 'image/jpeg', 'image/tiff',
    'application/json', 'application/octet-stream',
  ],
  image: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'],
  letterhead: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'],
};
export const ALLOWED_EXT: Record<string, string[]> = {
  document: ['.xlsx', '.xls', '.csv', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.tif', '.tiff', '.json'],
  image: ['.png', '.jpg', '.jpeg', '.svg', '.webp'],
  letterhead: ['.pdf', '.docx', '.png', '.jpg', '.jpeg'],
};

export interface StoredFileRow {
  id: string; purpose: string; original_name: string; stored_path: string; mime_type: string;
  size_bytes: string; sha256: string; is_encrypted: boolean; uploaded_by: string | null; created_at: string;
}

export function ensureStorageDirs() {
  for (const d of ['uploads', 'reports', 'backups', 'branding', 'tmp']) {
    fs.mkdirSync(path.join(config.storageDir, d), { recursive: true });
  }
}

export function sanitizeName(name: string): string {
  return path.basename(name).replace(/[^\w.؀-ۿ\- ]+/g, '_').slice(0, 180);
}

export function checkUpload(kind: keyof typeof ALLOWED_EXT, originalName: string, mime: string) {
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXT[kind].includes(ext)) throw badRequest(`امتداد الملف غير مسموح (${ext || 'بدون امتداد'})`);
  if (mime && !ALLOWED_MIME[kind].includes(mime)) throw badRequest(`نوع الملف غير مسموح (${mime})`);
}

export async function saveFile(
  params: { purpose: string; subdir: string; originalName: string; mime: string; data: Buffer; userId?: string | null },
  db?: Queryable,
): Promise<StoredFileRow> {
  const id = crypto.randomUUID();
  const ext = path.extname(params.originalName).toLowerCase();
  const rel = path.join(params.subdir, `${id}${ext}`);
  const abs = path.join(config.storageDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const enc = writeStoredFile(abs, params.data);
  const row = await one<StoredFileRow>(
    `INSERT INTO stored_files (id, purpose, original_name, stored_path, mime_type, size_bytes, sha256, is_encrypted, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, params.purpose, sanitizeName(params.originalName), rel, params.mime || 'application/octet-stream',
      params.data.length, sha256(params.data), enc, params.userId ?? null], db);
  return row!;
}

export async function getFile(id: string, db?: Queryable): Promise<StoredFileRow> {
  const f = await one<StoredFileRow>('SELECT * FROM stored_files WHERE id = $1 AND deleted_at IS NULL', [id], db);
  if (!f) throw notFound('الملف غير موجود');
  return f;
}

export function readFileData(f: StoredFileRow): Buffer {
  return readStoredFile(path.join(config.storageDir, f.stored_path), f.is_encrypted);
}

export async function softDeleteFile(id: string, db?: Queryable) {
  await one('UPDATE stored_files SET deleted_at = now() WHERE id = $1', [id], db);
}
