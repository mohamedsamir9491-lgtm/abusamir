import { createBackup } from './service.js';
import { pool } from '../../db/pool.js';
createBackup(null).then((b) => { console.log('تم إنشاء النسخة الاحتياطية:', b); return pool.end(); }).catch((e) => { console.error(e); process.exit(1); });
