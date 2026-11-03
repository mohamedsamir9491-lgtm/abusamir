import type { Snapshot } from './snapshot.js';
import type { TemplateSection } from './templates.js';
import { defaultValuation, valuationTermsRows, BASIS_LABELS, type ValuationTerms } from '../engagements/letterTemplates.js';
import { fmtMoney, fmtRatio, fmtDate, ENGAGEMENT_TYPE_LABELS, FRAMEWORK_LABELS, ENTITY_LABELS, REVIEW_STATUS_LABELS, ADJ_STATUS_LABELS, todayIso } from './format.js';
import { SEVERITY_LABELS, CATEGORY_LABELS, type Severity, type FindingCategory } from '../../engine/types.js';
import { D } from '../../engine/money.js';
/** أسماء أنواع المستندات بالعربية (أنواع البيانات القابلة للاستيراد + المستندات الداعمة) */
const DOC_TYPE_LABELS: Record<string, string> = { ...(DATA_TYPE_LABELS as Record<string, string>), invoice: 'فاتورة', contract: 'عقد', articles_of_association: 'عقد التأسيس / النظام الأساس', commercial_registration: 'السجل التجاري', other: 'أخرى', unknown: 'غير محدد' };
import { periodPhrase } from '../../lib/periods.js';
import { FS_LINE_MAP } from '../../engine/fsLines.js';
import { fmtAmounts } from '../../lib/textfmt.js';
import { DATA_TYPE_LABELS } from '../imports/fields.js';

export type ReportBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'kv'; items: { label: string; value: string }[] }
  | { type: 'table'; caption?: string; columns: { key: string; label: string; numeric?: boolean; width?: string }[]; rows: Record<string, string | null>[]; total_rows?: Record<string, string | null>[]; repeat_header?: boolean }
  | { type: 'findings'; items: FindingBlockItem[] }
  | { type: 'note'; text: string; tone: 'info' | 'warning' | 'danger' }
  | { type: 'page_break' };

export interface FindingBlockItem { ref: string; title: string; category: string; severity: string; account: string | null; amount: string | null; source: string | null; calculation: string | null; description: string; impact: string | null; recommendation: string | null; status: string; origin: string }
export interface ReportSectionContent { key: string; type: string; title: string; enabled: boolean; order: number; blocks: ReportBlock[]; options?: Record<string, unknown> }
export interface ReportContent {
  meta: { title: string; reference_no: string; language: string; client_name: string; client_name_en: string | null; period_label: string; period_range: string; period_phrase: string; period_end: string; prepared_date: string; confidentiality: string; engagement_type: string; framework: string; currency: string; is_demo: boolean; preparer: string | null; reviewer: string | null; approver: string | null; status: string };
  sections: ReportSectionContent[];
}

const p = (text: string): ReportBlock => ({ type: 'paragraph', text });
const note = (text: string, tone: 'info' | 'warning' | 'danger' = 'info'): ReportBlock => ({ type: 'note', text, tone });

function findingsToItems(snap: Snapshot, opts: Record<string, unknown> | undefined): FindingBlockItem[] {
  const prefixes = (opts?.rule_prefixes as string[] | undefined) ?? null; const cats = (opts?.categories as string[] | undefined) ?? null;
  return (snap.findings as Record<string, unknown>[]).filter((f) => {
    if (prefixes && !prefixes.some((px) => String(f.rule_code ?? '').startsWith(px))) return false;
    if (cats && !cats.includes(String(f.category))) return false;
    return true;
  }).map((f) => ({ ref: String(f.finding_ref), title: fmtAmounts(String(f.title)), category: String(f.category), severity: String(f.severity), account: f.account_code ? `${f.account_code}${f.account_name ? ' - ' + f.account_name : ''}` : (FS_LINE_MAP[String(f.fs_line_code)]?.label_ar ?? (f.fs_line_code as string | null)),
    amount: f.amount == null ? null : fmtMoney(f.amount as string), source: [f.source_document_title, f.source_row_ref].filter(Boolean).join(' / ') || null, calculation: (f.calculation as string | null) ?? null,
    description: fmtAmounts(String(f.description)), impact: (f.impact as string | null) ?? null, recommendation: (f.recommendation as string | null) ?? null, status: String(f.review_status), origin: String(f.origin) }));
}

function statementTable(lines: { code: string; label_ar: string; section: string; value: string; prior_value?: string | null }[], totals: { key: string; label_ar: string; value: string; prior_value?: string | null }[], hasPrior: boolean, sectionLabels: Record<string, string>, groupOrder: string[], totalAfter: Record<string, string[]>): ReportBlock {
  const columns = [{ key: 'label', label: 'البند' }, { key: 'current', label: 'الفترة الحالية', numeric: true }, ...(hasPrior ? [{ key: 'prior', label: 'الفترة السابقة', numeric: true }] : [])];
  const rows: Record<string, string | null>[] = [];
  const byKey = Object.fromEntries(totals.map((t) => [t.key, t]));
  for (const g of groupOrder) {
    const ls = lines.filter((l) => l.section === g);
    if (!ls.length && !(totalAfter[g] ?? []).some((k) => byKey[k])) continue;
    if (ls.length) rows.push({ label: sectionLabels[g] ?? g, current: '', prior: '', _group: '1' });
    for (const l of ls) rows.push({ label: l.label_ar, current: fmtMoney(l.value), prior: hasPrior ? fmtMoney(l.prior_value ?? '0') : null });
    for (const k of totalAfter[g] ?? []) { const t = byKey[k]; if (t) rows.push({ label: t.label_ar, current: fmtMoney(t.value), prior: hasPrior ? fmtMoney(t.prior_value ?? '0') : null, _total: '1' }); }
  }
  return { type: 'table', columns, rows, repeat_header: true };
}

