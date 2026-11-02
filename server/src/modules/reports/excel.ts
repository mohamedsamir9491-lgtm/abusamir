import ExcelJS from 'exceljs';
import type { ReportContent, ReportBlock } from './builder.js';
import type { Snapshot } from './snapshot.js';
import { D } from '../../engine/money.js';

/** تصدير الجداول الداعمة إلى Excel بأرقام حقيقية (وليس نصوصًا) مع صيغ إجماليات قابلة للمراجعة */
export async function reportToExcel(content: ReportContent, snap: Snapshot): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Abusamir Accounting Platform'; wb.created = new Date();
  const numFmt = '#,##0.00;(#,##0.00);"-"';
  const toNum = (s: string | null | undefined): number | string | null => { if (s == null || s === '' || s === '—') return null; const t = s.replace(/[,()]/g, ''); const neg = s.startsWith('('); const n = Number(t); if (!Number.isFinite(n)) return s; return neg ? -n : n; };
  const addSheet = (name: string, columns: { key: string; label: string; numeric?: boolean }[], rows: Record<string, string | null>[], opts: { sumKeys?: string[] } = {}) => {
    const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ rightToLeft: true }] });
    ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: c.numeric ? 18 : 34 }));
    ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF4' } };
    for (const r of rows) { const row = ws.addRow(Object.fromEntries(columns.map((c) => [c.key, c.numeric ? toNum(r[c.key]) : (r[c.key] ?? '')]))); if (r._group || r._total) row.font = { bold: true }; }
    for (const c of columns) if (c.numeric) ws.getColumn(c.key).numFmt = numFmt;
    if (opts.sumKeys && rows.length) { const last = ws.rowCount; const sumRow = ws.addRow({}); sumRow.getCell(1).value = 'الإجمالي (صيغة)'; for (const k of opts.sumKeys) { const col = ws.getColumn(k).letter; sumRow.getCell(k).value = { formula: `SUM(${col}2:${col}${last})` }; sumRow.getCell(k).numFmt = numFmt; } sumRow.font = { bold: true }; }
    return ws;
  };
  const meta = wb.addWorksheet('معلومات', { views: [{ rightToLeft: true }] });
  meta.columns = [{ header: 'البند', key: 'k', width: 30 }, { header: 'القيمة', key: 'v', width: 60 }];
  for (const [k, v] of Object.entries({ 'التقرير': content.meta.title, 'المرجع': content.meta.reference_no, 'العميل': content.meta.client_name, 'الفترة': `${content.meta.period_label} (${content.meta.period_range})`, 'العملة': content.meta.currency, 'الحالة': content.meta.status, 'تاريخ الإعداد': content.meta.prepared_date, 'ملاحظة': 'الأرقام مستخرجة من المحرك الحسابي؛ جداول الإجماليات تحتوي صيغ SUM للمراجعة', 'بيانات تجريبية': content.meta.is_demo ? 'نعم' : 'لا' })) meta.addRow({ k, v });
  // ميزان المراجعة
  addSheet('ميزان المراجعة', [{ key: 'account_code', label: 'الرمز' }, { key: 'account_name', label: 'الاسم' }, { key: 'fs_line', label: 'بند القوائم' }, { key: 'account_type', label: 'النوع' }, { key: 'opening_net', label: 'افتتاحي صافي', numeric: true }, { key: 'movement_net', label: 'حركات صافي', numeric: true }, { key: 'closing_debit', label: 'ختامي مدين', numeric: true }, { key: 'closing_credit', label: 'ختامي دائن', numeric: true }, { key: 'closing_net', label: 'ختامي صافي', numeric: true }, { key: 'source_row', label: 'الصف' }],
    snap.tb_rows.map((r) => ({ ...r, source_row: r.source_row == null ? '' : String(r.source_row) })), { sumKeys: ['opening_net', 'movement_net', 'closing_debit', 'closing_credit', 'closing_net'] });
  // القوائم والنسب من أقسام التقرير
  for (const s of content.sections.filter((x) => x.enabled)) {
    const tables = s.blocks.filter((b): b is Extract<ReportBlock, { type: 'table' }> => b.type === 'table');
    tables.forEach((t, i) => addSheet(`${s.title}${tables.length > 1 ? ' ' + (i + 1) : ''}`.replace(/[\\/?*[\]:]/g, ' '), t.columns, [...t.rows, ...(t.total_rows ?? [])]));
  }
  // الملاحظات
  const fws = wb.addWorksheet('الملاحظات', { views: [{ rightToLeft: true }] });
  fws.columns = [{ header: 'المرجع', key: 'ref', width: 10 }, { header: 'الخطورة', key: 'sev', width: 10 }, { header: 'الفئة', key: 'cat', width: 18 }, { header: 'العنوان', key: 'title', width: 50 }, { header: 'الحساب', key: 'acc', width: 16 }, { header: 'المبلغ', key: 'amount', width: 16 }, { header: 'الوصف', key: 'desc', width: 80 }, { header: 'الاحتساب', key: 'calc', width: 40 }, { header: 'التوصية', key: 'rec', width: 50 }, { header: 'الحالة', key: 'status', width: 12 }];
  fws.getRow(1).font = { bold: true };
  for (const f of snap.findings as Record<string, unknown>[]) fws.addRow({ ref: f.finding_ref, sev: f.severity, cat: f.category, title: f.title, acc: f.account_code ?? '', amount: f.amount == null ? null : D(f.amount as string).toNumber(), desc: f.description, calc: f.calculation ?? '', rec: f.recommendation ?? '', status: f.review_status });
  fws.getColumn('amount').numFmt = numFmt;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
