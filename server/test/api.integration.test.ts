import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { resetTestDb } from './setup.js';
resetTestDb();
const { createApp } = await import('../src/app.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { seedReferenceData } = await import('../src/db/seed.js');
const { ensureStorageDirs } = await import('../src/modules/files/storage.js');
const { pool, query } = await import('../src/db/pool.js');

const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), 'fixtures');
const app = createApp();
let admin = ''; let accountant = ''; let reviewer = ''; let readonly = '';
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
async function login(email: string, password: string) { const r = await request(app).post('/api/auth/login').send({ email, password }); expect(r.status).toBe(200); return r.body.token as string; }

beforeAll(async () => {
  ensureStorageDirs(); await runMigrations(); await seedReferenceData();
  admin = await login('admin@office.local', 'TestAdmin!2026');
  for (const [email, role] of [['acc@test.local', 'accountant'], ['rev@test.local', 'reviewer'], ['ro@test.local', 'readonly']]) {
    const r = await request(app).post('/api/users').set(auth(admin)).send({ email, full_name: `مستخدم ${role}`, role_code: role, password: 'Password!2026x' }); expect(r.status).toBe(201);
  }
  accountant = await login('acc@test.local', 'Password!2026x'); reviewer = await login('rev@test.local', 'Password!2026x'); readonly = await login('ro@test.local', 'Password!2026x');
});
afterAll(async () => { await pool.end(); });

describe('auth and permissions', () => {
  it('rejects wrong password and unauthenticated access', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'admin@office.local', password: 'wrong' })).status).toBe(401);
    expect((await request(app).get('/api/clients')).status).toBe(401);
  });
  it('enforces role permissions', async () => {
    expect((await request(app).get('/api/users').set(auth(accountant))).status).toBe(403);
    expect((await request(app).post('/api/clients').set(auth(readonly)).send({ legal_name_ar: 'x' })).status).toBe(403);
    expect((await request(app).get('/api/audit').set(auth(accountant))).status).toBe(403);
    expect((await request(app).get('/api/audit').set(auth(reviewer))).status).toBe(200);
  });
  it('stores password hashes, never plaintext', async () => {
    const r = await query<{ password_hash: string }>('SELECT password_hash FROM users WHERE email = $1', ['acc@test.local']);
    expect(r.rows[0].password_hash.startsWith('$2')).toBe(true);
  });
});

let clientA = ''; let clientB = ''; let engA = ''; let engB = ''; let pA24 = ''; let pA25 = ''; let pB = '';
describe('clients, engagements and data isolation', () => {
  it('creates two clients with engagements and periods', async () => {
    clientA = (await request(app).post('/api/clients').set(auth(accountant)).send({ legal_name_ar: 'عميل أ (اختبار)', is_demo: true })).body.id;
    clientB = (await request(app).post('/api/clients').set(auth(accountant)).send({ legal_name_ar: 'عميل ب (اختبار)', is_demo: true })).body.id;
    const ea = await request(app).post('/api/engagements').set(auth(accountant)).send({ client_id: clientA, title: 'ارتباط أ', periods: [{ label: '2024', start_date: '2024-01-01', end_date: '2024-12-31', role: 'prior' }, { label: '2025', start_date: '2025-01-01', end_date: '2025-12-31', role: 'current' }] });
    expect(ea.status).toBe(201); engA = ea.body.id;
    const eb = await request(app).post('/api/engagements').set(auth(accountant)).send({ client_id: clientB, title: 'ارتباط ب', periods: [{ label: '2025', start_date: '2025-01-01', end_date: '2025-12-31' }] });
    engB = eb.body.id;
    const da = (await request(app).get(`/api/engagements/${engA}`).set(auth(accountant))).body; pA24 = da.periods[0].id; pA25 = da.periods[1].id;
    pB = (await request(app).get(`/api/engagements/${engB}`).set(auth(accountant))).body.periods[0].id;
  });
  it('refuses to mix a period from another client/engagement', async () => {
    const r = await request(app).get(`/api/trial-balance?engagement_id=${engA}&period_id=${pB}`).set(auth(accountant));
    expect(r.status).toBe(403);
    const r2 = await request(app).post('/api/documents/upload').set(auth(accountant)).field('engagement_id', engA).field('period_id', pB).attach('files', path.join(FIX, 'TEST_trial_balance_2025.xlsx'));
    expect(r2.status).toBe(403);
  });
  it('rejects disallowed file types', async () => {
    const r = await request(app).post('/api/documents/upload').set(auth(accountant)).field('engagement_id', engA).attach('files', Buffer.from('MZ...'), 'evil.exe');
    expect(r.status).toBe(400);
  });
});

