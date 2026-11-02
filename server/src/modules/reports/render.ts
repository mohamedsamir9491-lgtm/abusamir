import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReportContent, ReportBlock } from './builder.js';
import { SEVERITY_LABELS, CATEGORY_LABELS, type Severity, type FindingCategory } from '../../engine/types.js';
import { REVIEW_STATUS_LABELS, fmtDate } from './format.js';
import { getFile, readFileData } from '../files/storage.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.resolve(here, '../../../assets/fonts');

const fontCache = new Map<string, string>();
function fontFace(family: string, file: string, weight: number): string {
  const key = file;
  if (!fontCache.has(key)) {
    const p = path.join(FONT_DIR, file);
    fontCache.set(key, fs.existsSync(p) ? fs.readFileSync(p).toString('base64') : '');
  }
  const b64 = fontCache.get(key)!;
  if (!b64) return '';
  return `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
}
export function embeddedFontsCss(): string {
  return [
    fontFace('Noto Naskh Arabic', 'noto-naskh-arabic-arabic-400-normal.woff2', 400), fontFace('Noto Naskh Arabic', 'noto-naskh-arabic-arabic-700-normal.woff2', 700),
    fontFace('Noto Naskh Arabic', 'noto-naskh-arabic-latin-400-normal.woff2', 400), fontFace('Noto Naskh Arabic', 'noto-naskh-arabic-latin-700-normal.woff2', 700),
    fontFace('Cairo', 'cairo-arabic-400-normal.woff2', 400), fontFace('Cairo', 'cairo-arabic-700-normal.woff2', 700), fontFace('Cairo', 'cairo-latin-400-normal.woff2', 400), fontFace('Cairo', 'cairo-latin-700-normal.woff2', 700),
  ].join('\n');
}

export const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nl2p = (s: string) => esc(s).split(/\n{2,}/).map((x) => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('');

export interface OfficeLetterhead { name_ar: string; name_en: string; logo_data_url: string | null; cr_number: string | null; license_number: string | null; license_authority: string | null; address_ar: string | null; phone: string | null; email: string | null; website: string | null; vat_number: string | null; footer_ar: string | null; confidentiality_ar: string; signatory_name: string | null; signatory_title: string | null; signature_data_url: string | null; stamp_data_url: string | null; use_signature: boolean; use_stamp: boolean; letterhead_bg_data_url: string | null; letterhead_template_ar: string | null; page_margin_top_mm: number; page_margin_bottom_mm: number; page_margin_left_mm: number; page_margin_right_mm: number; header_height_mm: number; footer_height_mm: number; page_numbering: string; default_font: string; primary_color: string }

async function dataUrl(fileId: string | null): Promise<string | null> {
  if (!fileId) return null;
  try { const f = await getFile(fileId); if (!f.mime_type.startsWith('image/')) return null; return `data:${f.mime_type};base64,${readFileData(f).toString('base64')}`; } catch { return null; }
}
export async function loadLetterhead(office: Record<string, unknown>): Promise<OfficeLetterhead> {
  return {
    name_ar: String(office.name_ar ?? ''), name_en: String(office.name_en ?? ''), logo_data_url: await dataUrl(office.logo_file_id as string | null), cr_number: office.cr_number as string | null, license_number: office.license_number as string | null, license_authority: office.license_authority as string | null,
    address_ar: office.address_ar as string | null, phone: office.phone as string | null, email: office.email as string | null, website: office.website as string | null, vat_number: office.vat_number as string | null, footer_ar: office.footer_ar as string | null, confidentiality_ar: String(office.confidentiality_ar ?? ''),
    signatory_name: (office.signatory_name as string | null) ?? null, signatory_title: (office.signatory_title as string | null) ?? null, signature_data_url: office.use_signature ? await dataUrl(office.signature_file_id as string | null) : null, stamp_data_url: office.use_stamp ? await dataUrl(office.stamp_file_id as string | null) : null, use_signature: !!office.use_signature, use_stamp: !!office.use_stamp,
    letterhead_bg_data_url: await dataUrl(office.letterhead_file_id as string | null), letterhead_template_ar: (office.letterhead_template_ar as string | null) || null,
    page_margin_top_mm: Number(office.page_margin_top_mm ?? 20), page_margin_bottom_mm: Number(office.page_margin_bottom_mm ?? 20), page_margin_left_mm: Number(office.page_margin_left_mm ?? 18), page_margin_right_mm: Number(office.page_margin_right_mm ?? 18),
    header_height_mm: Number(office.header_height_mm ?? 28), footer_height_mm: Number(office.footer_height_mm ?? 18), page_numbering: String(office.page_numbering ?? 'page_of_total'), default_font: String(office.default_font ?? 'Noto Naskh Arabic'), primary_color: String(office.primary_color ?? '#1f3a5f'),
  };
}

function renderBlock(b: ReportBlock): string {
  switch (b.type) {
    case 'paragraph': return b.text.trim() ? nl2p(b.text) : '';
    case 'heading': return `<h3>${esc(b.text)}</h3>`;
    case 'list': return `<${b.ordered ? 'ol' : 'ul'}>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`;
    case 'kv': return `<table class="kv"><tbody>${b.items.map((i) => `<tr><th>${esc(i.label)}</th><td>${esc(i.value)}</td></tr>`).join('')}</tbody></table>`;
    case 'note': return `<div class="note ${b.tone}">${esc(b.text)}</div>`;
    case 'page_break': return '<div class="page-break"></div>';
    case 'table': {
      const head = `<thead><tr>${b.columns.map((c) => `<th class="${c.numeric ? 'num' : ''}"${c.width ? ` style="width:${c.width}"` : ''}>${esc(c.label)}</th>`).join('')}</tr></thead>`;
      const row = (r: Record<string, string | null>, cls = '') => `<tr class="${cls}${r._group ? ' group' : ''}${r._total ? ' total' : ''}">${b.columns.map((c) => `<td class="${c.numeric ? 'num' : ''}">${esc(r[c.key] ?? '')}</td>`).join('')}</tr>`;
      return `${b.caption ? `<div class="caption">${esc(b.caption)}</div>` : ''}<table class="data">${head}<tbody>${b.rows.map((r) => row(r)).join('')}${(b.total_rows ?? []).map((r) => row(r, 'total')).join('')}</tbody></table>`;
    }
    case 'findings':
      return b.items.map((f) => `<div class="finding sev-${esc(f.severity)}">
        <div class="f-head"><span class="f-ref">${esc(f.ref)}</span><span class="f-title">${esc(f.title)}</span><span class="badge sev">${esc(SEVERITY_LABELS[f.severity as Severity] ?? f.severity)}</span><span class="badge cat">${esc(CATEGORY_LABELS[f.category as FindingCategory] ?? f.category)}</span></div>
        <table class="kv small"><tbody>
          ${f.account ? `<tr><th>الحساب / البند</th><td>${esc(f.account)}</td></tr>` : ''}${f.amount ? `<tr><th>المبلغ</th><td class="num">${esc(f.amount)}</td></tr>` : ''}${f.source ? `<tr><th>المصدر</th><td>${esc(f.source)}</td></tr>` : ''}
          ${f.calculation ? `<tr><th>الاحتساب / الدليل</th><td class="ltr-num">${esc(f.calculation)}</td></tr>` : ''}<tr><th>الوصف</th><td>${esc(f.description)}</td></tr>
          ${f.impact ? `<tr><th>الأثر المحتمل</th><td>${esc(f.impact)}</td></tr>` : ''}${f.recommendation ? `<tr><th>الإجراء الموصى به</th><td>${esc(f.recommendation)}</td></tr>` : ''}
          <tr><th>حالة المراجعة</th><td>${esc(REVIEW_STATUS_LABELS[f.status] ?? f.status)}${f.origin === 'ai' ? ' (ملاحظة مساعد ذكي - تتطلب تحققًا بشريًا)' : f.origin === 'manual' ? ' (مضافة يدويًا)' : ''}</td></tr>
        </tbody></table></div>`).join('');
  }
}

export function baseCss(lh: OfficeLetterhead): string {
  return `
  ${embeddedFontsCss()}
  :root{--primary:${lh.primary_color};--font:"${lh.default_font}","Noto Naskh Arabic","Cairo",serif;}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;direction:rtl;font-family:var(--font);font-size:11pt;line-height:1.7;color:#1a1a1a;background:#fff}
  h1{font-size:20pt;color:var(--primary);margin:0 0 6mm;text-align:center}
  h2{font-size:14pt;color:var(--primary);border-bottom:1.5px solid var(--primary);padding-bottom:1.5mm;margin:8mm 0 3mm;page-break-after:avoid}
  h3{font-size:12pt;margin:5mm 0 2mm;page-break-after:avoid}
  p{margin:0 0 2.5mm;text-align:justify}
  ul,ol{margin:0 0 3mm;padding-right:6mm}
  li{margin-bottom:1mm}
  table{border-collapse:collapse;width:100%;margin:2mm 0 4mm;font-size:10pt;page-break-inside:auto}
  thead{display:table-header-group}
  tr{page-break-inside:avoid}
  table.data th{background:var(--primary);color:#fff;padding:1.6mm 2mm;text-align:right;font-weight:700;border:1px solid #c9d1dc}
  table.data td{padding:1.4mm 2mm;border:1px solid #c9d1dc;vertical-align:top}
  table.data tr:nth-child(even) td{background:#f6f8fb}
  table.data tr.group td{background:#e8edf4;font-weight:700}
  table.data tr.total td{font-weight:700;border-top:2px solid var(--primary);background:#eef2f7}
  td.num,th.num{text-align:left;direction:ltr;font-variant-numeric:tabular-nums;white-space:nowrap}
  .ltr-num{direction:rtl;unicode-bidi:plaintext}
  table.kv{width:auto;min-width:60%}
  table.kv th{text-align:right;padding:1.2mm 2mm;background:#f1f4f8;border:1px solid #d7dde6;width:38mm;font-weight:700}
  table.kv td{padding:1.2mm 2mm;border:1px solid #d7dde6}
  table.kv.small{font-size:9.5pt;width:100%}
  .caption{font-weight:700;margin:3mm 0 1mm;color:var(--primary)}
  .note{padding:2mm 3mm;border-right:3px solid #8aa0bb;background:#f3f6fa;margin:2mm 0 3mm;font-size:10pt}
  .note.warning{border-color:#d49a00;background:#fff8e5}
  .note.danger{border-color:#c0392b;background:#fdecea}
  .finding{border:1px solid #d7dde6;border-right:4px solid #8aa0bb;border-radius:2px;padding:2mm 3mm;margin:0 0 3mm;page-break-inside:avoid}
  .finding.sev-critical{border-right-color:#8e1b1b}.finding.sev-high{border-right-color:#c0392b}.finding.sev-medium{border-right-color:#d49a00}.finding.sev-low{border-right-color:#2e86c1}.finding.sev-info{border-right-color:#7f8c8d}
  .f-head{display:flex;gap:2mm;align-items:center;flex-wrap:wrap;margin-bottom:1.5mm}
  .f-ref{font-weight:700;color:var(--primary)}.f-title{font-weight:700;flex:1}
  .badge{font-size:8.5pt;padding:0.3mm 2mm;border-radius:2mm;background:#e8edf4}.badge.sev{background:#fbe9e7}
  .page-break{page-break-after:always}
  .cover{text-align:center;padding:14mm 0 8mm}
  .cover .t{font-size:22pt;font-weight:700;color:var(--primary);margin:6mm 0 3mm}
  .cover .c{font-size:15pt;margin:2mm 0}
  .cover .meta{font-size:11pt;color:#444;margin-top:5mm}
  .conf{display:inline-block;border:1px solid #c0392b;color:#c0392b;padding:0.5mm 4mm;border-radius:1mm;font-size:9.5pt;margin-top:4mm}
  .demo{display:inline-block;background:#fff3cd;border:1px solid #d49a00;padding:1mm 4mm;margin-top:3mm;font-weight:700}
  .signatures{display:flex;gap:10mm;margin-top:8mm;page-break-inside:avoid}
  .signatures .box{flex:1;text-align:center;border-top:1px solid #555;padding-top:2mm;min-height:30mm}
  .signatures img{max-height:22mm;max-width:50mm}
  .lh{font-size:9pt;color:#333}
  .lh .name{font-size:13pt;font-weight:700;color:var(--primary)}
  .lh .en{direction:ltr;font-size:9pt;color:#555}
  `;
}

/** ترويسة المكتب (تتكرر على كل صفحة عبر position:fixed) */
function letterheadHtml(lh: OfficeLetterhead, meta: ReportContent['meta']): string {
  if (lh.letterhead_template_ar) {
    return lh.letterhead_template_ar.replace(/\{\{(\w+)\}\}/g, (_, k: string) => esc(({ name_ar: lh.name_ar, name_en: lh.name_en, cr_number: lh.cr_number, license_number: lh.license_number, address_ar: lh.address_ar, phone: lh.phone, email: lh.email, website: lh.website, vat_number: lh.vat_number, reference_no: meta.reference_no, client_name: meta.client_name, logo: '' } as Record<string, string | null>)[k] ?? ''))
      .replace(/\{\{logo\}\}/g, lh.logo_data_url ? `<img src="${lh.logo_data_url}" style="max-height:${Math.max(8, lh.header_height_mm - 6)}mm">` : '');
  }
  return `<div class="lh" style="display:flex;align-items:center;justify-content:space-between;height:${lh.header_height_mm}mm;border-bottom:1.5px solid ${lh.primary_color};padding-bottom:1.5mm">
    <div><div class="name">${esc(lh.name_ar)}</div><div class="en">${esc(lh.name_en)}</div>
      <div>${[lh.license_number ? `ترخيص رقم ${esc(lh.license_number)}${lh.license_authority ? ' - ' + esc(lh.license_authority) : ''}` : '', lh.cr_number ? `س.ت ${esc(lh.cr_number)}` : ''].filter(Boolean).join(' | ')}</div></div>
    <div style="text-align:left;direction:ltr;font-size:8.5pt;color:#555">${esc(meta.reference_no)}<br>${esc(meta.client_name)}</div>
    ${lh.logo_data_url ? `<img src="${lh.logo_data_url}" style="max-height:${Math.max(8, lh.header_height_mm - 6)}mm;max-width:45mm">` : ''}
  </div>`;
}
function footerHtml(lh: OfficeLetterhead, meta: ReportContent['meta']): string {
  const lines = [lh.address_ar, [lh.phone ? `هاتف: ${lh.phone}` : '', lh.email ? `بريد: ${lh.email}` : '', lh.website ?? ''].filter(Boolean).join(' | '), lh.vat_number ? `الرقم الضريبي: ${lh.vat_number}` : '', lh.footer_ar].filter(Boolean);
  return `<div class="lh" style="height:${lh.footer_height_mm}mm;border-top:1px solid ${lh.primary_color};padding-top:1mm;font-size:8.5pt;display:flex;justify-content:space-between;align-items:flex-start">
    <div>${lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div><div style="color:#c0392b;white-space:nowrap">${esc(meta.confidentiality)}</div></div>`;
}

export function renderReportHtml(content: ReportContent, lh: OfficeLetterhead, opts: { forPdf?: boolean; preview?: boolean } = {}): string {
  const m = content.meta;
  const sections = content.sections.filter((s) => s.enabled).sort((a, b) => a.order - b.order);
  const cover = sections.find((s) => s.type === 'cover');
  const body: string[] = [];
  body.push(`<div class="cover">
    ${lh.logo_data_url && !opts.forPdf ? '' : ''}
    <div class="t">${esc(m.title)}</div><div class="c">${esc(m.client_name)}</div>${m.client_name_en ? `<div class="en" style="direction:ltr;color:#555">${esc(m.client_name_en)}</div>` : ''}
    <div class="meta">الفترة المالية: ${esc(m.period_label)} (${esc(m.period_range)})<br>مرجع التقرير: ${esc(m.reference_no)} | تاريخ الإعداد: ${esc(fmtDate(m.prepared_date))}<br>الحالة: ${esc({ draft: 'مسودة - غير معتمد', reviewed: 'تمت المراجعة - بانتظار الاعتماد', approved: 'معتمد للإصدار', issued: 'صادر' }[m.status] ?? m.status)}</div>
    <div class="conf">${esc(m.confidentiality)}</div>${m.is_demo ? '<br><span class="demo">بيانات تجريبية - ليست سجلات عميل فعلي</span>' : ''}
  </div>`);
  if (cover) body.push(cover.blocks.map(renderBlock).join(''));
  body.push('<div class="page-break"></div>');
  for (const s of sections) {
    if (s.type === 'cover') continue;
    body.push(`<section><h2>${esc(s.title)}</h2>${s.blocks.map(renderBlock).join('')}</section>`);
    if (s.type === 'signatures') body.push(`<div class="signatures">
      <div class="box">${lh.signature_data_url ? `<img src="${lh.signature_data_url}">` : '<div style="height:22mm"></div>'}<div>${esc(lh.signatory_name ?? lh.name_ar)}</div><div style="font-size:9pt;color:#555">${esc(lh.signatory_title ?? '')}</div></div>
      <div class="box">${lh.stamp_data_url ? `<img src="${lh.stamp_data_url}">` : '<div style="height:22mm"></div>'}<div>${esc(lh.name_ar)}</div></div></div>`);
  }
  const watermark = m.status === 'draft' ? `<div style="position:fixed;top:40%;left:0;right:0;text-align:center;font-size:60pt;color:rgba(192,57,43,0.12);transform:rotate(-20deg);z-index:0;pointer-events:none">مسودة</div>` : '';
  const bg = lh.letterhead_bg_data_url ? `<img src="${lh.letterhead_bg_data_url}" style="position:fixed;top:-${lh.page_margin_top_mm}mm;left:-${lh.page_margin_left_mm}mm;width:210mm;height:297mm;z-index:-1">` : '';
  const header = letterheadHtml(lh, m); const footer = footerHtml(lh, m);
  const pageCss = opts.forPdf ? `@page{size:A4;margin:${lh.page_margin_top_mm}mm ${lh.page_margin_right_mm}mm ${lh.page_margin_bottom_mm + 7}mm ${lh.page_margin_left_mm}mm}` : `body{padding:12mm;max-width:210mm;margin:0 auto;background:#fff}`;
  // أسلوب الجدول الغلافي: thead/tfoot يتكرران على كل صفحة لحجز مساحة الترويسة والتذييل الثابتين
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(m.title)}</title><style>${baseCss(lh)}${pageCss}
    .fixed-header{position:fixed;top:0;left:0;right:0;height:${lh.header_height_mm}mm}.fixed-footer{position:fixed;bottom:0;left:0;right:0;height:${lh.footer_height_mm}mm}
    table.wrap{width:100%;border-collapse:collapse;margin:0}table.wrap>thead>tr>td{height:${lh.header_height_mm + 3}mm;padding:0;border:0}table.wrap>tfoot>tr>td{height:${lh.footer_height_mm + 6}mm;padding:0;border:0}table.wrap>tbody>tr>td{padding:0;border:0}
    ${opts.forPdf ? '' : '.fixed-header,.fixed-footer{position:static}table.wrap>thead,table.wrap>tfoot{display:none}'}
  </style></head><body>${bg}${watermark}
    <div class="fixed-header">${header}</div><div class="fixed-footer">${footer}</div>
    <table class="wrap"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>${body.join('\n')}</td></tr></tbody></table>
  </body></html>`;
}
