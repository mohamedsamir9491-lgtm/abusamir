import type { PoolClient } from 'pg';
import { many, one, query, withTransaction, type Queryable } from '../../db/pool.js';
import { badRequest, notFound, unprocessable } from '../../lib/errors.js';
import { parseNumber, toDb, D, toStr, splitNet, sum } from '../../engine/money.js';
import { parseDate } from '../../lib/dates.js';
import { classifyAccount, learnPrefixMap, type PrefixMap } from '../../engine/classification.js';
import { FIELDS, suggestMapping, detectHeaderRow, compositeHeaders, headerConflictsWithField, OPENING_RX, type DataType, DATA_TYPES } from './fields.js';
import { extractDocument, type ExtractionResult } from './parsers.js';
import { getFile, readFileData } from '../files/storage.js';

export interface ImportJobRow {
  id: string; document_id: string; client_id: string; engagement_id: string; period_id: string | null; data_type: DataType; status: string;
  sheet_name: string | null; header_row: number; detected_columns: string[]; column_mapping: Record<string, number>; options: Record<string, unknown>;
  extraction_meta: Record<string, unknown>; validation_report: ValidationReport | null; row_count: number; error_message: string | null;
}
export interface RowMessage { level: 'error' | 'warning' | 'info'; field?: string; message: string }
export interface ValidationReport {
  total_rows: number; data_rows: number; ok: number; warnings: number; errors: number; skipped: number;
  can_commit: boolean; blocking_reasons: string[]; summary: Record<string, unknown>; issues: { code: string; level: 'error' | 'warning' | 'info'; message: string; count: number; rows: number[] }[];
}

const MAX_ROWS = 100000;
const isTotalRow = (cells: string[]) => cells.some((c) => /^(الإجمالي|إجمالي|المجموع|مجموع|total|grand total|sum|totals)(\s|$|:)/i.test(c.trim()));

