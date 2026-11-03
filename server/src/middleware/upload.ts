import multer from 'multer';
import { config } from '../config.js';

export const upload = multer({
  storage: multer.memoryStorage(),
  // أسماء الملفات العربية تصل UTF-8؛ الافتراضي latin1 يحوّلها إلى رموز مشوّهة
  defParamCharset: 'utf8',
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 5 },
});