async function importFile(file: string, dataType: string, periodId: string, extra: Record<string, string> = {}) {
  const up = await request(app).post('/api/documents/upload').set(auth(accountant)).field('engagement_id', engA).field('document_type', dataType).attach('files', path.join(FIX, file));
  expect(up.status).toBe(201);
  const job = (await request(app).post('/api/imports').set(auth(accountant)).send({ document_id: up.body.documents[0].id, data_type: dataType, period_id: periodId })).body.job;
  expect(['extracted', 'failed']).toContain(job.status);
  if (Object.keys(extra).length) await request(app).put(`/api/imports/${job.id}/mapping`).set(auth(accountant)).send({ column_mapping: { ...job.column_mapping, ...extra } });
  const v = await request(app).post(`/api/imports/${job.id}/validate`).set(auth(accountant));
  expect(v.status).toBe(200);
  return { job, report: v.body.report as { can_commit: boolean; ok: number; errors: number; skipped: number; summary: Record<string, unknown> }, docId: up.body.documents[0].id as string };
}

describe('import wizard', () => {
  it('extracts, auto-maps arabic headers, skips title and totals rows, validates and commits', async () => {
    const { job, report } = await importFile('TEST_trial_balance_2025.xlsx', 'trial_balance', pA25);
    expect(job.header_row).toBe(3);
    expect(job.column_mapping.account_code).toBe(0); expect(job.column_mapping.closing_credit).toBe(7);
    expect(report.can_commit).toBe(true); expect(report.ok).toBe(22); expect(report.skipped).toBe(4);
    expect((report.summary.balance_check as { closing_difference: string }).closing_difference).toBe('0.00');
    expect((await request(app).post(`/api/imports/${job.id}/commit`).set(auth(accountant)).send({})).status).toBe(400); // يتطلب confirm:true
    const c = await request(app).post(`/api/imports/${job.id}/commit`).set(auth(accountant)).send({ confirm: true });
    expect(c.status).toBe(200); expect(c.body.inserted).toBe(22);
    const rows = await query('SELECT count(*) AS c FROM trial_balance_entries WHERE period_id = $1', [pA25]); expect(Number(rows.rows[0].c)).toBe(22);
    const coa = await query('SELECT count(*) AS c FROM chart_of_accounts WHERE client_id = $1', [clientA]); expect(Number(coa.rows[0].c)).toBe(22);
  });
  it('blocks commit when a required field is unmapped and records the reason', async () => {
    const up = await request(app).post('/api/documents/upload').set(auth(accountant)).field('engagement_id', engA).attach('files', path.join(FIX, 'TEST_trial_balance_2024.xlsx'));
    const job = (await request(app).post('/api/imports').set(auth(accountant)).send({ document_id: up.body.documents[0].id, data_type: 'trial_balance', period_id: pA24 })).body.job;
    await request(app).put(`/api/imports/${job.id}/mapping`).set(auth(accountant)).send({ column_mapping: { account_name: 1, closing_debit: 2, closing_credit: 3 } });
    const v = await request(app).post(`/api/imports/${job.id}/validate`).set(auth(accountant));
    expect(v.body.report.can_commit).toBe(false); expect(v.body.report.blocking_reasons.join(' ')).toContain('رمز الحساب');
    expect((await request(app).post(`/api/imports/${job.id}/commit`).set(auth(accountant)).send({ confirm: true })).status).toBe(422);
    await request(app).put(`/api/imports/${job.id}/mapping`).set(auth(accountant)).send({ column_mapping: { account_code: 0, account_name: 1, closing_debit: 2, closing_credit: 3 } });
    await request(app).post(`/api/imports/${job.id}/validate`).set(auth(accountant));
    expect((await request(app).post(`/api/imports/${job.id}/commit`).set(auth(accountant)).send({ confirm: true })).body.inserted).toBe(21);
  });
  it('imports CSV journal and receivables with duplicate/negative detection downstream', async () => {
    const j = await importFile('TEST_journal_2025.csv', 'journal_entries', pA25); expect(j.report.can_commit).toBe(true);
    await request(app).post(`/api/imports/${j.job.id}/commit`).set(auth(accountant)).send({ confirm: true });
    const r = await importFile('TEST_receivables_2025.csv', 'receivables', pA25); expect(r.report.can_commit).toBe(true);
    await request(app).post(`/api/imports/${r.job.id}/commit`).set(auth(accountant)).send({ confirm: true });
  });
  it('manual trial balance entry goes through the same validated path', async () => {
    const r = await request(app).post('/api/imports/manual/trial-balance').set(auth(accountant)).send({ engagement_id: engB, period_id: pB, rows: [{ account_code: '1101', account_name: 'النقد', closing_debit: '1000' }, { account_code: '3101', account_name: 'رأس المال', closing_credit: '1000' }] });
    expect(r.status).toBe(201); expect(r.body.report.can_commit).toBe(true);
    await request(app).post(`/api/imports/${r.body.job.id}/commit`).set(auth(accountant)).send({ confirm: true });
  });
});

