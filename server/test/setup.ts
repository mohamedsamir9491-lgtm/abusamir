import { execSync } from 'node:child_process';
process.env.NODE_ENV = 'test';
process.env.STORAGE_DIR = '/tmp/claude-0/-home-user-abusamir/3f0c9cdb-eb6b-5493-bc6e-a6b73e9bf13f/scratchpad/test-storage';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234567890';
process.env.ADMIN_PASSWORD = 'TestAdmin!2026';
process.env.CLIENT_ORIGIN = 'http://localhost';
/** يعيد قاعدة الاختبار إلى حالة نظيفة قبل كل ملف اختبار */
export function resetTestDb() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://abusamir:abusamir_dev@localhost:5432/abusamir_test';
  execSync(`psql "${url}" -q -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`, { stdio: 'pipe' });
}