export function buildSection(sec: TemplateSection, snap: Snapshot, meta: ReportContent['meta']): ReportSectionContent {
  const blocks: ReportBlock[] = [];
  const st = snap.statements; const hasPrior = !!snap.prior;
  const cur = snap.period.label; const curr = meta.currency;
  switch (sec.type) {
    case 'cover':
      blocks.push({ type: 'kv', items: [
        { label: 'العميل', value: meta.client_name }, { label: 'نوع الكيان', value: ENTITY_LABELS[snap.engagement.entity_type ?? ''] ?? '—' },
        ...(snap.engagement.cr_number ? [{ label: 'السجل التجاري', value: snap.engagement.cr_number }] : []), ...(snap.engagement.vat_number ? [{ label: 'الرقم الضريبي', value: snap.engagement.vat_number }] : []),
        { label: 'نوع الارتباط', value: meta.engagement_type }, { label: 'إطار التقرير المالي', value: meta.framework }, { label: 'عملة العرض', value: curr } ] });
      if (meta.is_demo) blocks.push(note('هذا التقرير مبني على بيانات تجريبية مُعلَّمة كبيانات اختبار وليست سجلات عميل فعلي.', 'warning'));
      break;
    case 'intro':
      blocks.push(p(`يتناول هذا التقرير نتائج الفحص والتحليل المالي لـ${meta.client_name} ${meta.period_phrase ?? `عن الفترة المالية ${cur} (${meta.period_range})`}، بناءً على البيانات المحاسبية التي زوّدنا بها العميل والمدرجة في قسم مصادر البيانات. أُجريت الحسابات والمطابقات بواسطة محرك حسابي حتمي، وجرت مراجعتها من قبل المحاسب المسؤول.`));
      blocks.push(p(`يُعد هذا التقرير ${meta.engagement_type}، ولا يمثل رأي مراجع حسابات مستقل أو تأكيدًا مهنيًا على القوائم المالية ما لم يُنص على ذلك صراحة في خطاب الارتباط.`));
      break;
    case 'scope':
      blocks.push({ type: 'list', items: [
        'التحقق من توازن ميزان المراجعة واتساق الأرصدة الافتتاحية والحركات والأرصدة الختامية.',
        'تصنيف الحسابات وربطها ببنود القوائم المالية واشتقاق القوائم المالية الأولية.',
        'احتساب النسب المالية الرئيسية ومقارنة الفترة الحالية بالفترة السابقة حيثما توفرت.',
        'تحديد الأرصدة غير الطبيعية والحسابات المعلقة والتغيرات الجوهرية والبنود التي تتطلب مستندات مؤيدة.',
        ...(snap.journal ? ['فحص قيود اليومية ومطابقة حركاتها مع ميزان المراجعة.'] : []),
        ...(Object.keys(snap.subledger).length ? ['مطابقة السجلات الفرعية (الذمم/الأصول/المخزون/البنك) مع الأستاذ العام.'] : []),
        ...(snap.ai ? ['تحليل تفسيري مساعد عبر الذكاء الاصطناعي تمت مراجعته بشريًا؛ كل الأرقام فيه منقولة من نتائج المحرك الحسابي.'] : []),
      ] });
      blocks.push(p('لا يشمل النطاق إجراءات تأكيد مستقلة مثل المصادقات الخارجية أو الجرد الفعلي أو فحص المستندات الأصلية ما لم يُذكر خلاف ذلك.'));
      break;
    case 'sources':
      blocks.push({ type: 'table', columns: [{ key: 'name', label: 'المستند' }, { key: 'type', label: 'النوع' }, { key: 'uploaded', label: 'تاريخ الرفع' }, { key: 'status', label: 'الحالة' }, { key: 'rows', label: 'سطور البيانات', numeric: true }],
        rows: (snap.documents as Record<string, unknown>[]).map((d) => ({ name: String(d.title ?? d.original_name), type: DOC_TYPE_LABELS[String(d.data_type ?? d.document_type)] ?? String(d.data_type ?? d.document_type), uploaded: fmtDate(String(d.uploaded_at ?? '').slice(0, 10), false), status: d.committed_at ? `معتمد ${fmtDate(String(d.committed_at).slice(0, 10), false)}` : 'مرفوع', rows: d.data_rows == null ? '—' : String(d.data_rows) })) });
      blocks.push({ type: 'table', caption: 'البصمة الرقمية الكاملة للمستندات (SHA-256)', columns: [{ key: 'name', label: 'المستند' }, { key: 'hash', label: 'SHA-256' }], rows: (snap.documents as Record<string, unknown>[]).map((d) => ({ name: String(d.original_name), hash: String(d.sha256) })) });
      {
        const gd = (snap.group_documents ?? []) as Record<string, unknown>[];
        if (gd.length) blocks.push({ type: 'table', caption: 'سجل مصادر المجموعة (كل شركة داخلة في التوحيد): المستند، الشركة، الفترة، الاستلام، النسخة، الاعتماد، البصمة، الاستخدام', columns: [{ key: 'company', label: 'الشركة', width: '14%' }, { key: 'name', label: 'المستند', width: '18%' }, { key: 'type', label: 'النوع', width: '9%' }, { key: 'period', label: 'الفترة', width: '11%' }, { key: 'uploaded', label: 'الاستلام', width: '8%' }, { key: 'ver', label: 'النسخة', width: '6%', numeric: true }, { key: 'status', label: 'الاعتماد', width: '9%' }, { key: 'hash', label: 'SHA-256', width: '15%' }, { key: 'used', label: 'استُخدم في', width: '10%' }],
          rows: gd.map((d) => ({ company: String(d.company ?? ''), name: String(d.title ?? d.original_name), type: DOC_TYPE_LABELS[String(d.data_type ?? d.document_type)] ?? String(d.data_type ?? d.document_type), period: String(d.period ?? ''), uploaded: fmtDate(String(d.uploaded_at ?? '').slice(0, 10), false), ver: String(d.version_no ?? ''), status: d.committed_at ? `معتمد ${fmtDate(String(d.committed_at).slice(0, 10), false)}` : 'مرفوع', hash: String(d.sha256 ?? ''), used: String(d.used_in ?? '') })) });
      }
      break;
    case 'summary': {
      const items: string[] = [];
      const s = snap.tb?.summary as Record<string, unknown> | undefined;
      if (s) {
        const t = s.totals as Record<string, { balanced: boolean; difference: string }>;
        items.push(t.closing.balanced ? `ميزان المراجعة متوازن (إجمالي المدين يساوي الدائن) ويضم ${s.unique_accounts} حسابًا.` : `ميزان المراجعة غير متوازن بفرق ${fmtMoney(t.closing.difference)} ${curr}، وهو خطأ حسابي مؤكد يجب تصحيحه قبل الاعتماد على القوائم.`);
        const c = s.counts_by_severity as Record<string, number>;
        items.push(`أسفر الفحص عن ${snap.findings.length} ملاحظة نشطة: ${c.critical ?? 0} حرجة، ${c.high ?? 0} مرتفعة، ${c.medium ?? 0} متوسطة.`);
      }
      if (st) {
        const kf = st.key_figures;
        items.push(`صافي الإيرادات ${fmtMoney(kf.revenue)} ${curr}، مجمل الربح ${fmtMoney(kf.gross_profit)}، صافي ${D(kf.net_income ?? 0).lt(0) ? 'الخسارة' : 'الربح'} ${fmtMoney(kf.net_income)}.`);
        items.push(`إجمالي الأصول ${fmtMoney(kf.total_assets)}، إجمالي الالتزامات ${fmtMoney(kf.total_liabilities)}، حقوق الملكية ${fmtMoney(kf.total_equity)}.`);
        if (snap.ratios) { const by = Object.fromEntries(snap.ratios.map((r) => [r.code, r])); const sv = (r: (typeof snap.ratios)[number] | undefined, u: string) => !r ? '—' : r.status === 'ok' ? fmtRatio(r.value, u) : r.status === 'not_meaningful' ? 'غير ذات معنى' : 'غير قابلة للاحتساب'; items.push(`نسبة التداول ${sv(by.current_ratio, 'ratio')}، هامش صافي الربح ${sv(by.net_margin, 'pct')}، فترة التحصيل ${sv(by.dso, 'days')}.`); }
        if (st.cf.status === 'ok') { const op = st.cf.totals.find((t) => t.key === 'operating'); if (op) items.push(`صافي النقد من الأنشطة التشغيلية (مشتق من ميزان المراجعة، استرشادي) ${fmtMoney(op.value)} ${curr} مقابل نتيجة محاسبية ${fmtMoney(kf.net_income)}.`); }
      }
      if (snap.ai?.executive_summary_ar) { blocks.push({ type: 'list', items }); blocks.push({ type: 'heading', text: 'ملخص تحليلي (مساعد ذكي - تمت مراجعته)' }); blocks.push(p(String(snap.ai.executive_summary_ar))); }
      else blocks.push({ type: 'list', items: items.length ? items : ['لم تُنفذ فحوصات بعد لهذه الفترة.'] });
      break;
    }
    case 'tb_summary': {
      const s = snap.tb?.summary as Record<string, unknown> | undefined;
      if (!s) { blocks.push(note('لم يُشغَّل فحص ميزان المراجعة لهذه الفترة.', 'warning')); break; }
      const t = s.totals as Record<string, { debit: string; credit: string; difference: string; balanced: boolean }>;
      blocks.push({ type: 'table', columns: [{ key: 'k', label: 'البند' }, { key: 'd', label: 'إجمالي المدين', numeric: true }, { key: 'c', label: 'إجمالي الدائن', numeric: true }, { key: 'f', label: 'الفرق', numeric: true }, { key: 'r', label: 'النتيجة' }],
        rows: [['opening', 'الأرصدة الافتتاحية'], ['movements', 'حركات الفترة'], ['closing', 'الأرصدة الختامية']].map(([k, l]) => ({ k: l, d: fmtMoney(t[k].debit), c: fmtMoney(t[k].credit), f: fmtMoney(t[k].difference), r: t[k].balanced ? 'متوازن' : 'غير متوازن' })) });
      const c = s.counts_by_category as Record<string, number>;
      blocks.push({ type: 'kv', items: [ { label: 'عدد الصفوف / الحسابات', value: `${s.rows} / ${s.unique_accounts}` }, { label: 'حسابات لا يتفق ختاميها مع الافتتاحي والحركات', value: String((s.computed_check as { accounts_with_mismatch: number }).accounts_with_mismatch) },
        { label: 'حد الأهمية النسبية', value: `${fmtMoney(s.materiality as string)} ${curr} (${s.materiality_basis})` }, { label: 'أخطاء حسابية مؤكدة', value: String(c.math_error ?? 0) }, { label: 'مشاكل جودة بيانات', value: String(c.data_quality ?? 0) }, { label: 'مسائل محاسبية محتملة', value: String(c.accounting_issue ?? 0) }, { label: 'مسائل تتطلب حكمًا مهنيًا', value: String(c.judgment ?? 0) },
        ...(s.net_income_from_tb ? [{ label: 'صافي الدخل المستخرج من الميزان', value: fmtMoney(s.net_income_from_tb as string) }] : []), { label: 'مقارنة بالفترة السابقة', value: s.prior_compared ? 'نعم' : 'لا تتوفر فترة سابقة' } ] });
      const tt = s.type_totals as Record<string, string>;
      blocks.push({ type: 'table', caption: 'صافي الأرصدة الختامية حسب نوع الحساب (مدين موجب / دائن سالب)', columns: [{ key: 't', label: 'النوع' }, { key: 'v', label: 'صافي الرصيد', numeric: true }], rows: Object.entries(tt).map(([k, v]) => ({ t: ({ asset: 'الأصول', liability: 'الالتزامات', equity: 'حقوق الملكية', revenue: 'الإيرادات', expense: 'المصاريف', other: 'أخرى/غير مصنف' } as Record<string, string>)[k] ?? k, v: fmtMoney(v) })) });
      break;
    }
    case 'findings': {
      const items = findingsToItems(snap, sec.options);
      if (!items.length) blocks.push(p('لا توجد ملاحظات ضمن هذا القسم.'));
      else blocks.push({ type: 'findings', items });
      break;
    }
    case 'statements_sfp':
      if (!st) { blocks.push(note('لم تُولَّد القوائم المالية بعد.', 'warning')); break; }
      blocks.push(p(`كما في ${meta.period_end ?? ''}`));
      blocks.push(statementTable(st.sfp.lines, st.sfp.totals, hasPrior, { current_assets: 'الأصول المتداولة', non_current_assets: 'الأصول غير المتداولة', current_liabilities: 'الالتزامات المتداولة', non_current_liabilities: 'الالتزامات غير المتداولة', equity: 'حقوق الملكية', unclassified: 'حسابات غير مصنفة / معلقة' },
        ['non_current_assets', 'current_assets', 'unclassified', 'equity', 'non_current_liabilities', 'current_liabilities'], { non_current_assets: ['non_current_assets'], current_assets: ['current_assets'], unclassified: ['total_assets'], equity: ['net_income_in_equity', 'total_equity'], non_current_liabilities: ['non_current_liabilities'], current_liabilities: ['current_liabilities', 'total_liabilities', 'total_liabilities_equity'] }));
      if (!st.sfp.balanced) blocks.push(note(`القائمة غير متوازنة بفرق ${fmtMoney(st.sfp.difference)}؛ راجع الملاحظات.`, 'danger'));
      for (const n of st.notes) blocks.push(note(n, 'info'));
      break;
    case 'statements_pl':
      if (!st) { blocks.push(note('لم تُولَّد القوائم المالية بعد.', 'warning')); break; }
      if (meta.period_phrase) blocks.push(p(meta.period_phrase));
      blocks.push(statementTable(st.pl.lines, st.pl.totals, hasPrior, { revenue: 'الإيرادات', cost_of_sales: 'تكلفة الإيرادات', operating_expenses: 'المصاريف التشغيلية', non_operating: 'بنود غير تشغيلية', zakat_tax: 'الزكاة والضريبة', oci: 'الدخل الشامل الآخر' },
        ['revenue', 'cost_of_sales', 'operating_expenses', 'non_operating', 'zakat_tax', 'oci'], { revenue: ['net_revenue'], cost_of_sales: ['gross_profit'], operating_expenses: ['operating_profit'], non_operating: ['profit_before_zakat'], zakat_tax: ['net_income'], oci: ['total_comprehensive'] }));
      break;
    case 'statements_ce':
      if (!st || st.ce.status !== 'ok') { blocks.push(note(st?.ce.note ?? 'بيانات غير كافية لقائمة التغيرات في حقوق الملكية.', 'warning')); break; }
      if (meta.period_phrase) blocks.push(p(meta.period_phrase));
      blocks.push({ type: 'table', columns: [{ key: 'label', label: 'البند' }, { key: 'value', label: 'المبلغ', numeric: true }], rows: st.ce.rows.map((r) => ({ label: r.label_ar, value: fmtMoney(r.value) })) });
      break;
    case 'statements_cf':
      if (!st || st.cf.status !== 'ok') { blocks.push(note(st?.cf.note ?? 'بيانات غير كافية لقائمة التدفقات النقدية.', 'warning')); break; }
      if (meta.period_phrase) blocks.push(p(meta.period_phrase));
      { const secs: Record<string, string> = { operating: 'الأنشطة التشغيلية', investing: 'الأنشطة الاستثمارية', financing: 'الأنشطة التمويلية' };
        const rows: Record<string, string | null>[] = [];
        for (const k of ['operating', 'investing', 'financing']) { rows.push({ label: secs[k], value: '', _group: '1' }); for (const r of st.cf.rows.filter((x) => x.section === k)) rows.push({ label: r.label_ar, value: fmtMoney(r.value) }); const t = st.cf.totals.find((x) => x.key === k); if (t) rows.push({ label: t.label_ar, value: fmtMoney(t.value), _total: '1' }); }
        for (const t of st.cf.totals.filter((x) => !['operating', 'investing', 'financing'].includes(x.key))) rows.push({ label: t.label_ar, value: fmtMoney(t.value), _total: '1' });
        blocks.push({ type: 'table', columns: [{ key: 'label', label: 'البند' }, { key: 'value', label: 'المبلغ', numeric: true }], rows, repeat_header: true });
        if (st.cf.note) blocks.push(note(st.cf.note, 'info')); }
      break;
    case 'ratios': {
      if (!snap.ratios) { blocks.push(note('لم تُحتسب النسب بعد.', 'warning')); break; }
      const groups = (sec.options?.groups as string[] | undefined) ?? ['liquidity', 'leverage', 'profitability', 'efficiency', 'cash_flow'];
      const gl: Record<string, string> = { liquidity: 'السيولة', leverage: 'المديونية والهيكل التمويلي', profitability: 'الربحية', efficiency: 'الكفاءة التشغيلية', cash_flow: 'التدفق النقدي' };
      const showF = !!sec.options?.show_formulas;
      const columns = [{ key: 'label', label: 'النسبة' }, { key: 'value', label: cur, numeric: true }, ...(hasPrior ? [{ key: 'prior', label: snap.prior!.label, numeric: true }] : []), { key: 'formula', label: 'المعادلة' }, ...(showF ? [{ key: 'inputs', label: 'المدخلات' }] : [])];
      const rows: Record<string, string | null>[] = [];
      const showVal = (r: (typeof snap.ratios)[number]) => r.status === 'ok' ? fmtRatio(r.value, r.unit) : r.status === 'not_meaningful' ? `غير ذات معنى${r.value ? ` (${fmtRatio(r.value, r.unit)})` : ''}` : 'غير قابلة للاحتساب';
      for (const g of groups) { rows.push({ label: gl[g], _group: '1' }); for (const r of snap.ratios.filter((x) => x.group === g)) rows.push({ label: r.label_ar, value: showVal(r), prior: hasPrior ? fmtRatio(r.prior_value ?? null, r.unit) : null, formula: r.formula_ar + (r.note ? ` — ${r.note}` : ''), inputs: showF ? Object.entries(r.inputs).map(([k, v]) => `${k}=${v == null ? '—' : fmtMoney(v)}`).join('؛ ') : null }); }
      blocks.push({ type: 'table', columns, rows, repeat_header: true });
      blocks.push(note('"غير قابلة للاحتساب" تعني نقص البيانات؛ "غير ذات معنى" تعني أن المقام أو الإشارة تجعل النسبة بلا تفسير اقتصادي، ويُذكر السبب بجوار المعادلة. لم يُفترض أي رقم.', 'info'));
      break;
    }
    case 'variance': {
      if (!snap.variance) { blocks.push(note('لا تتوفر فترة سابقة للمقارنة.', 'warning')); break; }
      const rows = (sec.options?.all_rows ? snap.variance.rows : snap.variance.rows.filter((r) => r.material || r.key.startsWith('total:'))).map((r) => ({ label: r.label_ar, current: fmtMoney(r.current), prior: fmtMoney(r.comparative), change: fmtMoney(r.change), pct: r.change_pct == null ? '—' : `${r.change_pct}%`, material: r.material ? 'نعم' : '' }));
      blocks.push({ type: 'table', columns: [{ key: 'label', label: 'البند' }, { key: 'current', label: cur, numeric: true }, { key: 'prior', label: snap.prior?.label ?? 'السابقة', numeric: true }, { key: 'change', label: 'التغير', numeric: true }, { key: 'pct', label: '%', numeric: true }, { key: 'material', label: 'جوهري' }], rows, repeat_header: true });
      blocks.push(p(`عدد البنود ذات التغير الجوهري: ${snap.variance.material_count}؛ معيار الجوهرية: ${snap.variance.materiality ? fmtMoney(snap.variance.materiality) + ' ' + curr + ' و' : ''}${snap.variance.pct_threshold}% على الأقل.`));
      break;
    }
    case 'aging': {
      const t = String(sec.options?.type ?? 'receivable');
      const run = snap.subledger[t] as { result?: { aging?: { as_of: string; buckets: { label: string; amount: string; pct: string | null }[]; total: string; undated: string; by_party: { party: string; buckets: string[]; total: string }[]; concentration: { party: string; total: string; pct: string | null }[] }; reconciliation?: { subledger_total: string; gl_balance: string; difference: string; matched: boolean } } } | undefined;
      if (!run?.result?.aging) { blocks.push(note(`لم يُستورد أو يُحلَّل سجل ${t === 'receivable' ? 'الذمم المدينة' : 'الذمم الدائنة'} لهذه الفترة.`, 'warning')); break; }
      const a = run.result.aging; const r = run.result.reconciliation;
      if (r) blocks.push({ type: 'kv', items: [{ label: 'إجمالي السجل الفرعي', value: fmtMoney(r.subledger_total) }, { label: 'رصيد الأستاذ العام', value: fmtMoney(r.gl_balance) }, { label: 'الفرق', value: fmtMoney(r.difference) }, { label: 'النتيجة', value: r.matched ? 'مطابق' : 'غير مطابق' }] });
      blocks.push({ type: 'table', caption: `تحليل الأعمار كما في ${fmtDate(a.as_of, false)}`, columns: [{ key: 'b', label: 'الشريحة' }, { key: 'a', label: 'المبلغ', numeric: true }, { key: 'p', label: '%', numeric: true }], rows: [...a.buckets.map((b) => ({ b: b.label, a: fmtMoney(b.amount), p: b.pct ?? '—' })), { b: 'بدون تاريخ', a: fmtMoney(a.undated), p: '' }, { b: 'الإجمالي', a: fmtMoney(a.total), p: '100', _total: '1' }] });
      blocks.push({ type: 'table', caption: 'أكبر الأطراف', columns: [{ key: 'party', label: 'الطرف' }, ...a.buckets.map((b, i) => ({ key: `b${i}`, label: b.label, numeric: true })), { key: 'total', label: 'الإجمالي', numeric: true }], rows: a.by_party.slice(0, 25).map((x) => ({ party: x.party, ...Object.fromEntries(x.buckets.map((v, i) => [`b${i}`, fmtMoney(v)])), total: fmtMoney(x.total) })), repeat_header: true });
      break;
    }
    case 'fixed_assets': case 'inventory': {
      const t = sec.type === 'fixed_assets' ? 'fixed_asset' : 'inventory';
      const run = snap.subledger[t] as { result?: { summary?: Record<string, string>; reconciliation?: { subledger_total: string; gl_balance: string; difference: string; matched: boolean } } } | undefined;
      if (!run?.result?.summary) { blocks.push(note('لم يُستورد أو يُحلَّل السجل لهذه الفترة.', 'warning')); break; }
      const labels: Record<string, string> = { assets: 'عدد الأصول', items: 'عدد الأصناف', cost: 'إجمالي التكلفة', accumulated_depreciation: 'مجمع الاستهلاك', net_book_value: 'صافي القيمة الدفترية (المسجل)', computed_nbv: 'صافي القيمة الدفترية (محسوب)', depreciation_period: 'استهلاك الفترة', total_value: 'إجمالي قيمة المخزون' };
      blocks.push({ type: 'kv', items: Object.entries(run.result.summary).map(([k, v]) => ({ label: labels[k] ?? k, value: /^\d+$/.test(v) && (k === 'assets' || k === 'items') ? v : fmtMoney(v) })) });
      const r = run.result.reconciliation; if (r) blocks.push({ type: 'kv', items: [{ label: 'إجمالي السجل الفرعي', value: fmtMoney(r.subledger_total) }, { label: 'رصيد الأستاذ العام', value: fmtMoney(r.gl_balance) }, { label: 'الفرق', value: fmtMoney(r.difference) }, { label: 'النتيجة', value: r.matched ? 'مطابق' : 'غير مطابق' }] });
      break;
    }
    case 'bank': {
      const run = snap.subledger['bank_transaction'] as { result?: { summary?: Record<string, string | number | null>; unmatched_bank?: Record<string, unknown>[]; unmatched_book?: Record<string, unknown>[] } } | undefined;
      if (!run?.result?.summary) { blocks.push(note('لم يُستورد كشف بنكي أو لم تُشغَّل المطابقة لهذه الفترة.', 'warning')); break; }
      const s = run.result.summary;
      blocks.push({ type: 'kv', items: [{ label: 'حركات الكشف', value: String(s.bank_transactions) }, { label: 'حركات الدفاتر', value: String(s.book_transactions) }, { label: 'مطابق', value: String(s.matched) }, { label: 'في الكشف دون الدفاتر', value: String(s.unmatched_bank) }, { label: 'في الدفاتر دون الكشف', value: String(s.unmatched_book) }, { label: 'فرق الرصيد', value: s.balance_difference == null ? 'غير متاح' : fmtMoney(String(s.balance_difference)) }] });
      if (run.result.unmatched_bank?.length) blocks.push({ type: 'table', caption: 'حركات في كشف البنك بلا مقابل في الدفاتر', columns: [{ key: 'date', label: 'التاريخ' }, { key: 'ref', label: 'المرجع' }, { key: 'desc', label: 'البيان' }, { key: 'debit', label: 'مدين', numeric: true }, { key: 'credit', label: 'دائن', numeric: true }], rows: run.result.unmatched_bank.slice(0, 100).map((x) => ({ date: String(x.record_date ?? ''), ref: String(x.reference ?? ''), desc: String(x.description ?? ''), debit: fmtMoney(x.debit as string), credit: fmtMoney(x.credit as string) })), repeat_header: true });
      if (run.result.unmatched_book?.length) blocks.push({ type: 'table', caption: 'قيود في الدفاتر لم تظهر في الكشف', columns: [{ key: 'date', label: 'التاريخ' }, { key: 'ref', label: 'المرجع' }, { key: 'desc', label: 'البيان' }, { key: 'amount', label: 'المبلغ', numeric: true }], rows: run.result.unmatched_book.slice(0, 100).map((x) => ({ date: String(x.date ?? ''), ref: String(x.ref ?? ''), desc: String(x.description ?? ''), amount: fmtMoney(x.amount as string) })), repeat_header: true });
      break;
    }
    case 'adjustments': {
      const adj = snap.adjustments as Record<string, unknown>[];
      if (!adj.length) { blocks.push(p('لا توجد تسويات مقترحة لهذه الفترة.')); break; }
      for (const a of adj) {
        blocks.push({ type: 'heading', text: `${a.adj_ref}: ${a.description} (${ADJ_STATUS_LABELS[String(a.status)] ?? a.status})` });
        const lines = a.lines as { account_code: string; account_name: string | null; debit: string; credit: string }[];
        blocks.push({ type: 'table', columns: [{ key: 'acc', label: 'الحساب' }, { key: 'dr', label: 'مدين', numeric: true }, { key: 'cr', label: 'دائن', numeric: true }], rows: lines.map((l) => ({ acc: `${l.account_code}${l.account_name ? ' - ' + l.account_name : ''}`, dr: D(l.debit).isZero() ? '' : fmtMoney(l.debit), cr: D(l.credit).isZero() ? '' : fmtMoney(l.credit) })), total_rows: [{ acc: 'الإجمالي', dr: fmtMoney(a.total_debit as string), cr: fmtMoney(a.total_credit as string) }] });
        if (a.rationale) blocks.push(p(`الأساس المحاسبي: ${a.rationale}`)); if (a.calculation) blocks.push(p(`الاحتساب: ${a.calculation}`)); if (a.finding_ref) blocks.push(p(`مرتبطة بالملاحظة ${a.finding_ref}.`));
      }
      blocks.push(note('التسويات أعلاه مقترحة ولا تُرحَّل تلقائيًا؛ يتم الترحيل في النظام المحاسبي للعميل بعد الاعتماد.', 'info'));
      break;
    }
    case 'documents_needed': {
      const items = (snap.findings as Record<string, unknown>[]).filter((f) => f.category === 'documents_required').map((f) => `${f.finding_ref}: ${f.title}`);
      if (snap.ai?.documents_needed) items.push(...(snap.ai.documents_needed as string[]).map((d) => `(مقترح من المساعد) ${d}`));
      const generic = ['كشوف الحسابات البنكية لكامل الفترة ومطابقاتها.', 'تحليل أعمار الذمم المدينة والدائنة المعتمد من الإدارة.', 'سجل الأصول الثابتة وجدول الاستهلاك.', 'مصادقات الأرصدة مع الأطراف ذات العلاقة والبنوك حيثما ينطبق.', 'الإقرارات الزكوية والضريبية للفترة وما يؤيد الالتزامات المتعلقة بها.'];
      blocks.push({ type: 'list', items: items.length ? items : ['لا توجد طلبات مستندات مسجلة حاليًا.'] });
      blocks.push({ type: 'heading', text: 'مستندات عامة يُنصح بالحصول عليها (إن لم تُقدَّم)' }); blocks.push({ type: 'list', items: generic });
      break;
    }
    case 'questions': {
      const q: string[] = [];
      for (const f of (snap.findings as Record<string, unknown>[]).filter((f) => ['judgment', 'accounting_issue'].includes(String(f.category)) && ['critical', 'high', 'medium'].includes(String(f.severity))).slice(0, 25)) q.push(`بخصوص ${f.account_code ? `الحساب ${f.account_code} (${f.account_name ?? ''})` : f.title}: ${f.recommendation ?? 'يُرجى تزويدنا بتفسير الرصيد والمستندات المؤيدة.'} [${f.finding_ref}]`);
      if (snap.ai?.management_questions) q.push(...(snap.ai.management_questions as string[]));
      blocks.push({ type: 'list', items: q.length ? q : ['لا توجد استفسارات معلقة.'], ordered: true });
      break;
    }
    case 'ai_commentary':
      if (!snap.ai) { blocks.push(note('لم يُجرَ تحليل بالمساعد الذكي لهذه الفترة، أو أن الخدمة غير مفعّلة. هذا القسم اختياري ولا يؤثر على النتائج الحسابية.', 'info')); break; }
      blocks.push(p(String(snap.ai.financial_commentary_ar)));
      { const v = snap.ai._verification as { unverified_numbers?: string[] } | undefined; if (v?.unverified_numbers?.length) blocks.push(note(`تنبيه للمراجع: وردت في نص المساعد أرقام لم يُعثر عليها في البيانات المدخلة (${v.unverified_numbers.slice(0, 5).join('؛ ')}). يجب التحقق منها أو حذفها قبل الإصدار.`, 'danger')); }
      blocks.push(note(`أُعد هذا التعليق بمساعدة نموذج ذكاء اصطناعي بتاريخ ${fmtDate(snap.ai_run_at?.slice(0, 10), false)} اعتمادًا على نتائج المحرك الحسابي فقط، وتمت مراجعته من المحاسب المسؤول. لا يمثل رأيًا مهنيًا مستقلًا.`, 'info'));
      break;
    case 'risks': {
      const ra = snap.ai?.risk_assessment as Record<string, { level: string; rationale: string }> | undefined;
      const lv: Record<string, string> = { low: 'منخفض', medium: 'متوسط', high: 'مرتفع', unknown: 'غير محدد' };
      const names: Record<string, string> = { liquidity: 'السيولة', profitability: 'الربحية', leverage: 'المديونية', working_capital: 'رأس المال العامل' };
      if (ra) blocks.push({ type: 'table', columns: [{ key: 'a', label: 'المجال' }, { key: 'l', label: 'المستوى' }, { key: 'r', label: 'الأساس' }], rows: Object.entries(ra).map(([k, v]) => ({ a: names[k] ?? k, l: lv[v.level] ?? v.level, r: v.rationale })) });
      else if (snap.ratios) { const by = Object.fromEntries(snap.ratios.map((r) => [r.code, r])); const rows: Record<string, string>[] = [];
        const cr = by.current_ratio?.value ? Number(by.current_ratio.value) : null; rows.push({ a: 'السيولة', l: cr === null ? 'غير محدد' : cr < 1 ? 'مرتفع' : cr < 1.5 ? 'متوسط' : 'منخفض', r: `نسبة التداول ${fmtRatio(by.current_ratio?.value, 'ratio')}` });
        const nm = by.net_margin?.value ? Number(by.net_margin.value) : null; rows.push({ a: 'الربحية', l: nm === null ? 'غير محدد' : nm < 0 ? 'مرتفع' : nm < 5 ? 'متوسط' : 'منخفض', r: `هامش صافي الربح ${fmtRatio(by.net_margin?.value, 'pct')}` });
        const de = by.debt_to_equity?.value ? Number(by.debt_to_equity.value) : null; rows.push({ a: 'المديونية', l: de === null ? 'غير محدد' : de > 2 ? 'مرتفع' : de > 1 ? 'متوسط' : 'منخفض', r: `الالتزامات إلى حقوق الملكية ${fmtRatio(by.debt_to_equity?.value, 'ratio')}` });
        const wc = by.working_capital?.value ? Number(by.working_capital.value) : null; rows.push({ a: 'رأس المال العامل', l: wc === null ? 'غير محدد' : wc < 0 ? 'مرتفع' : 'منخفض', r: `رأس المال العامل ${fmtRatio(by.working_capital?.value, 'amount')}` });
        blocks.push({ type: 'table', columns: [{ key: 'a', label: 'المجال' }, { key: 'l', label: 'المستوى (قاعدي)' }, { key: 'r', label: 'الأساس' }], rows }); blocks.push(note('تقييم قاعدي مبني على عتبات عامة للنسب؛ يخضع لتقدير المحاسب وطبيعة النشاط.', 'info')); }
      else blocks.push(note('يتطلب توليد القوائم والنسب أولًا.', 'warning'));
      break;
    }
    case 'recommendations': {
      const recs = (snap.findings as Record<string, unknown>[]).filter((f) => f.recommendation && ['critical', 'high', 'medium'].includes(String(f.severity))).slice(0, 20).map((f) => `${f.recommendation} [${f.finding_ref}]`);
      blocks.push({ type: 'list', items: recs.length ? Array.from(new Set(recs)) : ['لا توجد توصيات محددة إضافية.'], ordered: true });
      break;
    }
    case 'limitations': {
      const items = ['اعتمد التحليل على البيانات المقدمة من العميل دون التحقق من صحتها بإجراءات تأكيد مستقلة.', 'القوائم المالية المعروضة مشتقة آليًا من ميزان المراجعة وفق التصنيف الحالي للحسابات، وقد تختلف عن القوائم النظامية المعتمدة.', 'النسب والمقارنات حساسة لجودة التصنيف ولاكتمال الأرصدة الافتتاحية والحركات.'];
      if (st?.cf.status !== 'ok') items.push('لم يتسنَّ إعداد قائمة التدفقات النقدية لعدم كفاية البيانات.');
      if (!hasPrior) items.push('لا تتوفر فترة سابقة للمقارنة؛ تحليل الفروقات غير متاح.');
      if (snap.ai?.limitations) items.push(...(snap.ai.limitations as string[]));
      items.push('أي إشارة إلى متطلبات نظامية أو معايير مهنية تتطلب التحقق من النص النافذ قبل الاعتماد عليها.');
      blocks.push({ type: 'list', items });
      break;
    }
    case 'disclaimer':
      blocks.push(p(snap.office.disclaimer_ar || 'أُعد هذا التقرير لأغراض الاستخدام الداخلي للعميل والمكتب بناءً على البيانات المقدمة من الإدارة، ولا يُعد تقرير مراجع حسابات مستقل ولا يتضمن رأيًا تأكيديًا على القوائم المالية. لا يتحمل المكتب مسؤولية أي قرار يُتخذ اعتمادًا عليه دون الرجوع إلى المستندات الأصلية والجهات المختصة.'));
      break;
    case 'signatures':
      blocks.push({ type: 'kv', items: [{ label: 'التحقق الحسابي', value: 'آلي بمحرك البرنامج الحتمي (توازن الموازين، المعادلة المحاسبية، النسب)' }, { label: 'أعدّه', value: meta.preparer ?? '______________' }, { label: 'المراجعة المهنية', value: meta.reviewer ?? 'لم تتم مراجعة مهنية مستقلة بعد' }, { label: 'الاعتماد', value: meta.approver ?? 'غير معتمد' }, { label: 'المفوض بالتوقيع', value: [snap.office.signatory_name, snap.office.signatory_title].filter(Boolean).join(' - ') || '______________' }] });
      blocks.push(note(`حالة هذا الإصدار: ${({ draft: 'مسودة - غير مراجعة وغير معتمدة', reviewed: 'تمت مراجعته مهنيًا من مستخدم مختلف عن المُعد - غير معتمد للإصدار', approved: 'معتمد للإصدار', issued: 'صادر' } as Record<string, string>)[meta.status] ?? meta.status}. النتائج غير مدققة ولا تمثل رأي مراجع مستقل.`, meta.status === 'draft' ? 'warning' : 'info'));
      break;
    case 'checklist':
      blocks.push({ type: 'list', items: (snap.ai?.review_checklist as string[] | undefined) ?? ['التحقق من توازن ميزان المراجعة.', 'مراجعة تصنيف الحسابات ذات الثقة المنخفضة.', 'تسوية الحسابات المعلقة.', 'مطابقة الذمم والبنوك مع السجلات الفرعية.', 'الحصول على تفسيرات الإدارة للتغيرات الجوهرية.', 'مراجعة التسويات المقترحة واعتمادها أو رفضها.'] });
      break;
    case 'appendix_tb':
      blocks.push({ type: 'table', columns: [{ key: 'account_code', label: 'الرمز' }, { key: 'account_name', label: 'اسم الحساب' }, { key: 'fs_line', label: 'بند القوائم' }, { key: 'opening_net', label: 'افتتاحي (صافي)', numeric: true }, { key: 'movement_net', label: 'حركات (صافي)', numeric: true }, { key: 'closing_debit', label: 'ختامي مدين', numeric: true }, { key: 'closing_credit', label: 'ختامي دائن', numeric: true }, { key: 'source_row', label: 'الصف' }],
        rows: snap.tb_rows.map((r) => ({ account_code: r.account_code, account_name: r.account_name, fs_line: r.fs_line, opening_net: fmtMoney(r.opening_net), movement_net: fmtMoney(r.movement_net), closing_debit: fmtMoney(r.closing_debit), closing_credit: fmtMoney(r.closing_credit), source_row: r.source_row == null ? '' : String(r.source_row) })), repeat_header: true });
      break;
    case 'valuation_terms': {
      const L = snap.engagement_letter as { letter_no: string | null; status: string; letter_date: string; fields: { options?: { include_valuation?: boolean }; valuation?: ValuationTerms; entity_name?: string; summary_period?: string } } | null;
      if (!L || !L.fields.options?.include_valuation || !L.fields.valuation) { blocks.push(note('لا توجد شروط تقييم في خطاب ارتباط هذا الارتباط. فعّل "إدراج جزء التقييم المالي" في شاشة خطاب الارتباط وحدد أساس القيمة وتاريخ التقييم، ثم أعد توليد هذا القسم.', 'warning')); break; }
      const v = { ...defaultValuation({ entity: L.fields.entity_name ?? '', period: L.fields.summary_period ?? '' }), ...L.fields.valuation } as ValuationTerms;
      blocks.push(p(`يُعد هذا الجزء من التقرير وفق شروط التقييم المتفق عليها في خطاب الارتباط رقم ${L.letter_no ?? '—'} (${L.status === 'issued' ? 'صادر' : 'مسودة'}) بتاريخ ${fmtDate(L.letter_date, false)}.`));
      blocks.push({ type: 'kv', items: valuationTermsRows(v).map(([label, value]) => ({ label, value })) });
      const c = snap.consolidation as Record<string, unknown> | null;
      const asset = v.approaches.includes('asset'); const income = v.approaches.includes('income'); const market = v.approaches.includes('market');
      blocks.push({ type: 'table', caption: 'حالة تنفيذ أساليب التقييم المتفق عليها', columns: [{ key: 'a', label: 'الأسلوب', width: '34%' }, { key: 's', label: 'الحالة في هذا التقرير', width: '30%' }, { key: 'n', label: 'المدخلات المطلوبة / الملاحظة', width: '36%' }],
        rows: [
          ...(asset ? [{ a: 'أسلوب الأصول', s: c ? `منفَّذ دفتريًا: حقوق المجموعة ${fmtMoney(String(c.group_equity_worksheet ?? c.group_equity_before_adjustments ?? '0'))} (${c.status === 'supported' ? 'مدعومة' : 'غير مكتملة'})` : 'غير منفَّذ بعد', n: v.basis === 'book' ? 'القيمة الدفترية هي أساس القيمة المتفق عليه' : 'يلزم إعادة قياس الأصول والالتزامات الجوهرية للوصول إلى صافي الأصول المعدل' }] : []),
          ...(income ? [{ a: 'أسلوب الدخل (DCF)', s: 'غير منفَّذ بعد', n: 'توقعات الإدارة لخمس سنوات وافتراضاتها، ومعدل الخصم، ومعدل النمو النهائي' }] : []),
          ...(market ? [{ a: 'أسلوب السوق', s: 'غير منفَّذ بعد', n: 'بيانات شركات أو صفقات مقارنة موثوقة ومضاعفاتها' }] : []),
        ] });
      if (v.basis !== 'book' && !(income || market)) blocks.push(note(`أساس القيمة المتفق عليه (${BASIS_LABELS[v.basis]}) يتطلب عادةً أسلوبًا إضافيًا غير دفتري؛ راجع اختيار الأساليب في الخطاب.`, 'warning'));
      if (v.basis !== 'book') blocks.push(note(`النتائج الدفترية في هذا التقرير لا تمثل ${BASIS_LABELS[v.basis]} المتفق عليها في الخطاب ما لم تُنفَّذ الأساليب المطلوبة ويُوفَّق بينها.`, 'danger'));
      if (v.licensed_valuer === 'required') blocks.push(note('الغرض يتطلب تقريرًا من مقيّم مرخّص من الهيئة السعودية للمقيمين المعتمدين (تقييم)؛ لا يُصدر هذا التقرير بصفة تقييم معتمد ما لم يوقّعه مقيّم مرخّص.', 'warning'));
      break;
    }
    case 'consolidation': {
      const c = snap.consolidation as Record<string, unknown> | null;
      if (!c) { blocks.push(note('لم يُشغَّل التوحيد الدفتري لهذه الفترة بعد. شغّله من صفحة "التوحيد" ثم أعد توليد هذا القسم.', 'warning')); break; }
      const ws = c.worksheet as { rows: Record<string, unknown>[]; entries: Record<string, unknown>[]; register: Record<string, unknown>[]; subsidiaries: Record<string, unknown>[]; scope: Record<string, unknown>[]; totals: Record<string, string> };
      const subsList = (c.subsidiaries as Record<string, string>[]); const T = ws.totals; const money = (v: unknown) => fmtMoney(String(v ?? '0'));
      const companies: Record<string, string> = { parent: String((c.parent as Record<string, unknown>).label), group: 'المجموعة' }; for (const sub of subsList) companies[sub.key] = sub.label;
      const secLabel: Record<string, string> = { current_assets: 'أصول متداولة', non_current_assets: 'أصول غير متداولة', current_liabilities: 'التزامات متداولة', non_current_liabilities: 'التزامات غير متداولة', equity: 'حقوق الملكية', nci: 'حقوق غير مسيطرة', unclassified: 'غير مصنف' };
      blocks.push(p(`الأساس: ${String(c.basis)}. الحالة: ${c.status === 'incomplete' ? 'غير مكتملة - لا تُعتمد قائمة موحدة ولا قيمة نهائية' : 'مدعومة بالأدلة'}. تاريخ التشغيل: ${fmtDate(String(snap.consolidation_run_at ?? '').slice(0, 10), false)}.`));
      if ((c.pending_reasons as string[]).length) blocks.push({ type: 'list', items: c.pending_reasons as string[] });
      blocks.push({ type: 'kv', items: [{ label: 'حقوق ملكية الأم (قوائم منفصلة)', value: money((c.parent as Record<string, unknown>).book_equity) }, { label: 'مجموع بنود حقوق الملكية الموحدة بعد القيود المؤيدة', value: money(c.group_equity_worksheet) }, { label: 'فروق غير محسومة باقية في بنودها', value: money(T.unreconciled_total) }, { label: 'فرضية حسابية فقط (لو ثبت أن الفروق ليست أصولًا)', value: money(c.hypothesis_unreconciled_not_assets) }, { label: 'حقوق غير مسيطرة', value: money(T.nci) }, { label: 'فحص المعادلة / القيود', value: `${money(T.equation_difference)} / ${money(T.eliminations_debit)} = ${money(T.eliminations_credit)}` }] });
      const keys = ['parent', ...subsList.map((x) => x.key)];
      blocks.push({ type: 'table', caption: 'ورقة عمل التوحيد: أرصدة ما قبل الاستبعاد، القيود، الرصيد الموحد', columns: [{ key: 'l', label: 'البند', width: '22%' }, ...keys.map((k) => ({ key: `c_${k}`, label: companies[k], numeric: true, width: `${Math.floor(44 / keys.length)}%` })), { key: 'agg', label: 'المجمع', numeric: true, width: '9%' }, { key: 'dr', label: 'استبعاد مدين', numeric: true, width: '8%' }, { key: 'cr', label: 'استبعاد دائن', numeric: true, width: '8%' }, { key: 'con', label: 'الموحد', numeric: true, width: '9%' }], repeat_header: true,
        rows: ws.rows.map((r) => ({ l: `${String(r.label_ar)} (${secLabel[String(r.section)] ?? ''})${Number(r.unreconciled) ? ` - غير محسوم ${money(r.unreconciled)}` : ''}`, ...Object.fromEntries(keys.map((k) => [`c_${k}`, money((r.per_company as Record<string, string>)[k] ?? '0')])), agg: money(r.aggregate), dr: money(r.elimination_debit), cr: money(r.elimination_credit), con: money(r.consolidated) })),
        total_rows: [{ l: 'إجمالي الأصول', con: money(T.assets) }, { l: 'إجمالي الالتزامات', con: money(T.liabilities) }, { l: 'حقوق الملكية (مجموع البنود)', con: money(T.equity) }, { l: 'حقوق غير مسيطرة', con: money(T.nci) }, { l: 'فحص المعادلة', con: money(T.equation_difference) }] });
      blocks.push({ type: 'table', caption: 'قيود الاستبعاد (كل قيد متوازن؛ للمراجعة ولا تُرحَّل في الدفاتر المنفصلة)', columns: [{ key: 'q', label: 'القيد', width: '7%' }, { key: 's', label: 'الدعم', width: '10%' }, { key: 'd', label: 'الوصف', width: '28%' }, { key: 'a', label: 'البند / الحساب / الدفاتر', width: '31%' }, { key: 'dr', label: 'مدين', numeric: true, width: '12%' }, { key: 'cr', label: 'دائن', numeric: true, width: '12%' }], repeat_header: true,
        rows: ws.entries.flatMap((e) => (e.lines as Record<string, string>[]).map((l) => ({ q: String(e.ref), s: e.support === 'documented' ? 'مؤيد' : 'مشروط', d: String(e.description), a: `${FS_LINE_MAP[l.line_code]?.label_ar ?? l.line_code}${l.account ? ` (${l.account})` : ''} - ${companies[l.company] ?? l.company}${l.note ? `: ${l.note}` : ''}`, dr: money(l.debit), cr: money(l.credit) }))), total_rows: [{ q: '', d: 'الإجمالي', dr: money(T.eliminations_debit), cr: money(T.eliminations_credit) }] });
      blocks.push({ type: 'list', items: ws.entries.map((e) => `${String(e.ref)} - ${String(e.basis)}: ${(e.evidence as string[]).join('؛ ')}`) });
      blocks.push({ type: 'table', caption: 'مطابقة الاستثمار برأس المال من الرصيد الافتتاحي والحركة والرصيد الختامي', columns: [{ key: 'c', label: 'التابعة', width: '16%' }, { key: 'i', label: 'البند', width: '52%' }, { key: 'v', label: 'القيمة', numeric: true, width: '32%' }], repeat_header: true,
        rows: ws.subsidiaries.flatMap((sd) => { const cm = sd.capital_matching as Record<string, string>; const inv = sd.investment as Record<string, string>; const cl = sd.sub_claim_on_parent as Record<string, string>; const L = String(sd.label); return [
          { c: L, i: 'استثمار الأم: افتتاحي / مدين / دائن / ختامي', v: `${money(inv.opening)} / ${money(inv.period_debit)} / ${money(inv.period_credit)} / ${money(inv.closing)}` },
          { c: L, i: 'مطالبة التابعة على الأم: افتتاحي / مدين / دائن / ختامي', v: `${money(cl.opening)} / ${money(cl.period_debit)} / ${money(cl.period_credit)} / ${money(cl.closing)}` },
          { c: L, i: 'رأس المال في دفاتر التابعة', v: money(sd.sub_capital) },
          { c: L, i: 'هوية الافتتاح: (رأس المال − المطالبة) − الاستثمار', v: money(cm.identity_opening) }, { c: L, i: 'هوية الحركة: ما دفعته الأم − ما أثبتته التابعة', v: money(cm.identity_period) },
          { c: L, i: 'فرق المطابقة الختامي', v: `${money(cm.investment_vs_implied_paid_capital)}${cm.identity_reconciles ? ' (متطابق مع الهويتين)' : ' (غير متطابق)'}` },
          { c: L, i: `ما استُبعد كاكتتاب غير مسدد - التصنيف: ${cm.claim_classification}`, v: money(cm.claim_matched_to_unpaid_capital) }, { c: L, i: 'الباقي بلا مقابل (في بنده الأصلي)', v: money(cm.unmatched_sub_claim) },
          { c: L, i: 'تاريخ اكتساب السيطرة', v: `${sd.control_since ? String(sd.control_since) : 'غير مُثبت بمستند'} - ${sd.control_basis === 'incorporation' ? 'تأسيس من الأم' : sd.control_basis === 'acquisition' ? 'شراء' : 'غير محدد'}` }]; }) });
      blocks.push({ type: 'table', caption: 'جسر التسوية: فرق المطابقة مقابل أثر التابعة على حقوق المجموعة', columns: [{ key: 'c', label: 'التابعة', width: '18%' }, { key: 'i', label: 'البند', width: '48%' }, { key: 'v', label: 'ريال', numeric: true, width: '16%' }, { key: 'n', label: 'ملاحظة', width: '18%' }], repeat_header: true,
        rows: ws.subsidiaries.flatMap((sd) => { const b = sd.bridge as Record<string, string>; const L = String(sd.label); return [{ c: L, i: 'فرق مطابقة الاستثمار برأس المال', v: money(b.investment_vs_implied_paid_capital), n: 'غير محسوم' }, { c: L, i: 'نتائج التابعة المتراكمة منذ السيطرة', v: money(b.post_acquisition_results), n: 'ضمن حقوق المجموعة' }, { c: L, i: 'أثر التابعة إن بقي الفرق في بنده', v: money(b.contribution_with_difference_pending), n: '' }, { c: L, i: 'أثر التابعة لو ثبت أن الفرق ليس أصلًا', v: money(b.contribution_if_difference_written_off), n: 'فرضية' }]; }) });
      if (ws.register.length) blocks.push({ type: 'table', caption: 'سجل الفروق غير المحسومة', columns: [{ key: 'q', label: 'المرجع', width: '6%' }, { key: 'c', label: 'الشركة', width: '12%' }, { key: 'd', label: 'الوصف والفرضيات', width: '34%' }, { key: 'a', label: 'المبلغ', numeric: true, width: '10%' }, { key: 'e', label: 'الأثر الأقصى', numeric: true, width: '10%' }, { key: 'r', label: 'المسؤول', width: '12%' }, { key: 'v', label: 'الدليل المطلوب', width: '16%' }], repeat_header: true,
        rows: ws.register.map((x) => ({ q: String(x.ref), c: String(x.company), d: `${String(x.description)} | ${(x.nature_hypotheses as string[]).join('؛ ')}`, a: money(x.amount), e: x.equity_effect === 'none' ? 'لا أثر' : x.equity_effect === 'immaterial' ? 'غير جوهري' : money(x.max_equity_effect), r: String(x.responsible), v: (x.required_evidence as string[]).join('؛ ') })) });
      if (ws.scope.length) blocks.push({ type: 'table', caption: 'شركات بلا قوائم (خارج ورقة العمل مؤقتًا)', columns: [{ key: 'l', label: 'الشركة', width: '20%' }, { key: 'c', label: 'السيطرة', width: '14%' }, { key: 'i', label: 'استثمار الأم', numeric: true, width: '14%' }, { key: 'r', label: 'مستحق للأم', numeric: true, width: '14%' }, { key: 'p', label: 'مستحق على الأم', numeric: true, width: '14%' }, { key: 'n', label: 'ملاحظة', width: '24%' }],
        rows: ws.scope.map((x) => ({ l: String(x.label), c: ({ controlled: 'قائمة', not_controlled: 'غير قائمة', unknown: 'غير محددة' } as Record<string, string>)[String(x.control)] ?? String(x.control), i: money(x.investment_cost), r: money(x.receivable), p: money(x.payable), n: String(x.note ?? '') })) });
      blocks.push(note('هذه ورقة عمل دفترية لأغراض التحليل الداخلي؛ لا تمثل قوائم مالية موحدة معتمدة ولا قيمة عادلة ولا رأي مراجع مستقل.', 'warning'));
      break;
    }
    case 'appendix_accounts': case 'custom_text':
      blocks.push(p('')); break;
  }
  return { key: sec.key, type: sec.type, title: sec.title_ar, enabled: sec.enabled, order: sec.order, blocks, options: sec.options };
}