describe('deterministic analysis', () => {
  it('validates the trial balance with prior comparison and persists traceable findings', async () => {
    await request(app).post('/api/analysis/trial-balance/validate').set(auth(accountant)).send({ engagement_id: engA, period_id: pA24 });
    const r = await request(app).post('/api/analysis/trial-balance/validate').set(auth(accountant)).send({ engagement_id: engA, period_id: pA25 });
    expect(r.status).toBe(200); expect(r.body.result.summary.totals.closing.balanced).toBe(true); expect(r.body.prior.label).toBe('2024');
    const codes = r.body.result.findings.map((f: { rule_code: string }) => f.rule_code);
    expect(codes).toContain('TB-011'); expect(codes).toContain('TB-014'); expect(codes).not.toContain('TB-017');
    const f = (await request(app).get(`/api/findings?engagement_id=${engA}&period_id=${pA25}`).set(auth(readonly))).body.findings;
    const susp = f.find((x: { rule_code: string }) => x.rule_code === 'TB-011');
    expect(susp.amount).toBe('7500.0000'); expect(susp.source_row_ref).toBe('الصف 11'); expect(susp.finding_ref).toMatch(/^F-\d{4}$/);
    // إعادة التشغيل لا تكرر الملاحظات
    await request(app).post('/api/analysis/trial-balance/validate').set(auth(accountant)).send({ engagement_id: engA, period_id: pA25 });
    const f2 = (await request(app).get(`/api/findings?engagement_id=${engA}&period_id=${pA25}`).set(auth(readonly))).body.findings;
    expect(f2.filter((x: { rule_code: string }) => x.rule_code === 'TB-011')).toHaveLength(1);
  });
  it('readonly users cannot run analysis', async () => {
    expect((await request(app).post('/api/analysis/trial-balance/validate').set(auth(readonly)).send({ engagement_id: engA, period_id: pA25 })).status).toBe(403);
  });
  it('generates statements, ratios and variance from the stored TB and reproduces them', async () => {
    const r = await request(app).post('/api/analysis/statements/generate').set(auth(accountant)).send({ engagement_id: engA, period_id: pA25 });
    expect(r.status).toBe(200);
    expect(r.body.statements.sfp.balanced).toBe(true); expect(r.body.statements.key_figures.net_income).toBe('187500.00');
    expect(r.body.statements.cf.status).toBe('ok');
    const ratios = Object.fromEntries(r.body.ratios.map((x: { code: string; value: string }) => [x.code, x.value]));
    expect(ratios.current_ratio).toBe('2.70'); expect(ratios.gross_margin).toBe('48.18'); expect(ratios.dso).toBe('53');
    expect(r.body.variance.rows.find((v: { key: string }) => v.key === 'total:net_revenue').change).toBe('200000.00');
    const again = await request(app).post('/api/analysis/statements/generate').set(auth(accountant)).send({ engagement_id: engA, period_id: pA25 });
    expect(again.body.statements.key_figures).toEqual(r.body.statements.key_figures);
    const stored = await request(app).get(`/api/analysis/statements?engagement_id=${engA}&period_id=${pA25}`).set(auth(readonly));
    expect(stored.body.package.data.statements.key_figures.total_assets).toBe('854500.00');
  });
  it('journal checks find unbalanced, duplicate and out-of-period entries and reconcile to TB', async () => {
    const r = await request(app).post('/api/analysis/journal/validate').set(auth(accountant)).send({ engagement_id: engA, period_id: pA25 });
    expect(r.status).toBe(200); expect(r.body.summary.unbalanced_entries).toBe(1); expect(r.body.summary.duplicates).toBe(1); expect(r.body.summary.out_of_period).toBe(1);
    expect(r.body.reconciliation.summary.unmatched).toBeGreaterThan(0);
  });
  it('reconciles receivables subledger to GL and ages it', async () => {
    const r = await request(app).post('/api/analysis/subledger/analyze').set(auth(accountant)).send({ engagement_id: engA, period_id: pA25, record_type: 'receivable' });
    expect(r.status).toBe(200); expect(r.body.reconciliation.matched).toBe(true); expect(r.body.reconciliation.difference).toBe('0.00');
    expect(r.body.findings.map((f: { rule_code: string }) => f.rule_code)).toContain('AR-002');
  });
  it('external AI is off by default; the local accountant works without it', async () => {
    const s = await request(app).get('/api/ai/status').set(auth(accountant)); expect(s.body.authorized).toBe(false);
    const r = await request(app).post('/api/ai/analyze').set(auth(accountant)).send({ engagement_id: engA, period_id: pA25, engine: 'external', confirm_external_transfer: true }); expect(r.status).toBe(400);
    const l = await request(app).post('/api/ai/analyze').set(auth(accountant)).send({ engagement_id: engA, period_id: pA25 }); expect(l.status).toBe(200); expect(l.body.analysis._verification.engine).toBe('local');
    const c = await request(app).post('/api/ai/chat').set(auth(accountant)).send({ engagement_id: engA, period_id: pA25, message: 'كم إجمالي الأصول؟' }); expect(c.status).toBe(200); expect(c.body.engine).toBe('local'); expect(c.body.sources.length).toBeGreaterThan(0);
  });
});

