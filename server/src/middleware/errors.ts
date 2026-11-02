import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    return;
  }
  const e = err as { status?: number; code?: string; message?: string; type?: string };
  if (e?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'file_too_large', message: `حجم الملف يتجاوز الحد المسموح (${config.maxUploadMb}MB)` });
    return;
  }
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'bad_json', message: 'صيغة JSON غير صالحة' });
    return;
  }
  logger.error({ err, url: req.originalUrl, user: req.user?.id }, 'unhandled error');
  res.status(500).json({ error: 'internal', message: 'حدث خطأ داخلي. تم تسجيل التفاصيل.' });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'not_found', message: 'المسار غير موجود' });
}