export async function createImportJob(params: { documentId: string; dataType: string; periodId: string | null; userId: string }): Promise<ImportJobRow> {
  if (!(DATA_TYPES as readonly string[]).includes(params.dataType)) throw badRequest('نوع البيانات غير معروف');
  const doc = await one<{ id: string; client_id: string; engagement_id: string; file_id: string; period_id: string | null }>(
    'SELECT id, client_id, engagement_id, file_id, period_id FROM source_documents WHERE id = $1 AND deleted_at IS NULL', [params.documentId]);
  if (!doc) throw notFound('المستند غير موجود');
  const periodId = params.periodId ?? doc.period_id;
  if (periodId) {
    const p = await one<{ engagement_id: string }>('SELECT engagement_id FROM financial_periods WHERE id = $1', [periodId]);
    if (!p || p.engagement_id !== doc.engagement_id) throw badRequest('الفترة لا تنتمي لارتباط المستند');
  }
  const f = await getFile(doc.file_id);
  const data = readFileData(f);
  let extraction: ExtractionResult;
  try { extraction = await extractDocument(data, f.original_name, f.mime_type); }
  catch (e) {
    const job = await one<ImportJobRow>(`INSERT INTO import_jobs (document_id, client_id, engagement_id, period_id, data_type, status, error_message, created_by)
      VALUES ($1,$2,$3,$4,$5,'failed',$6,$7) RETURNING *`, [doc.id, doc.client_id, doc.engagement_id, periodId, params.dataType, (e as Error).message, params.userId]);
    return job!;
  }
  const sheet = extraction.sheets[0];
  const headerRow = sheet ? detectHeaderRow(sheet.rows) : 1;
  const headers = sheet ? (sheet.rows[headerRow - 1] ?? []) : [];
  const mapping = sheet ? suggestMapping(params.dataType as DataType, compositeHeaders(sheet.rows, headerRow)) : {};
  const meta = { method: extraction.method, confidence: extraction.confidence, warnings: extraction.warnings, needs_human_verification: extraction.needs_human_verification,
    sheets: extraction.sheets.map((s) => ({ name: s.name, row_count: s.row_count })), text_preview: extraction.text_preview ?? null };
  return withTransaction(async (tx) => {
    const job = (await one<ImportJobRow>(`INSERT INTO import_jobs (document_id, client_id, engagement_id, period_id, data_type, status, sheet_name, header_row, detected_columns, column_mapping, extraction_meta, row_count, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [doc.id, doc.client_id, doc.engagement_id, periodId, params.dataType, extraction.method === 'needs_ocr' ? 'failed' : 'extracted', sheet?.name ?? null, headerRow,
        JSON.stringify(headers), JSON.stringify(mapping), JSON.stringify(meta), sheet?.row_count ?? 0, params.userId], tx))!;
    if (extraction.method === 'needs_ocr') {
      await query('UPDATE import_jobs SET error_message = $2 WHERE id = $1', [job.id, extraction.warnings.join(' ')], tx);
    }
    // تخزين الصفوف الخام لكل الأوراق (مع اسم الورقة) للتتبع
    for (const s of extraction.sheets) {
      const rows = s.rows.slice(0, MAX_ROWS);
      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const slice = rows.slice(i, i + chunk);
        const values: unknown[] = []; const ph: string[] = [];
        slice.forEach((r, j) => { const idx = values.length; values.push(job.id, i + j + 1, JSON.stringify({ sheet: s.name, cells: r })); ph.push(`($${idx + 1},$${idx + 2},$${idx + 3})`); });
        await query(`INSERT INTO imported_records (import_job_id, row_number, raw) VALUES ${ph.join(',')}`, values, tx);
      }
    }
    await query('UPDATE source_documents SET status = $2 WHERE id = $1', [doc.id, 'processing'], tx);
    return job;
  });
}

export async function getJob(id: string, db?: Queryable): Promise<ImportJobRow> {
  const j = await one<ImportJobRow>('SELECT * FROM import_jobs WHERE id = $1', [id], db);
  if (!j) throw notFound('مهمة الاستيراد غير موجودة');
  return j;
}

export async function getSheetRows(jobId: string, sheetName: string | null, limit = 0, db?: Queryable): Promise<{ row_number: number; cells: string[] }[]> {
  const rows = await many<{ row_number: number; raw: { sheet: string; cells: string[] } }>(
    `SELECT row_number, raw FROM imported_records WHERE import_job_id = $1 AND ($2::text IS NULL OR raw->>'sheet' = $2) ORDER BY row_number ${limit ? `LIMIT ${limit}` : ''}`,
    [jobId, sheetName], db);
  return rows.map((r) => ({ row_number: r.row_number, cells: r.raw.cells }));
}

export async function previewJob(jobId: string, limit = 50) {
  const job = await getJob(jobId);
  const rows = await getSheetRows(jobId, job.sheet_name, limit + job.header_row);
  return { job, fields: FIELDS[job.data_type], rows };
}

export async function updateMapping(jobId: string, input: { sheet_name?: string; header_row?: number; column_mapping?: Record<string, number>; options?: Record<string, unknown> }) {
  const job = await getJob(jobId);
  if (['committed', 'cancelled'].includes(job.status)) throw badRequest('لا يمكن تعديل مهمة مكتملة أو ملغاة');
  const sheet = input.sheet_name ?? job.sheet_name;
  const rows = await getSheetRows(jobId, sheet, 30);
  if (!rows.length) throw badRequest('الورقة المحددة لا تحتوي على صفوف');
  const headerRow = input.header_row ?? (input.sheet_name && input.sheet_name !== job.sheet_name ? detectHeaderRow(rows.map((r) => r.cells)) : job.header_row);
  const headers = rows.find((r) => r.row_number === headerRow)?.cells ?? [];
  const mapping = input.column_mapping ?? (input.sheet_name !== undefined && input.sheet_name !== job.sheet_name || (input.header_row !== undefined && input.header_row !== job.header_row) ? suggestMapping(job.data_type, compositeHeaders(rows.map((r) => r.cells), headerRow)) : job.column_mapping);
  await query(`UPDATE import_jobs SET sheet_name = $2, header_row = $3, detected_columns = $4, column_mapping = $5, options = $6, status = 'mapped', validation_report = NULL, updated_at = now() WHERE id = $1`,
    [jobId, sheet, headerRow, JSON.stringify(headers), JSON.stringify(mapping), JSON.stringify({ ...job.options, ...(input.options ?? {}) })]);
  return getJob(jobId);
}

// ---------------- التحقق ----------------
type Mapped = Record<string, string | null>;

function mapRow(job: ImportJobRow, cells: string[]): { mapped: Mapped; messages: RowMessage[] } {
  const messages: RowMessage[] = [];
  const mapped: Mapped = {};
  for (const f of FIELDS[job.data_type]) {
    const idx = job.column_mapping[f.key];
    if (idx === undefined || idx === null) { mapped[f.key] = null; continue; }
    const raw = (cells[idx] ?? '').toString().trim();
    if (raw === '') { mapped[f.key] = null; if (f.required) messages.push({ level: 'error', field: f.key, message: `الحقل المطلوب "${f.label_ar}" فارغ` }); continue; }
    if (f.type === 'number') {
      const n = parseNumber(raw);
      if (n === null) { mapped[f.key] = null; messages.push({ level: 'error', field: f.key, message: `القيمة "${raw}" في "${f.label_ar}" ليست رقمًا صالحًا` }); }
      else mapped[f.key] = n.toFixed(4);
    } else if (f.type === 'date') {
      const d = parseDate(raw);
      if (!d) { mapped[f.key] = null; messages.push({ level: 'warning', field: f.key, message: `تعذر تفسير التاريخ "${raw}" في "${f.label_ar}"` }); }
      else mapped[f.key] = d;
    } else mapped[f.key] = raw;
  }
  return { mapped, messages };
}

export async function validateJob(jobId: string): Promise<{ job: ImportJobRow; report: ValidationReport }> {
  const job = await getJob(jobId);
  if (['committed', 'cancelled', 'failed'].includes(job.status)) throw badRequest('حالة المهمة لا تسمح بالتحقق');
  const defs = FIELDS[job.data_type];
  const required = defs.filter((f) => f.required).map((f) => f.key);
  const blocking: string[] = [];
  for (const r of required) if (job.column_mapping[r] === undefined) blocking.push(`لم يُربط الحقل المطلوب "${defs.find((f) => f.key === r)!.label_ar}"`);
  if (job.data_type === 'trial_balance') {
    const m = job.column_mapping;
    const hasClosing = m.closing_debit !== undefined || m.closing_credit !== undefined || m.closing_balance !== undefined;
    const hasOpenMov = (m.opening_debit !== undefined || m.opening_balance !== undefined) && (m.period_debit !== undefined || m.period_credit !== undefined);
    if (!hasClosing && !hasOpenMov) blocking.push('يجب ربط أعمدة الرصيد الختامي، أو الأرصدة الافتتاحية مع الحركات على الأقل');
  }
  if (job.data_type === 'journal_entries' && job.column_mapping.debit === undefined && job.column_mapping.credit === undefined) blocking.push('يجب ربط عمودي المدين والدائن');
  if (job.data_type === 'bank_statement' && job.column_mapping.debit === undefined && job.column_mapping.credit === undefined && job.column_mapping.amount === undefined) blocking.push('يجب ربط أعمدة المبلغ أو المدين/الدائن');

  const rows = await getSheetRows(jobId, job.sheet_name);
  // تطابق عناوين الأعمدة مع الحقول المربوطة: يمنع مثلًا ربط «الرصيد الافتتاحي» بحقل الرصيد الختامي (التوازن وحده لا يكشف ذلك)
  const grid: string[][] = []; for (const r of rows) grid[r.row_number - 1] = r.cells;
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
  const heads = compositeHeaders(grid, job.header_row);
  const headerWarnings: string[] = [];
  for (const [key, col] of Object.entries(job.column_mapping)) {
    const f = defs.find((x) => x.key === key); const h = (heads[col] ?? '').trim();
    if (f && h && headerConflictsWithField(h, f.group)) blocking.push(`العمود «${h}» مربوط بالحقل «${f.label_ar}» وعنوانه يدل على غير ذلك. صحّح الربط قبل الاعتماد.`);
  }
  if (job.data_type === 'trial_balance') {
    const m = job.column_mapping; const mappedCols = new Set(Object.values(m));
    const openingMapped = m.opening_balance !== undefined || m.opening_debit !== undefined || m.opening_credit !== undefined;
    if (!openingMapped) heads.forEach((h, i) => { if (!mappedCols.has(i) && h && OPENING_RX.test(h)) headerWarnings.push(`العمود «${h}» يبدو رصيدًا افتتاحيًا لكنه غير مربوط؛ اربطه ليُفحص اتساق (الافتتاحي + الحركة = الختامي).`); });
  }
  const issues = new Map<string, ValidationReport['issues'][number]>();
  const addIssue = (code: string, level: 'error' | 'warning' | 'info', message: string, row: number) => {
    const cur = issues.get(code) ?? { code, level, message, count: 0, rows: [] };
    cur.count++; if (cur.rows.length < 50) cur.rows.push(row); issues.set(code, cur);
  };
  let ok = 0, warnings = 0, errors = 0, skipped = 0, dataRows = 0;
  const seenCodes = new Map<string, number>();
  const totals: Record<string, ReturnType<typeof D>> = {};
  const updates: { row: number; mapped: Mapped; status: string; messages: RowMessage[] }[] = [];
  let emptyMappedStreak = 0;

  for (const r of rows) {
    if (r.row_number <= job.header_row) { updates.push({ row: r.row_number, mapped: {}, status: 'skipped', messages: [{ level: 'info', message: 'صف عنوان' }] }); skipped++; continue; }
    const allEmpty = r.cells.every((c) => c === '');
    if (allEmpty) { updates.push({ row: r.row_number, mapped: {}, status: 'skipped', messages: [{ level: 'info', message: 'صف فارغ' }] }); skipped++; continue; }
    const { mapped, messages } = mapRow(job, r.cells);
    dataRows++;
    // صفوف الإجماليات
    const keyField = job.data_type === 'trial_balance' ? 'account_code' : defs.find((f) => f.required)?.key;
    if (keyField && !mapped[keyField] && isTotalRow(r.cells)) {
      updates.push({ row: r.row_number, mapped, status: 'skipped', messages: [{ level: 'info', message: 'صف إجمالي - تم تجاهله' }] }); skipped++; dataRows--;
      addIssue('total_row', 'info', 'صفوف إجماليات تم تجاهلها', r.row_number); continue;
    }
    if (Object.values(mapped).every((v) => v === null)) { emptyMappedStreak++; updates.push({ row: r.row_number, mapped, status: 'skipped', messages: [{ level: 'info', message: 'لا توجد قيم في الأعمدة المربوطة' }] }); skipped++; dataRows--; continue; }
    emptyMappedStreak = 0;
    // فحوصات خاصة بالنوع
    if (job.data_type === 'trial_balance') {
      const code = mapped.account_code;
      if (code) { const prev = seenCodes.get(code); if (prev) { messages.push({ level: 'warning', field: 'account_code', message: `رمز الحساب ${code} مكرر (الصف ${prev})` }); addIssue('duplicate_code', 'warning', 'رموز حسابات مكررة', r.row_number); } else seenCodes.set(code, r.row_number); }
      if (!mapped.account_name) addIssue('missing_name', 'info', 'حسابات بدون اسم', r.row_number);
      for (const k of ['opening_debit', 'opening_credit', 'period_debit', 'period_credit', 'closing_debit', 'closing_credit']) {
        if (mapped[k] && D(mapped[k]).lt(0)) { messages.push({ level: 'warning', field: k, message: `قيمة سالبة في ${k}` }); addIssue('negative_value', 'warning', 'قيم سالبة في أعمدة المدين/الدائن', r.row_number); }
      }
      // اتساق السطر: الافتتاحي + مدين الحركة − دائن الحركة = الختامي (عند ربط الثلاثة)
      const net = (bal: string, dr: string, cr: string) => mapped[bal] != null ? D(mapped[bal]!) : (mapped[dr] != null || mapped[cr] != null) ? D(mapped[dr] ?? 0).minus(mapped[cr] ?? 0) : null;
      const op = net('opening_balance', 'opening_debit', 'opening_credit'), cl = net('closing_balance', 'closing_debit', 'closing_credit');
      if (op && cl && (mapped.period_debit != null || mapped.period_credit != null)) {
        const diff = op.plus(mapped.period_debit ?? 0).minus(mapped.period_credit ?? 0).minus(cl);
        if (diff.abs().gt('0.01')) { messages.push({ level: 'warning', field: '_rf', message: `الافتتاحي + الحركة لا يساوي الختامي (الفرق ${toStr(diff)})` }); addIssue('rollforward', 'warning', 'أسطر لا يتسق فيها الافتتاحي + الحركة مع الختامي (راجع ربط الأعمدة)', r.row_number); }
      }
      for (const k of Object.keys(mapped)) if (mapped[k] && defs.find((f) => f.key === k)?.type === 'number') totals[k] = (totals[k] ?? D(0)).plus(mapped[k]!);
    } else if (job.data_type === 'journal_entries' || job.data_type === 'general_ledger') {
      if (!mapped.debit && !mapped.credit) { messages.push({ level: 'warning', message: 'سطر بدون مدين أو دائن' }); addIssue('no_amount', 'warning', 'أسطر بدون مبالغ', r.row_number); }
      if (!mapped.entry_date) addIssue('missing_date', 'warning', 'أسطر بدون تاريخ صالح', r.row_number);
      for (const k of ['debit', 'credit']) if (mapped[k]) totals[k] = (totals[k] ?? D(0)).plus(mapped[k]!);
    } else {
      for (const k of Object.keys(mapped)) if (mapped[k] && defs.find((f) => f.key === k)?.type === 'number') totals[k] = (totals[k] ?? D(0)).plus(mapped[k]!);
    }
    for (const m of messages) if (m.field !== '_rf') addIssue(`${m.level}:${m.field ?? 'row'}`, m.level, m.message.replace(/"[^"]*"/g, '…'), r.row_number);
    const status = messages.some((m) => m.level === 'error') ? 'error' : messages.some((m) => m.level === 'warning') ? 'warning' : 'ok';
    if (status === 'error') { errors++; for (const k of Object.keys(mapped)) if (mapped[k] && defs.find((f) => f.key === k)?.type === 'number') totals[k] = (totals[k] ?? D(0)).minus(mapped[k]!); }
    else if (status === 'warning') warnings++; else ok++;
    updates.push({ row: r.row_number, mapped, status, messages });
  }
  headerWarnings.forEach((w, i) => addIssue(`unmapped_opening_${i}`, 'warning', w, job.header_row));
  if (dataRows === 0) blocking.push('لا توجد صفوف بيانات بعد صف العناوين');
  if (errors > 0 && !job.options.allow_error_rows) blocking.push(`${errors} صفًا يحتوي أخطاء. صحّح الربط أو فعّل خيار "تجاهل الصفوف الخاطئة" (مع تسجيل ذلك).`);
  if (job.period_id === null && job.data_type !== 'chart_of_accounts') blocking.push('يجب تحديد الفترة المالية قبل الاعتماد');

  const summary: Record<string, unknown> = { totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, toStr(v)])) };
  if (job.data_type === 'trial_balance') {
    const t = (k: string) => totals[k] ?? D(0);
    const cl = job.column_mapping.closing_balance !== undefined ? null : t('closing_debit').minus(t('closing_credit'));
    summary.balance_check = {
      opening_difference: job.column_mapping.opening_balance !== undefined ? toStr(t('opening_balance')) : toStr(t('opening_debit').minus(t('opening_credit'))),
      movement_difference: toStr(t('period_debit').minus(t('period_credit'))),
      closing_difference: cl === null ? toStr(t('closing_balance')) : toStr(cl),
    };
    summary.unique_accounts = seenCodes.size;
  }
  if (job.data_type === 'journal_entries' || job.data_type === 'general_ledger') summary.balance_check = { difference: toStr((totals.debit ?? D(0)).minus(totals.credit ?? D(0))) };
  const report: ValidationReport = { total_rows: rows.length, data_rows: dataRows, ok, warnings, errors, skipped, can_commit: blocking.length === 0, blocking_reasons: blocking, summary,
    issues: [...issues.values()].sort((a, b) => ({ error: 0, warning: 1, info: 2 }[a.level] - { error: 0, warning: 1, info: 2 }[b.level])) };

  await withTransaction(async (tx) => {
    const chunk = 500;
    for (let i = 0; i < updates.length; i += chunk) {
      const slice = updates.slice(i, i + chunk);
      const values: unknown[] = []; const ph: string[] = [];
      slice.forEach((u) => { const idx = values.length; values.push(u.row, JSON.stringify(u.mapped), u.status, JSON.stringify(u.messages)); ph.push(`($${idx + 1}::int,$${idx + 2}::jsonb,$${idx + 3}::text,$${idx + 4}::jsonb)`); });
      await query(`UPDATE imported_records AS ir SET mapped = v.mapped, status = v.status, messages = v.messages FROM (VALUES ${ph.join(',')}) AS v(row_number, mapped, status, messages)
        WHERE ir.import_job_id = $${values.length + 1} AND ir.row_number = v.row_number AND ($${values.length + 2}::text IS NULL OR ir.raw->>'sheet' = $${values.length + 2})`, [...values, jobId, job.sheet_name], tx);
    }
    await query(`UPDATE import_jobs SET status = 'validated', validation_report = $2, updated_at = now() WHERE id = $1`, [jobId, JSON.stringify(report)], tx);
  });
  return { job: await getJob(jobId), report };
}

export async function listRecords(jobId: string, opts: { status?: string; offset?: number; limit?: number }) {
  const job = await getJob(jobId);
  const rows = await many(`SELECT row_number, raw, mapped, status, messages FROM imported_records WHERE import_job_id = $1 AND ($2::text IS NULL OR raw->>'sheet' = $2)
    AND ($3::text IS NULL OR status = $3) ORDER BY row_number OFFSET $4 LIMIT $5`, [jobId, job.sheet_name, opts.status ?? null, opts.offset ?? 0, Math.min(opts.limit ?? 100, 1000)]);
  const total = await one<{ c: string }>(`SELECT count(*) AS c FROM imported_records WHERE import_job_id = $1 AND ($2::text IS NULL OR raw->>'sheet' = $2) AND ($3::text IS NULL OR status = $3)`, [jobId, job.sheet_name, opts.status ?? null]);
  return { records: rows, total: Number(total?.c ?? 0) };
}

// ---------------- الاعتماد (الترحيل إلى الجداول الهدف) ----------------
export async function commitJob(jobId: string, userId: string): Promise<{ inserted: number; replaced: number; job: ImportJobRow }> {
  const job = await getJob(jobId);
  if (job.status !== 'validated' || !job.validation_report) throw badRequest('يجب التحقق من البيانات قبل الاعتماد');
  if (!job.validation_report.can_commit) throw unprocessable('تقرير التحقق يمنع الاعتماد', job.validation_report.blocking_reasons);
  const records = await many<{ row_number: number; mapped: Mapped; status: string }>(
    `SELECT row_number, mapped, status FROM imported_records WHERE import_job_id = $1 AND ($2::text IS NULL OR raw->>'sheet' = $2) AND status IN ('ok','warning') ORDER BY row_number`, [jobId, job.sheet_name]);
  const replace = job.options.replace_existing !== false;
  return withTransaction(async (tx) => {
    let inserted = 0; let replaced = 0;
    const base = [job.client_id, job.engagement_id, job.period_id];
    switch (job.data_type) {
      case 'trial_balance': {
        if (replace) { const r = await query('DELETE FROM trial_balance_entries WHERE period_id = $1', [job.period_id], tx); replaced = r.rowCount ?? 0; }
        const prefixMap = learnPrefixMap(records.map((r) => ({ code: r.mapped.account_code ?? '', name: r.mapped.account_name })));
        for (const rec of records) {
          const m = rec.mapped;
          let od = D(m.opening_debit), oc = D(m.opening_credit), pd = D(m.period_debit), pc = D(m.period_credit), cd = D(m.closing_debit), cc = D(m.closing_credit);
          if (m.opening_balance != null && job.column_mapping.opening_debit === undefined) ({ debit: od, credit: oc } = splitNet(m.opening_balance));
          if (m.closing_balance != null && job.column_mapping.closing_debit === undefined) ({ debit: cd, credit: cc } = splitNet(m.closing_balance));
          // إن غابت الأعمدة الختامية نحسبها من الافتتاحي + الحركات
          if (job.column_mapping.closing_debit === undefined && job.column_mapping.closing_credit === undefined && job.column_mapping.closing_balance === undefined) ({ debit: cd, credit: cc } = splitNet(od.minus(oc).plus(pd).minus(pc)));
          await query(`INSERT INTO trial_balance_entries (client_id, engagement_id, period_id, import_job_id, account_code, account_name, opening_debit, opening_credit, period_debit, period_credit, closing_debit, closing_credit, source_row)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [...base, jobId, m.account_code, m.account_name, toDb(od), toDb(oc), toDb(pd), toDb(pc), toDb(cd), toDb(cc), rec.row_number], tx);
          inserted++;
          await ensureAccount(tx, job.client_id, m.account_code!, m.account_name, cd.minus(cc).isZero() ? 'zero' : cd.minus(cc).gt(0) ? 'debit' : 'credit', prefixMap);
        }
        break;
      }
      case 'journal_entries': case 'general_ledger': {
        if (replace) { const r = await query('DELETE FROM journal_entries WHERE period_id = $1', [job.period_id], tx); replaced = r.rowCount ?? 0; }
        const groups = new Map<string, { entry_no: string | null; date: string | null; desc: string | null; ref: string | null; row: number; lines: Mapped[] }>();
        for (const rec of records) {
          const m = rec.mapped;
          const key = m.entry_no ?? `${m.entry_date ?? ''}|${m.reference ?? ''}|${rec.row_number}`;
          if (!groups.has(key)) groups.set(key, { entry_no: m.entry_no, date: m.entry_date, desc: m.description, ref: m.reference, row: rec.row_number, lines: [] });
          groups.get(key)!.lines.push({ ...m, _row: String(rec.row_number) });
        }
        for (const g of groups.values()) {
          const je = await one<{ id: string }>(`INSERT INTO journal_entries (client_id, engagement_id, period_id, import_job_id, entry_no, entry_date, description, reference, source_row) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [...base, jobId, g.entry_no, g.date, g.desc, g.ref, g.row], tx);
          for (const l of g.lines) {
            await query(`INSERT INTO journal_lines (journal_entry_id, account_code, account_name, debit, credit, description, counterparty, source_row) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
              [je!.id, l.account_code, l.account_name, toDb(l.debit ?? 0), toDb(l.credit ?? 0), l.description, l.counterparty, Number(l._row)], tx);
            inserted++;
          }
        }
        break;
      }
      case 'chart_of_accounts': {
        for (const rec of records) {
          const m = rec.mapped;
          const cls = classifyAccount(m.code!, m.name_ar);
          const type = normalizeType(m.account_type) ?? cls.account_type;
          const nb = normalizeNb(m.normal_balance) ?? (type === 'asset' || type === 'expense' ? 'debit' : type === 'other' ? cls.normal_balance : 'credit');
          await query(`INSERT INTO chart_of_accounts (client_id, code, name_ar, name_en, account_type, sub_type, normal_balance, parent_code, fs_line_code, is_suspense, is_bank)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (client_id, code) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = COALESCE(EXCLUDED.name_en, chart_of_accounts.name_en), account_type = EXCLUDED.account_type,
              normal_balance = EXCLUDED.normal_balance, parent_code = EXCLUDED.parent_code, fs_line_code = COALESCE(EXCLUDED.fs_line_code, chart_of_accounts.fs_line_code), updated_at = now()`,
            [job.client_id, m.code, m.name_ar, m.name_en, type, cls.sub_type, nb, m.parent_code, m.fs_line_code && (await one('SELECT 1 FROM fs_line_items WHERE code = $1', [m.fs_line_code], tx)) ? m.fs_line_code : cls.fs_line_code, cls.is_suspense, cls.is_bank], tx);
          inserted++;
        }
        break;
      }
      default: {
        const typeMap: Record<string, string> = { receivables: 'receivable', payables: 'payable', inventory: 'inventory', fixed_assets: 'fixed_asset', bank_statement: 'bank_transaction', financial_statements: 'fs_line' };
        const rt = typeMap[job.data_type];
        if (replace) { const r = await query('DELETE FROM subledger_records WHERE period_id = $1 AND record_type = $2', [job.period_id, rt], tx); replaced = r.rowCount ?? 0; }
        for (const rec of records) {
          const m = rec.mapped;
          const extra: Record<string, unknown> = {};
          for (const k of Object.keys(m)) if (!['record_date', 'reference', 'counterparty', 'description', 'amount', 'debit', 'credit', 'balance', 'quantity'].includes(k) && m[k] != null) extra[k] = m[k];
          const amount = m.amount ?? (job.data_type === 'fixed_assets' ? m.cost : null);
          await query(`INSERT INTO subledger_records (client_id, engagement_id, period_id, import_job_id, record_type, record_date, reference, counterparty, description, amount, debit, credit, balance, quantity, data, source_row)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
            [...base, jobId, rt, m.record_date ?? null, m.reference ?? null, m.counterparty ?? null, m.description ?? null, amount == null ? null : toDb(amount),
              m.debit == null ? null : toDb(m.debit), m.credit == null ? null : toDb(m.credit), m.balance == null ? null : toDb(m.balance), m.quantity == null ? null : toDb(m.quantity), JSON.stringify(extra), rec.row_number], tx);
          inserted++;
        }
      }
    }
    await query(`UPDATE import_jobs SET status = 'committed', committed_at = now(), committed_by = $2, updated_at = now() WHERE id = $1`, [jobId, userId], tx);
    await query(`UPDATE source_documents SET status = 'imported', document_type = CASE WHEN document_type = 'unknown' THEN $2 ELSE document_type END WHERE id = $1`, [job.document_id, job.data_type], tx);
    return { inserted, replaced, job: await getJob(jobId, tx) };
  });
}

async function ensureAccount(tx: PoolClient, clientId: string, code: string, name: string | null, side: 'debit' | 'credit' | 'zero', prefixMap: PrefixMap) {
  const exists = await one<{ classification_source: string }>('SELECT classification_source FROM chart_of_accounts WHERE client_id = $1 AND code = $2', [clientId, code], tx);
  const c = classifyAccount(code, name, side, prefixMap);
  if (exists) {
    // الحسابات المصنفة آليًا تُحدَّث مع كل استيراد؛ التصنيف اليدوي للمحاسب لا يُمس
    if (exists.classification_source === 'auto') await query(`UPDATE chart_of_accounts SET name_ar = COALESCE($3, name_ar), account_type = $4, sub_type = $5, normal_balance = $6, fs_line_code = $7, is_suspense = $8, is_bank = $9, classification_confidence = $10, updated_at = now() WHERE client_id = $1 AND code = $2`,
      [clientId, code, name, c.account_type, c.sub_type, c.normal_balance, c.fs_line_code, c.is_suspense, c.is_bank, c.confidence.toFixed(2)], tx);
    return;
  }
  await query(`INSERT INTO chart_of_accounts (client_id, code, name_ar, account_type, sub_type, normal_balance, fs_line_code, is_suspense, is_bank, classification_confidence, classification_source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'auto') ON CONFLICT DO NOTHING`,
    [clientId, code, name ?? code, c.account_type, c.sub_type, c.normal_balance, c.fs_line_code, c.is_suspense, c.is_bank, c.confidence.toFixed(2)], tx);
}
function normalizeType(v: string | null): 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | null {
  if (!v) return null; const s = v.toLowerCase();
  if (/(أصل|asset)/.test(s)) return 'asset'; if (/(التزام|خصوم|liabilit)/.test(s)) return 'liability'; if (/(ملكية|equity|capital)/.test(s)) return 'equity';
  if (/(إيراد|revenue|income|sales)/.test(s)) return 'revenue'; if (/(مصروف|مصاريف|expense|cost)/.test(s)) return 'expense'; return null;
}
function normalizeNb(v: string | null): 'debit' | 'credit' | null {
  if (!v) return null; const s = v.toLowerCase();
  if (/(مدين|debit|dr)/.test(s)) return 'debit'; if (/(دائن|credit|cr)/.test(s)) return 'credit'; return null;
}
export { sum };