describe('findings review and adjustments', () => {
  let findingId = ''; let adjId = '';
  it('reviewer accepts a finding with a note and history is kept', async () => {
    const f = (await request(app).get(`/api/findings?engagement_id=${engA}&period_id=${pA25}`).set(auth(reviewer))).body.findings; findingId = f[0].id;
    expect((await request(app).post(`/api/findings/${findingId}/status`).set(auth(accountant)).send({ status: 'accepted' })).status).toBe(403);
    expect((await request(app).post(`/api/findings/${findingId}/status`).set(auth(reviewer)).send({ status: 'accepted', note: 'مؤكدة' })).status).toBe(200);
    const d = (await request(app).get(`/api/findings/${findingId}`).set(auth(reviewer))).body; expect(d.finding.review_status).toBe('accepted'); expect(d.history).toHaveLength(1);
  });
  it('adjustments must balance, are never auto-posted, and require reviewer approval', async () => {
    const bad = await request(app).post('/api/adjustments').set(auth(accountant)).send({ engagement_id: engA, period_id: pA25, finding_id: findingId, description: 'غير متوازن', lines: [{ account_code: '1', debit: '100', credit: '0' }, { account_code: '2', debit: '0', credit: '90' }] });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/adjustments').set(auth(accountant)).send({ engagement_id: engA, period_id: pA25, finding_id: findingId, description: 'إعادة تصنيف', lines: [{ account_code: '5205', debit: '7500', credit: '0' }, { account_code: '1999', debit: '0', credit: '7500' }] });
    expect(ok.status).toBe(201); adjId = ok.body.id; expect(ok.body.adj_ref).toMatch(/^AJE-/);
    expect((await request(app).post(`/api/adjustments/${adjId}/status`).set(auth(accountant)).send({ status: 'approved' })).status).toBe(400);
    await request(app).post(`/api/adjustments/${adjId}/status`).set(auth(accountant)).send({ status: 'under_review' });
    expect((await request(app).post(`/api/adjustments/${adjId}/status`).set(auth(reviewer)).send({ status: 'approved' })).status).toBe(200);
    expect((await request(app).post(`/api/adjustments/${adjId}/status`).set(auth(reviewer)).send({ status: 'posted' })).status).toBe(400);
  });
});

