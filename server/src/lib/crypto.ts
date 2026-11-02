import crypto from 'node:crypto';
import fs from 'node:fs';
import { config } from '../config.js';

export function sha256(buf: Buffer | string): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

function key(): Buffer | null {
  if (!config.fileEncryptionKey) return null;
  const k = Buffer.from(config.fileEncryptionKey, 'hex');
  if (k.length !== 32) throw new Error('FILE_ENCRYPTION_KEY must be 32 bytes hex (64 chars)');
  return k;
}
export const encryptionEnabled = (): boolean => key() !== null;

/** تشفير AES-256-GCM للملفات المخزنة (iv(12) | tag(16) | ciphertext) */
export function encryptBuffer(plain: Buffer): Buffer {
  const k = key();
  if (!k) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}
export function decryptBuffer(data: Buffer, isEncrypted: boolean): Buffer {
  if (!isEncrypted) return data;
  const k = key();
  if (!k) throw new Error('الملف مشفر ولكن مفتاح التشفير غير مضبوط');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const enc = data.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]);
}
export function writeStoredFile(absPath: string, data: Buffer): boolean {
  const enc = encryptionEnabled();
  fs.writeFileSync(absPath, enc ? encryptBuffer(data) : data, { mode: 0o600 });
  return enc;
}
export function readStoredFile(absPath: string, isEncrypted: boolean): Buffer {
  return decryptBuffer(fs.readFileSync(absPath), isEncrypted);
}
