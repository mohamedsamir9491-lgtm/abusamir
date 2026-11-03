import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { badRequest } from '../../lib/errors.js';

const execFileP = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const PY_DIR = path.resolve(here, '../../../../python');

export interface ExtractedSheet { name: string; rows: string[][]; row_count: number }
export interface ExtractionResult {
  method: 'xlsx' | 'xls' | 'csv' | 'json' | 'pdf-text' | 'pdf-tables' | 'ocr' | 'needs_ocr' | 'text';
  sheets: ExtractedSheet[];
  confidence: number; // 0..1 ثقة الاستخراج
  warnings: string[];
  needs_human_verification: boolean;
  text_preview?: string;
}

function cellToString(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { result?: ExcelJS.CellValue; richText?: { text: string }[]; text?: string; hyperlink?: string; error?: string; formula?: string };
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if ('result' in o) return cellToString(o.result ?? '');
    if (o.text) return o.text;
    if (o.error) return '';
    return '';
  }
  return String(v);
}

export async function parseXlsx(buffer: Buffer): Promise<ExtractionResult> {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer as unknown as ArrayBuffer); } catch (e) { throw badRequest(`تعذر قراءة ملف Excel: ${(e as Error).message}`); }
  const sheets: ExtractedSheet[] = [];
  const warnings: string[] = [];
  wb.eachSheet((ws) => {
    const rows: string[][] = [];
    const maxCol = Math.min(ws.columnCount || 1, 60);
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber > 100000) return;
      const arr: string[] = [];
      for (let c = 1; c <= maxCol; c++) arr.push(cellToString(row.getCell(c).value).trim());
      rows.push(arr);
    });
    // إزالة الصفوف الفارغة في النهاية
    while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
    if (ws.columnCount > 60) warnings.push(`الورقة "${ws.name}" تحتوي أكثر من 60 عمودًا؛ تم قراءة أول 60 فقط.`);
    sheets.push({ name: ws.name, rows, row_count: rows.length });
  });
  if (!sheets.length) throw badRequest('الملف لا يحتوي على أوراق عمل');
  return { method: 'xlsx', sheets, confidence: 1, warnings, needs_human_verification: false };
}