describe('reports: templates, editing, approval workflow, PDF/Excel', () => {
  let reportId = '';
  it('creates a report from a system template with a snapshot and content sections', async () => {
    await request(app).put('/api/office').set(auth(admin)).send({ name_ar: 'مكتب الاختبار للمحاسبة', name_en: 'Test Accounting Office', signatory_name: 'المحاسب المسؤول' });
    const tpls = (await request(app).get('/api/report-templates').set(auth(accountant))).body.templates; expect(tpls.length).toBeGreaterThanOrEqual(14);
    const tpl = tpls.find((t: { code: string }) => t.code === 'TB_REVIEW');
    const r = await request(app).post('/api/reports').set(auth(accountant)).send({ engagement_id: engA, period_id: pA25, template_id: tpl.id });
    expect(r.status).toBe(201); reportId = r.body.id; expect(r.body.reference_no).toMatch(/^RPT-\d{4}-\d{4}$/);
    const d = (await request(app).get(`/api/reports/${reportId}`).set(auth(readonly))).body;
    expect(d.report.status).toBe('draft'); expect(d.version.content.sections.map((s: { key: string }) => s.key)).toContain('findings');
    const fsec = d.version.content.sections.find((s: { key: string }) => s.key === 'findings'); expect(fsec.blocks[0].items.length).toBeGreaterThan(5);
  });
  it('accountant edits sections (hide, reorder, add text) creating a new version', async () => {
    const d = (await request(app).get(`/api/reports/${reportId}`).set(auth(accountant))).body; const secs = d.version.content.sections;
    secs.find((s: { key: string }) => s.key === 'appendix_tb').enabled = false; secs[1].blocks.push({ type: 'paragraph', text: 'فقرة مضافة' });
    const r = await request(app).put(`/api/reports/${reportId}/content`).set(auth(accountant)).send({ sections: secs, change_note: 'تحرير' });
    expect(r.status).toBe(200); expect(r.body.version_no).toBe(2);
    expect((await request(app).put(`/api/reports/${reportId}/content`).set(auth(readonly)).send({ sections: secs })).status).toBe(403);
  });
  it('enforces the draft -> reviewed -> approved workflow with segregation of duties', async () => {
    expect((await request(app).post(`/api/reports/${reportId}/status`).set(auth(accountant)).send({ status: 'approved' })).status).toBe(400);
    // المُعد لا يستطيع تعليم تقريره كمُراجَع (لا تُدّعى مراجعة لم تحدث)
    expect((await request(app).post(`/api/reports/${reportId}/status`).set(auth(accountant)).send({ status: 'reviewed' })).status).toBe(400);
    expect((await request(app).post(`/api/reports/${reportId}/status`).set(auth(reviewer)).send({ status: 'reviewed' })).status).toBe(200);
    expect((await request(app).post(`/api/reports/${reportId}/status`).set(auth(accountant)).send({ status: 'approved' })).status).toBe(403);
    expect((await request(app).post(`/api/reports/${reportId}/status`).set(auth(reviewer)).send({ status: 'approved', note: 'معتمد' })).status).toBe(200);
    const d = (await request(app).get(`/api/reports/${reportId}`).set(auth(accountant))).body; expect(d.report.status).toBe('approved'); expect(d.version.content.meta.approver).toBe('مستخدم reviewer');
    expect((await request(app).put(`/api/reports/${reportId}/content`).set(auth(accountant)).send({ sections: d.version.content.sections })).status).toBe(400);
  });
  it('exports an Arabic A4 PDF with embedded fonts and letterhead, and an Excel workbook', async () => {
    const r = await request(app).post(`/api/reports/${reportId}/export/pdf`).set(auth(accountant)); expect(r.status).toBe(200); expect(r.body.bytes).toBeGreaterThan(50000);
    const pdf = await request(app).get(`/api/reports/${reportId}/files/${r.body.file_id}`).set(auth(readonly)).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(pdf.status).toBe(200); const buf = pdf.body as Buffer; expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const text = buf.toString('latin1'); expect(text).toContain('NotoNaskhArabic'); expect(text).toMatch(/\/Count \d+/);
    fs.writeFileSync(path.join(process.env.STORAGE_DIR!, 'test-report.pdf'), buf);
    const x = await request(app).post(`/api/reports/${reportId}/export/xlsx`).set(auth(accountant)); expect(x.status).toBe(200); expect(x.body.bytes).toBeGreaterThan(5000);
    expect((await request(app).post(`/api/reports/${reportId}/export/pdf`).set(auth(readonly))).status).toBe(403);
  }, 120000);
  it('preview HTML is RTL with the office name and report reference', async () => {
    const r = await request(app).get(`/api/reports/${reportId}/preview`).set(auth(readonly)); expect(r.status).toBe(200);
    expect(r.text).toContain('dir="rtl"'); expect(r.text).toContain('مكتب الاختبار للمحاسبة'); expect(r.text).toContain('RPT-');
  });
  it('audit log records uploads, imports, analysis, approvals and exports with the actor', async () => {
    const a = (await request(app).get('/api/audit?limit=500').set(auth(admin))).body;
    const actions = new Set(a.logs.map((l: { action: string }) => l.action));
    for (const x of ['auth.login', 'client.created', 'document.uploaded', 'import.committed', 'analysis.tb_validation', 'finding.status_changed', 'adjustment.proposed', 'report.created', 'report.approved', 'report.exported_pdf', 'report.file_downloaded']) expect(actions.has(x), x).toBe(true);
    const exp = a.logs.find((l: { action: string }) => l.action === 'report.approved'); expect(exp.user_email).toBe('rev@test.local');
  });
});

describe('backup', () => {
  it('creates a pg_dump backup and verifies it can be listed for restore', async () => {
    const r = await request(app).post('/api/system/backups').set(auth(admin)); expect(r.status).toBe(201);
    const v = await request(app).post(`/api/system/backups/${r.body.backup.name}/verify`).set(auth(admin)); expect(v.body.valid).toBe(true);
    expect((await request(app).post('/api/system/backups').set(auth(accountant))).status).toBe(403);
  }, 60000);
});
