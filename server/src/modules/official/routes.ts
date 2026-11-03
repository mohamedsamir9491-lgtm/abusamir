/** البيانات النظامية: استخراج محلي من المستندات الرسمية، مراجعة واعتماد، تطبيق على العميل والمجموعة، ومطابقة بالدفاتر */
import { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { many, one, query, withTransaction } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { notFound, badRequest } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { getFile, readFileData } from '../files/storage.js';
import { parseOfficial, type OfficialFields, type PageText } from './parse.js';
import { loadTbEntries, loadAccountMap, upsertFindings } from '../analysis/service.js';
import { buildStatements } from '../../engine/statements.js';
import { resolveMeta, prefixMapFor } from '../../engine/trialBalance.js';
import { net, D, toStr } from '../../engine/money.js';
import { listComponents, nameTokens, hits } from '../engagements/group.js';
import type { EngineFinding } from '../../engine/types.js';

const execFileP = promisify(execFile);
const PY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../python');
export const OFFICIAL_TYPES = ['articles_of_association', 'commercial_registration', 'zakat_certificate', 'vat_certificate', 'municipal_license', 'partners_resolution', 'contract'] as const;
export const officialRouter = Router();
officialRouter.use(authenticate, requirePermission('clients.view'));

async function extractPages(data: Buffer, name: string): Promise<{ pages: PageText[]; warnings: string[] }> {
  const ext = path.extname(name).toLowerCase() || '.pdf';
  const tmp = path.join(os.tmpdir(), `abusamir-off-${crypto.randomUUID()}${ext}`);
  fs.writeFileSync(tmp, data);
  try {
    const { stdout } = await execFileP('python3', ['-I', path.join(PY_DIR, 'extract_text.py'), tmp], { maxBuffer: 128 * 1024 * 1024, timeout: 900000 });
    return JSON.parse(stdout);
  } catch (e) { throw badRequest(`تعذر قراءة المستند: ${(e as Error).message.slice(0, 200)}`); } finally { fs.rmSync(tmp, { force: true }); }
}

/** الشركة صاحبة المستند وسياقها: الميزان الحالي، سجل العميل، ونسبة الملكية في المجموعة */
async function companyContext(engagementId: string) {
  const e = await one<{ id: string; client_id: string; group_engagement_id: string | null; ownership_pct: string | null; entity_role: string | null }>('SELECT id, client_id, group_engagement_id, ownership_pct::text AS ownership_pct, entity_role FROM engagements WHERE id = $1', [engagementId]);
  if (!e) throw notFound('الارتباط غير موجود');
  const client = await one<{ legal_name_ar: string; entity_type: string; fiscal_year_end_month: number; fiscal_year_end_day: number; cr_number: string | null }>('SELECT legal_name_ar, entity_type, fiscal_year_end_month, fiscal_year_end_day, cr_number FROM clients WHERE id = $1', [e.client_id]);
  const period = await one<{ id: string; label: string; end_date: string }>(`SELECT id, label, end_date::text AS end_date FROM financial_periods WHERE engagement_id = $1 ORDER BY (role = 'current') DESC, end_date DESC LIMIT 1`, [engagementId]);
  const parentName = e.group_engagement_id ? (await one<{ n: string }>('SELECT c.legal_name_ar AS n FROM engagements g JOIN clients c ON c.id = g.client_id WHERE g.id = $1', [e.group_engagement_id]))?.n ?? null : null;
  return { e, client: client!, period, parentName };
}

/** مطابقة البيانات النظامية بالدفاتر وسجل العميل والمجموعة → ملاحظات قابلة للتتبع */
export async function officialChecks(rec: { id: string; engagement_id: string; fields: OfficialFields; doc_kind: string }, docTitle: string): Promise<EngineFinding[]> {
  const { e, client, period, parentName } = await companyContext(rec.engagement_id);
  const F = rec.fields; const out: EngineFinding[] = []; const key = (r: string) => `DOC:${r}`; // مفتاح على مستوى الشركة: المستندات المتعددة لا تكرر الملاحظة نفسها
  const src = { document: docTitle };
  const push = (x: Omit<EngineFinding, 'dedupe_key' | 'evidence'> & { evidence?: Record<string, unknown> }, rule: string) => out.push({ ...x, evidence: { ...src, ...(x.evidence ?? {}) }, dedupe_key: key(rule) });
  // الدفاتر
  let shareCap: number | null = null, addCap = 0; const accts: { code: string; name: string; fs: string; net: number }[] = [];
  if (period) {
    const entries = await loadTbEntries(period.id);
    if (entries.length) {
      const accounts = await loadAccountMap(e.client_id); const pm = prefixMapFor(entries);
      for (const t of entries) { const m = resolveMeta(t, accounts, pm); accts.push({ code: t.account_code, name: t.account_name ?? '', fs: m.fs_line_code, net: Number(toStr(net(t.closing_debit, t.closing_credit))) }); }
      const st = buildStatements({ current: entries, accounts, periodLabel: period.label });
      const line = (c: string) => st.sfp.lines.find((l) => l.code === c);
      shareCap = line('SHARE_CAPITAL') ? Number(line('SHARE_CAPITAL')!.value) : 0; addCap = line('ADDITIONAL_CAPITAL') ? Number(line('ADDITIONAL_CAPITAL')!.value) : 0;
    }
  }
  const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cap = F.capital?.value ?? null, paid = F.paid_capital?.value ?? null;
  if (cap != null && shareCap != null && Math.abs(cap - shareCap) > 1)
    push({ rule_code: 'DOC-001', category: 'accounting_issue', severity: 'high', title: `رأس المال في ${docTitle} (${money(cap)}) يختلف عن رصيده في الميزان (${money(shareCap)})`, description: `رأس المال حسب المستند ${money(cap)} بينما رصيد حساب رأس المال في ميزان ${period!.label} ${money(shareCap)}؛ الفرق ${money(shareCap - cap)}. يلزم مطابقة القيد بقرار زيادة/تخفيض رأس المال أو تصحيح التصنيف.`, amount: String(Math.abs(shareCap - cap)), recommendation: 'طلب قرار الشركاء/الجمعية المعدّل لرأس المال أو تصحيح القيد.', evidence: { capital_doc: cap, capital_books: shareCap } }, 'capital');
  if (cap != null && paid != null && paid < cap - 1 && shareCap != null) {
    const unpaid = cap - paid;
    const recv = accts.filter((a) => a.net > 0 && (/اكتتاب|غير\s?مدفوع|غير المدفوع/.test(a.name) || (a.fs === 'DUE_FROM_SHAREHOLDERS' && /اكتتاب|رأس المال|راس المال/.test(a.name))));
    const recvTotal = recv.reduce((s, a) => s + a.net, 0);
    if (Math.abs(recvTotal - unpaid) > 1)
      push({ rule_code: 'DOC-002', category: 'accounting_issue', severity: 'high', title: `رأس المال المدفوع حسب ${docTitle} ${money(paid)} من ${money(cap)}، والجزء غير المدفوع (${money(unpaid)}) غير مثبت في الدفاتر`, description: `المستند ينص على أن المدفوع من رأس المال ${money(paid)} والباقي ${money(unpaid)} يُستوفى لاحقًا، بينما يظهر رأس المال في الدفاتر ${money(shareCap)} دون حساب مستحق على المساهمين بقيمة الجزء غير المدفوع${recv.length ? ` (الموجود: ${money(recvTotal)})` : ''}. يُعرض رأس المال المكتتب غير المدفوع مطروحًا من حقوق الملكية (أو كمستحق على المساهمين عند المطالبة به)، فتُقاس حقوق الملكية والقيمة الدفترية على المدفوع فعلًا.`, amount: String(unpaid), impact: `قد تكون حقوق الملكية الدفترية مبالغًا فيها بما يصل إلى ${money(unpaid)} ما لم يثبت السداد.`, recommendation: 'طلب كشف حساب البنك وإثبات سداد رأس المال، أو إثبات الجزء غير المدفوع مطروحًا من حقوق الملكية.', evidence: { capital: cap, paid, unpaid, books_capital: shareCap, receivables_found: recvTotal } }, 'paid');
  }
  if (F.fully_paid?.value === true && parentName) {
    const t = nameTokens(parentName); const claim = accts.filter((a) => a.net > 0 && hits(a.name, t) > 0 && !/استثم/.test(a.name));
    const total = claim.reduce((s, a) => s + a.net, 0);
    if (total > 1) push({ rule_code: 'DOC-003', category: 'accounting_issue', severity: 'medium', title: `${docTitle} ينص على سداد كامل رأس المال، والدفاتر تُظهر مطالبة على ${parentName} بـ ${money(total)}`, description: `ينص المستند على «الوفاء بقيمة الحصص كاملة»، بينما تحمل دفاتر الشركة رصيدًا مدينًا على الشركة الأم (${claim.map((a) => `${a.code} ${a.name}`).join('، ')}). إن كان الرصيد جزءًا غير مسدد من رأس المال فالمستند لا يطابق الواقع ويلزم إثباته؛ وإن كان معاملة جارية فيلزم مستند يؤيده. يؤثر هذا مباشرة على قيد استبعاد التوحيد.`, amount: String(total), recommendation: 'طلب كشف حساب البنك عند التأسيس ومطابقة جاري الأم لدى الطرفين.', account_code: claim[0]?.code ?? null, account_name: claim[0]?.name ?? null, evidence: { claim_accounts: claim } }, 'fullypaid');
  }
  if (F.is_draft?.value) push({ rule_code: 'DOC-004', category: 'documents_required', severity: 'medium', title: `${docTitle} نسخة مسودة وليست النسخة المعتمدة`, description: 'المستند المقدم يحمل علامة «مسودة»؛ لا يُعتمد عليه في إثبات رأس المال أو الملكية أو تاريخ التأسيس.', recommendation: 'طلب النسخة النهائية المعتمدة/المنشورة من العقد أو النظام الأساس.' }, 'draft');
  const exp = F.cr_expiry?.value; const today = new Date().toISOString().slice(0, 10);
  if (exp) { const days = (Date.parse(exp) - Date.parse(today)) / 86400000; if (days < 0) push({ rule_code: 'DOC-005', category: 'documents_required', severity: 'high', title: `السجل التجاري منتهٍ منذ ${exp}`, description: `تاريخ انتهاء السجل حسب الشهادة ${F.cr_expiry_hijri?.value ?? ''} هـ (${exp}).`, recommendation: 'طلب السجل المجدد.' }, 'expiry'); else if (days < 60) push({ rule_code: 'DOC-005', category: 'documents_required', severity: 'medium', title: `السجل التجاري ينتهي خلال ${Math.round(days)} يومًا (${exp})`, description: 'يلزم التجديد قبل الانتهاء.', recommendation: 'متابعة التجديد.' }, 'expiry'); }
  if (F.fy_end_month?.value && F.fy_end_day?.value && (F.fy_end_month.value !== client.fiscal_year_end_month || F.fy_end_day.value !== client.fiscal_year_end_day))
    push({ rule_code: 'DOC-006', category: 'data_quality', severity: 'medium', title: `نهاية السنة المالية في ${docTitle} (${F.fy_end_day.value}/${F.fy_end_month.value}) تختلف عن المسجلة للعميل (${client.fiscal_year_end_day}/${client.fiscal_year_end_month})`, description: 'يؤثر ذلك على تحديد الفترات والمقارنات؛ يمكن تطبيق قيمة المستند على بيانات العميل من شاشة البيانات النظامية.', recommendation: 'تطبيق نهاية السنة المالية من المستند بعد التأكد.' }, 'fy');
  if (F.legal_form?.value && F.legal_form.value !== 'other' && F.legal_form.value !== client.entity_type)
    push({ rule_code: 'DOC-007', category: 'data_quality', severity: 'low', title: `الشكل القانوني في ${docTitle} يختلف عن المسجل للعميل`, description: `المستند: ${F.legal_form.value} | سجل العميل: ${client.entity_type}.`, recommendation: 'تحديث الشكل القانوني للعميل.' }, 'form');
  if (F.company_name?.value && hits(F.company_name.value, nameTokens(client.legal_name_ar)) === 0)
    push({ rule_code: 'DOC-008', category: 'data_quality', severity: 'medium', title: `اسم الشركة في ${docTitle} («${F.company_name.value}») لا يطابق اسم العميل («${client.legal_name_ar}»)`, description: 'قد يكون المستند لشركة أخرى أو رُفع على الشركة الخطأ.', recommendation: 'التأكد من المستند أو نقله إلى الشركة الصحيحة.' }, 'name');
  if (e.group_engagement_id && parentName && F.partners?.value?.length) {
    const t = nameTokens(parentName); const pp = F.partners.value.find((p) => hits(p.name, t) > 0 && p.nature !== 'work');
    const own = Number(e.ownership_pct ?? 100);
    if (pp?.pct != null && Math.abs(pp.pct - own) > 0.0001) push({ rule_code: 'DOC-009', category: 'accounting_issue', severity: 'high', title: `حصة ${parentName} حسب ${docTitle} ${pp.pct}% بينما نسبة الملكية المستخدمة في التوحيد ${own}%`, description: 'يلزم توحيد نسبة الملكية بين المستند والتوحيد قبل احتساب الحقوق غير المسيطرة.', recommendation: 'تطبيق نسبة الملكية من المستند.' }, 'own');
  }
  return out;
}

officialRouter.post('/extract', requirePermission('documents.upload'), async (req, res, next) => {
  try {
    const d = parse(z.object({ document_id: z.string().uuid() }), req.body);
    const doc = await one<{ id: string; engagement_id: string; client_id: string; file_id: string; document_type: string; title: string }>('SELECT id, engagement_id, client_id, file_id, document_type, title FROM source_documents WHERE id = $1 AND deleted_at IS NULL', [d.document_id]);
    if (!doc) throw notFound('المستند غير موجود');
    const file = await getFile(doc.file_id); if (!file) throw notFound('ملف المستند غير موجود');
    const { pages, warnings } = await extractPages(readFileData(file), file.original_name);
    const fields = parseOfficial(pages, doc.document_type);
    const rec = await one<{ id: string }>(`INSERT INTO official_records (client_id, engagement_id, document_id, doc_kind, status, fields, pages, warnings) VALUES ($1,$2,$3,$4,'extracted',$5,$6,$7)
      ON CONFLICT (document_id) DO UPDATE SET doc_kind = EXCLUDED.doc_kind, status = 'extracted', fields = EXCLUDED.fields, pages = EXCLUDED.pages, warnings = EXCLUDED.warnings, extracted_at = now(), confirmed_at = NULL, confirmed_by = NULL, updated_at = now() RETURNING id`,
      [doc.client_id, doc.engagement_id, doc.id, fields.doc_kind.value ?? 'other', JSON.stringify(fields), JSON.stringify(pages), JSON.stringify(warnings)]);
    await audit(req, { action: 'official.extracted', entityType: 'official_record', entityId: rec!.id, clientId: doc.client_id, details: { document: doc.title, pages: pages.length } });
    res.json({ id: rec!.id });
  } catch (e) { next(e); }
});

/** قائمة الشركات (الأم + شركات المجموعة) ومستنداتها النظامية وسجلاتها وحالة المستندات المطلوبة */
officialRouter.get('/', async (req, res, next) => {
  try {
    const engagementId = String(req.query.engagement_id ?? ''); if (!engagementId) throw badRequest('engagement_id مطلوب');
    const root = await one<{ id: string; group_engagement_id: string | null }>('SELECT id, group_engagement_id FROM engagements WHERE id = $1', [engagementId]);
    if (!root) throw notFound('الارتباط غير موجود');
    const rootId = root.group_engagement_id ?? root.id;
    const rootRow = await one<{ id: string; client_id: string; client_name: string }>('SELECT e.id, e.client_id, c.legal_name_ar AS client_name FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.id = $1', [rootId]);
    const comps = await listComponents(rootId);
    const companies = [{ engagement_id: rootRow!.id, client_id: rootRow!.client_id, name: rootRow!.client_name, role: 'parent' }, ...comps.map((c) => ({ engagement_id: c.id, client_id: c.client_id, name: c.client_name, role: c.entity_role }))];
    const out = [];
    for (const c of companies) {
      const docs = await many<Record<string, unknown>>(`SELECT d.id, d.title, d.document_type, d.uploaded_at, f.original_name, r.id AS record_id, r.status AS record_status, r.doc_kind, r.extracted_at, r.confirmed_at
        FROM source_documents d JOIN stored_files f ON f.id = d.file_id LEFT JOIN official_records r ON r.document_id = d.id
        WHERE d.engagement_id = $1 AND d.deleted_at IS NULL AND d.document_type = ANY($2) ORDER BY d.uploaded_at`, [c.engagement_id, OFFICIAL_TYPES as unknown as string[]]);
      const has = (t: string) => docs.some((d) => d.document_type === t || (t === 'articles_of_association' && d.document_type === 'contract'));
      const checklist = [
        { key: 'articles', label: 'عقد التأسيس / النظام الأساس', required: true, status: has('articles_of_association') ? (docs.some((d) => (d.document_type === 'articles_of_association' || d.document_type === 'contract') && d.record_status === 'confirmed') ? 'confirmed' : 'received') : 'missing' },
        { key: 'cr', label: 'السجل التجاري', required: true, status: has('commercial_registration') ? (docs.some((d) => d.document_type === 'commercial_registration' && d.record_status === 'confirmed') ? 'confirmed' : 'received') : 'missing' },
        { key: 'zakat', label: 'شهادة الزكاة', required: false, status: has('zakat_certificate') ? 'received' : 'missing' },
        { key: 'vat', label: 'شهادة التسجيل في ضريبة القيمة المضافة', required: false, status: has('vat_certificate') ? 'received' : 'missing' },
      ];
      out.push({ ...c, documents: docs, checklist });
    }
    res.json({ group_engagement_id: rootId, companies: out });
  } catch (e) { next(e); }
});

officialRouter.get('/:id', async (req, res, next) => {
  try {
    const rec = await one<{ id: string; engagement_id: string; document_id: string; fields: OfficialFields; doc_kind: string; status: string; warnings: string[]; pages: PageText[]; applied: unknown; confirmed_at: string | null }>('SELECT * FROM official_records WHERE id = $1', [req.params.id]);
    if (!rec) throw notFound('السجل غير موجود');
    const doc = await one<{ title: string; document_type: string }>('SELECT title, document_type FROM source_documents WHERE id = $1', [rec.document_id]);
    const ctx = await companyContext(rec.engagement_id);
    const checks = await officialChecks(rec, doc?.title ?? 'المستند');
    res.json({ record: { ...rec, pages: undefined, page_count: rec.pages.length }, document: doc, company: { name: ctx.client.legal_name_ar, client: ctx.client, ownership_pct: ctx.e.ownership_pct, group_engagement_id: ctx.e.group_engagement_id, period: ctx.period }, checks });
  } catch (e) { next(e); }
});

officialRouter.get('/:id/page/:n', async (req, res, next) => {
  try { const rec = await one<{ pages: PageText[] }>('SELECT pages FROM official_records WHERE id = $1', [req.params.id]); if (!rec) throw notFound('السجل غير موجود'); res.json({ page: rec.pages.find((p) => p.page === Number(req.params.n)) ?? null }); } catch (e) { next(e); }
});

officialRouter.put('/:id', requirePermission('documents.upload'), async (req, res, next) => {
  try {
    const d = parse(z.object({ fields: z.record(z.string(), z.unknown()) }), req.body);
    const r = await one<{ id: string }>(`UPDATE official_records SET fields = $2, status = 'extracted', confirmed_at = NULL, updated_at = now() WHERE id = $1 RETURNING id`, [req.params.id, JSON.stringify(d.fields)]);
    if (!r) throw notFound('السجل غير موجود'); res.json({ ok: true });
  } catch (e) { next(e); }
});

/** اعتماد البيانات + تطبيق المختار منها على سجل العميل والمجموعة + تسجيل نتائج المطابقة كملاحظات */
officialRouter.post('/:id/confirm', requirePermission('documents.upload'), async (req, res, next) => {
  try {
    const d = parse(z.object({ apply: z.object({ client_cr: z.boolean().default(false), client_name: z.boolean().default(false), client_form: z.boolean().default(false), client_fy: z.boolean().default(false), group_ownership: z.boolean().default(false), group_control: z.boolean().default(false), group_rights: z.boolean().default(false) }).optional() }), req.body ?? {});
    const A = { client_cr: false, client_name: false, client_form: false, client_fy: false, group_ownership: false, group_control: false, group_rights: false, ...(d.apply ?? {}) };
    const rec = await one<{ id: string; engagement_id: string; client_id: string; document_id: string; fields: OfficialFields; doc_kind: string }>('SELECT id, engagement_id, client_id, document_id, fields, doc_kind FROM official_records WHERE id = $1', [req.params.id]);
    if (!rec) throw notFound('السجل غير موجود');
    const doc = await one<{ title: string }>('SELECT title FROM source_documents WHERE id = $1', [rec.document_id]);
    const F = rec.fields; const ctx = await companyContext(rec.engagement_id); const applied: Record<string, unknown> = {};
    await withTransaction(async (tx) => {
      if (A.client_cr) { const cr = F.cr_no?.value ?? F.unified_no?.value ?? null; if (cr) { await query('UPDATE clients SET cr_number = $2, updated_at = now() WHERE id = $1', [rec.client_id, cr], tx); applied.cr_number = cr; } }
      if (A.client_name && F.company_name?.value) { await query('UPDATE clients SET legal_name_ar = $2, updated_at = now() WHERE id = $1', [rec.client_id, F.company_name.value], tx); applied.legal_name_ar = F.company_name.value; }
      if (A.client_form && F.legal_form?.value && F.legal_form.value !== 'other') { await query('UPDATE clients SET entity_type = $2, updated_at = now() WHERE id = $1', [rec.client_id, F.legal_form.value], tx); applied.entity_type = F.legal_form.value; }
      if (A.client_fy && F.fy_end_month?.value && F.fy_end_day?.value) { await query('UPDATE clients SET fiscal_year_end_month = $2, fiscal_year_end_day = $3, updated_at = now() WHERE id = $1', [rec.client_id, F.fy_end_month.value, F.fy_end_day.value], tx); applied.fiscal_year_end = `${F.fy_end_day.value}/${F.fy_end_month.value}`; }
      if (ctx.e.group_engagement_id && ctx.parentName) {
        const t = nameTokens(ctx.parentName); const pp = (F.partners?.value ?? []).find((p) => hits(p.name, t) > 0 && p.nature !== 'work');
        if (A.group_ownership && pp?.pct != null) { await query('UPDATE engagements SET ownership_pct = $2 WHERE id = $1', [ctx.e.id, pp.pct], tx); applied.ownership_pct = pp.pct; }
        if (A.group_control || A.group_rights) {
          const g = await one<{ group_setup: { subs?: Record<string, unknown>[]; costs?: unknown[] } | null }>('SELECT group_setup FROM engagements WHERE id = $1', [ctx.e.group_engagement_id], tx);
          const setup = g?.group_setup ?? { subs: [], costs: [] }; const subs = setup.subs ?? []; let s = subs.find((x) => x.key === ctx.e.id);
          if (!s) { s = { key: ctx.e.id, engagement_id: ctx.e.id }; subs.push(s); }
          if (A.group_control && F.contract_date?.value) { s.control_since = F.contract_date.value; s.control_basis = 'incorporation'; applied.control_since = F.contract_date.value; }
          const work = (F.partners?.value ?? []).filter((p) => p.nature === 'work');
          if (A.group_rights && work.length) { s.other_equity_rights = `شريك بالعمل حسب ${doc?.title ?? 'عقد التأسيس'}: ${work.map((p) => p.name).join('، ')} (حق في الأرباح دون حصة في رأس المال)`; applied.other_equity_rights = s.other_equity_rights; }
          await query('UPDATE engagements SET group_setup = $2 WHERE id = $1', [ctx.e.group_engagement_id, JSON.stringify({ ...setup, subs })], tx);
        }
      }
      await query(`UPDATE official_records SET status = 'confirmed', confirmed_by = $2, confirmed_at = now(), applied = $3, updated_at = now() WHERE id = $1`, [rec.id, req.user!.id, JSON.stringify(applied)], tx);
      // نتائج المطابقة كملاحظات على الفترة الحالية للشركة
      if (ctx.period) {
        // تُعاد المطابقة لكل المستندات المعتمدة لهذه الشركة معًا (لا يُلغي اعتماد مستند ملاحظات مستند آخر)
        const all = await many<{ id: string; engagement_id: string; fields: OfficialFields; doc_kind: string; title: string }>(`SELECT r.id, r.engagement_id, r.fields, r.doc_kind, d.title FROM official_records r JOIN source_documents d ON d.id = r.document_id WHERE r.engagement_id = $1 AND (r.status = 'confirmed' OR r.id = $2)`, [rec.engagement_id, rec.id], tx);
        const checks: EngineFinding[] = []; const seenKeys = new Set<string>();
        for (const x of all) for (const c of await officialChecks(x.id === rec.id ? { ...x, fields: F } : x, x.title)) if (!seenKeys.has(c.dedupe_key)) { seenKeys.add(c.dedupe_key); checks.push(c); }
        const run = await one<{ id: string }>(`INSERT INTO analysis_runs (client_id, engagement_id, period_id, run_type, status, summary, result, started_by, finished_at) VALUES ($1,$2,$3,'official_checks','completed',$4,$5,$6,now()) RETURNING id`, [rec.client_id, rec.engagement_id, ctx.period.id, JSON.stringify({ findings: checks.length, record: rec.id }), JSON.stringify({ checks }), req.user!.id], tx);
        await upsertFindings({ clientId: rec.client_id, engagementId: rec.engagement_id, periodId: ctx.period.id, runId: run!.id, rulePrefix: ['DOC:'], findings: checks, userId: req.user!.id, documentId: rec.document_id }, tx);
        applied.findings = checks.length;
      }
    });
    await audit(req, { action: 'official.confirmed', entityType: 'official_record', entityId: rec.id, clientId: rec.client_id, details: { applied } });
    res.json({ ok: true, applied });
  } catch (e) { next(e); }
});

/** البيانات النظامية المعتمدة لشركات المجموعة (للتقرير وللتوحيد) */
export async function confirmedOfficial(engagementIds: string[]) {
  if (!engagementIds.length) return [];
  return many<{ engagement_id: string; doc_kind: string; fields: OfficialFields; title: string; confirmed_at: string }>(`SELECT r.engagement_id, r.doc_kind, r.fields, d.title, r.confirmed_at FROM official_records r JOIN source_documents d ON d.id = r.document_id WHERE r.engagement_id = ANY($1) AND r.status = 'confirmed' ORDER BY r.confirmed_at`, [engagementIds]);
}
void D;
