import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { ensureStorageDirs } from './modules/files/storage.js';
import { seedReferenceData } from './db/seed.js';
import { loadLegalCorpus } from './modules/legal/library.js';
import { loadLegalRates } from './modules/legal/rates.js';
import { pool } from './db/pool.js';

async function main() {
  ensureStorageDirs();
  await runMigrations();
  await seedReferenceData();
  // المكتبة النظامية: تُحمَّل عند تغيّر إصدارها (لا توقف التشغيل إن فشلت)
  loadLegalCorpus().then((r) => loadLegalRates(r.version ?? null)).catch((e) => logger.error({ err: e }, 'legal library load failed'));
  const app = createApp();

  // خدمة واجهة العميل المبنية (للنشر على خادم المكتب) إن وُجدت
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  const server = app.listen(config.port, () => logger.info({ port: config.port, env: config.nodeEnv }, 'server started'));
  const shutdown = () => { server.close(() => pool.end().then(() => process.exit(0))); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => { logger.error(e, 'startup failed'); process.exit(1); });
