import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { get, upload } from '../api';
import { Page, useLoad, Field, useAction } from '../components/ui';

type Row = Record<string, string | number | null>;
const DOC_TYPES: Record<string, string> = { trial_balance: 'ميزان المراجعة', general_ledger: 'دفتر الأستاذ العام', journal_entries: 'قيود اليومية', chart_of_accounts: 'دليل الحسابات', receivables: 'الذمم المدينة', payables: 'الذمم الدائنة', inventory: 'المخزون', fixed_assets: 'الأصول الثابتة', bank_statement: 'كشف حساب بنكي', financial_statements: 'قوائم مالية', invoice: 'فاتورة', contract: 'عقد', articles_of_association: 'عقد التأسيس / النظام الأساس', commercial_registration: 'السجل التجاري', zakat_certificate: 'شهادة الزكاة', vat_certificate: 'شهادة ضريبة القيمة المضافة', municipal_license: 'رخصة البلدية', partners_resolution: 'قرار شركاء / جمعية', other: 'أخرى', unknown: 'غير محدد' };

export function DocumentUpload({ engagementId, periods, onDone, compact }: { engagementId: string; periods: Row[]; onDone: (docs: { id: string }[]) => void; compact?: boolean }) {
  const [files, setFiles] = useState<FileList | null>(null); const [type, setType] = useState('trial_balance'); const [period, setPeriod] = useState(String(periods.find((p) => p.role === 'current')?.id ?? periods[0]?.id ?? ''));
  const { run, busy } = useAction();
  const submit = async (e: React.FormEvent) => { e.preventDefault(); if (!files?.length) return; const f = new FormData(); f.append('engagement_id', engagementId); f.append('document_type', type); if (period) f.append('period_id', period); for (const x of Array.from(files)) f.append('files', x);
    const r = await run(() => upload<{ documents: { id: string }[] }>('/documents/upload', f), `تم رفع ${files.length} ملف`); if (r) { setFiles(null); onDone(r.documents); } };
  return <form onSubmit={submit} className={compact ? 'row' : ''} style={{ marginBottom: 12 }}>
    <Field label="الملفات (Excel/CSV/PDF/صور، حتى 5 ملفات)"><input type="file" multiple accept=".xlsx,.xls,.csv,.txt,.pdf,.png,.jpg,.jpeg,.json" onChange={(e) => setFiles(e.target.files)} required /></Field>
    <Field label="نوع المستند"><select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
    <Field label="الفترة المالية"><select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="">— بدون —</option>{periods.map((p) => <option key={String(p.id)} value={String(p.id)}>{p.label}</option>)}</select></Field>
    <div className="field"><label>&nbsp;</label><button className="btn" disabled={busy || !files?.length}>{busy ? 'جارٍ الرفع…' : 'رفع'}</button></div>
  </form>;
}

export function UploadPage() {
  const [sp] = useSearchParams(); const nav = useNavigate();
  const { data: engs } = useLoad(() => get<{ engagements: Row[] }>('/engagements'), []);
  const [eng, setEng] = useState(sp.get('engagement_id') ?? '');
  const { data: det } = useLoad(() => eng ? get<{ periods: Row[] }>(`/engagements/${eng}`) : Promise.resolve(null), [eng]);
  return <Page title="رفع المستندات" sub="تُحفظ الملفات الأصلية بلا تعديل مع بصمة SHA-256 للتتبع. الحد الأقصى للحجم محدد في إعدادات الخادم.">
    <div className="card"><Field label="الارتباط"><select value={eng} onChange={(e) => setEng(e.target.value)}><option value="">— اختر الارتباط —</option>{engs?.engagements.map((e) => <option key={String(e.id)} value={String(e.id)}>{e.client_name} — {e.title}</option>)}</select></Field>
      {eng && det && <DocumentUpload engagementId={eng} periods={det.periods} onDone={(docs) => nav(docs.length === 1 ? `/imports?engagement_id=${eng}&document_id=${docs[0].id}` : `/engagements/${eng}`)} />}
      <div className="alert info">الأنواع المدعومة: Excel (xlsx/xls)، CSV، PDF نصي (استخراج جداول)، صور وPDF ممسوح ضوئيًا (يُقرأ بالتعرف الضوئي OCR بالعربية والإنجليزية؛ راجع الأرقام قبل الاعتماد، وفحص التوازن يكشف أي خطأ قراءة).</div></div></Page>;
}