export function buildReportContent(params: { title: string; referenceNo: string; sections: TemplateSection[]; snapshot: Snapshot; status: string; preparer: string | null; reviewer?: string | null; approver?: string | null }): ReportContent {
  const s = params.snapshot;
  const meta: ReportContent['meta'] = {
    title: params.title, reference_no: params.referenceNo, language: 'ar', client_name: s.engagement.client_name ?? '', client_name_en: s.engagement.client_name_en ?? null, period_label: s.period.label,
    period_range: `${fmtDate(s.period.start_date, false)} - ${fmtDate(s.period.end_date, false)}`, period_phrase: periodPhrase(String(s.period.start_date).slice(0, 10), String(s.period.end_date).slice(0, 10)), period_end: fmtDate(s.period.end_date, false), prepared_date: todayIso(), confidentiality: s.office.confidentiality_ar as string,
    engagement_type: ENGAGEMENT_TYPE_LABELS[s.engagement.engagement_type ?? ''] ?? String(s.engagement.engagement_type), framework: FRAMEWORK_LABELS[s.engagement.framework ?? ''] ?? String(s.engagement.framework),
    currency: s.engagement.currency ?? 'SAR', is_demo: s.engagement.is_demo === 'true', preparer: params.preparer, reviewer: params.reviewer ?? null, approver: params.approver ?? null, status: params.status,
  };
  const sections = [...params.sections].sort((a, b) => a.order - b.order).map((sec) => buildSection(sec, s, meta));
  return { meta, sections };
}
export { SEVERITY_LABELS, CATEGORY_LABELS, REVIEW_STATUS_LABELS };
export type { Severity, FindingCategory };