export async function parseXls(buffer: Buffer): Promise<ExtractionResult> {
  const tmp = path.join(os.tmpdir(), `abusamir-${crypto.randomUUID()}.xls`);
  fs.writeFileSync(tmp, buffer);
  try {
    const { stdout } = await execFileP('python3', ['-I', path.join(PY_DIR, 'extract_xls.py'), tmp], { maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
    const out = JSON.parse(stdout) as { method: string; error?: string; sheets?: { name: string; rows: string[][] }[] };
    if (out.method === 'error') throw badRequest(`تعذر قراءة ملف .xls: ${out.error}. يمكن تحويله إلى .xlsx وإعادة الرفع.`);
    return { method: 'xls', sheets: (out.sheets ?? []).map((s) => ({ name: s.name, rows: s.rows, row_count: s.rows.length })), confidence: 1, warnings: [], needs_human_verification: false };
  } catch (e) {
    if ((e as { status?: number }).status === 400) throw e;
    throw badRequest('تعذر قراءة ملف .xls (يتطلب Python مع xlrd). يمكن تحويل الملف إلى .xlsx وإعادة الرفع.');
  } finally { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
}

export function decodeText(buffer: Buffer): { text: string; encoding: string } {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return { text: buffer.subarray(3).toString('utf8'), encoding: 'utf-8-bom' };
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(buffer.subarray(2)), encoding: 'utf-16le' };
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const bad = (utf8.match(/�/g) ?? []).length;
  if (bad > 0 && bad > utf8.length / 500) {
    try { return { text: new TextDecoder('windows-1256').decode(buffer), encoding: 'windows-1256' }; } catch { /* fallthrough */ }
  }
  return { text: utf8, encoding: 'utf-8' };
}

export function parseCsv(buffer: Buffer): ExtractionResult {
  const { text, encoding } = decodeText(buffer);
  const res = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy', delimitersToGuess: [',', ';', '\t', '|'] });
  const rows = res.data.map((r) => r.map((c) => (c ?? '').toString().trim()));
  const warnings = res.errors.slice(0, 5).map((e) => `سطر ${e.row ?? '?'}: ${e.message}`);
  if (encoding !== 'utf-8') warnings.push(`تم فك ترميز الملف بـ ${encoding}؛ تحقق من سلامة النصوص العربية.`);
  return { method: 'csv', sheets: [{ name: 'CSV', rows, row_count: rows.length }], confidence: res.errors.length ? 0.9 : 1, warnings, needs_human_verification: false };
}

export function parseJson(buffer: Buffer): ExtractionResult {
  let data: unknown;
  try { data = JSON.parse(buffer.toString('utf8')); } catch { throw badRequest('ملف JSON غير صالح'); }
  const arr = Array.isArray(data) ? data : (data && typeof data === 'object' && Array.isArray((data as { rows?: unknown }).rows) ? (data as { rows: unknown[] }).rows : null);
  if (!arr || !arr.length || typeof arr[0] !== 'object') throw badRequest('يجب أن يكون JSON مصفوفة من الكائنات أو {rows: [...]}');
  const keys = Array.from(new Set(arr.flatMap((o) => Object.keys(o as object))));
  const rows = [keys, ...arr.map((o) => keys.map((k) => { const v = (o as Record<string, unknown>)[k]; return v == null ? '' : String(v); }))];
  return { method: 'json', sheets: [{ name: 'JSON', rows, row_count: rows.length }], confidence: 1, warnings: [], needs_human_verification: false };
}

/** PDF (نصي أو ممسوح) والصور: python/extract_pdf.py يعيد بناء الأعمدة من مواضع الكلمات، ويستخدم OCR (tesseract) للممسوح */
export async function parsePdf(buffer: Buffer, ext = '.pdf'): Promise<ExtractionResult> {
  const tmp = path.join(os.tmpdir(), `abusamir-${crypto.randomUUID()}${ext}`);
  fs.writeFileSync(tmp, buffer);
  try {
    const { stdout } = await execFileP('python3', ['-I', path.join(PY_DIR, 'extract_pdf.py'), tmp], { maxBuffer: 128 * 1024 * 1024, timeout: 900000 });
    const out = JSON.parse(stdout) as { method: string; error?: string; confidence?: number; pages?: { page: number; text: string }[]; tables?: { name?: string; page: number; rows: string[][] }[]; warnings?: string[] };
    if (out.method === 'error') throw badRequest(`تعذر قراءة الملف: ${out.error}`);
    const text = (out.pages ?? []).map((p) => p.text).join('\n');
    if (out.method === 'needs_ocr') {
      return { method: 'needs_ocr', sheets: [], confidence: 0, warnings: [...(out.warnings ?? []), 'تعذر التعرف الضوئي على النص. ارفع نسخة أوضح (300 نقطة/بوصة) أو ملف Excel/CSV.'], needs_human_verification: true, text_preview: text.slice(0, 2000) };
    }
    const sheets: ExtractedSheet[] = (out.tables ?? []).map((t, i) => ({ name: t.name ? `${t.name}${(out.tables ?? []).length > 1 ? ` ${i + 1}` : ''}` : `جدول ${i + 1} (ص${t.page})`, rows: t.rows, row_count: t.rows.length }));
    const ocr = out.method === 'ocr';
    if (!sheets.length) {
      const rows = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\s{2,}|\t/).map((c) => c.trim()));
      sheets.push({ name: 'نص الملف', rows, row_count: rows.length });
      return { method: ocr ? 'ocr' : 'pdf-text', sheets, confidence: 0.4, warnings: [...(out.warnings ?? []), 'لم يُعَد بناء جدول من الملف؛ تم تقسيم النص تقريبيًا ويلزم التحقق البشري.'], needs_human_verification: true, text_preview: text.slice(0, 2000) };
    }
    const confidence = ocr ? Math.min(0.85, out.confidence ?? 0.7) : 0.95;
    return { method: ocr ? 'ocr' : 'pdf-tables', sheets, confidence, warnings: [...(out.warnings ?? []), ocr ? 'قُرئ الملف بالتعرف الضوئي (OCR): راجع الرموز والأرقام مقابل الأصل قبل الاعتماد؛ فحص التوازن في خطوة التحقق يكشف أي خطأ قراءة.' : 'الجدول مُعاد بناؤه من مواضع الكلمات في PDF؛ راجع ربط الأعمدة قبل الاعتماد.'], needs_human_verification: ocr, text_preview: text.slice(0, 2000) };
  } catch (e) {
    if ((e as { status?: number }).status === 400) throw e;
    throw badRequest('تعذر معالجة الملف (يتطلب Python مع pdfplumber، وtesseract للملفات الممسوحة).');
  } finally { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
}

export async function extractDocument(buffer: Buffer, originalName: string, mime: string): Promise<ExtractionResult> {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.xlsx' || mime.includes('spreadsheetml')) return parseXlsx(buffer);
  if (ext === '.xls') return parseXls(buffer);
  if (ext === '.csv' || ext === '.txt' || mime === 'text/csv') return parseCsv(buffer);
  if (ext === '.json' || mime === 'application/json') return parseJson(buffer);
  if (ext === '.pdf' || mime === 'application/pdf') return parsePdf(buffer);
  if (['.png', '.jpg', '.jpeg', '.tif', '.tiff'].includes(ext)) return parsePdf(buffer, ext);
  throw badRequest(`نوع الملف غير مدعوم للاستخراج (${ext})`);
}
