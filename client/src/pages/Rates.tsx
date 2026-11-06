/** النسب النظامية والحاسبات: كل نسبة مقروءة من نص المادة ومطابقة بين المصادر، ولا تُستخدم في الحساب إلا متطابقة أو معتمدة من المكتب */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, ChevronLeft, AlertTriangle, ShieldCheck, Calculator, RotateCcw, Pencil } from 'lucide-react';
import { get, post } from '../api';
import { useAuth } from '../auth';
import { Page, Spinner, Empty, Modal, Field, useLoad, useAction } from '../components/ui';
import { fmtDate } from '../format';

type Ev = { source: string; ref: string; heading: string; page: number; value: number; method: string; excerpt: string; primary: boolean };
type Rate = { id: string; grp: string; label: string; unit: string; extracted: number | null; status: string; evidence: Ev[]; approved_value: number | null; approved_by_name: string | null; approved_at: string | null; note: string | null; changed: boolean; effective: number | null; usable: boolean };
type Calc = { ok: boolean; lines: { label: string; value: number; unit?: string; strong?: boolean }[]; refs: string[]; notes: string[]; missing: { id: string; label: string }[] };

const fmt = (v: number | null, u: string) => v == null ? '—' : u === '%' ? `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 4 })}%` : u === 'ريال/لتر' ? `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })} ريال/لتر` : u === 'لتر' ? `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 })} لتر` : `${Number(v).toLocaleString('en-US')} ريال`;
const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
type Tone = 'ok' | 'warn' | 'danger' | 'info';
function stateOf(r: Rate): [string, Tone] {
  if (r.changed) return ['تغيّر المصدر: راجع', 'danger'];
  if (r.approved_value != null) return ['معتمدة', 'info'];
  if (r.status === 'match' || r.status === 'match_note') return ['متطابقة تلقائيًا', 'ok'];
  if (r.status === 'single') return ['مصدر واحد: تحتاج اعتماد', 'warn'];
  if (r.status === 'conflict') return ['المصادر مختلفة: اختر', 'danger'];
  return ['لم يُعثر عليها', 'danger'];
}
const METHOD: Record<string, [string, string]> = { 'كتابة': ['مكتوب بالحروف', 'neutral'], 'رقم': ['رقم في النص', 'neutral'], 'قراءة ضوئية': ['قراءة ضوئية: تحقّق', 'warn'] };
const cnt = (n: number) => n === 1 ? 'بند واحد' : n === 2 ? 'بندان' : n <= 10 ? `${n} بنود` : `${n} بندًا`;

export function Rates() {
  const [tab, setTab] = useState<'calc' | 'rates'>('calc');
  const { data, loading, reload } = useLoad(() => get<{ rates: Rate[] }>('/legal/rates'), []);
  const rates = data?.rates ?? [];
  const pending = rates.filter((r) => !r.usable).length;
  return <Page title="النسب والحاسبات" icon="calc" sub="حاسبات الزكاة والضرائب والغرامات. كل نسبة فيها مأخوذة من نص المادة الرسمية ومعها مرجعها، ولا تُستخدم إلا إذا تطابقت في مصدرين رسميين أو اعتمدتها أنت."
    actions={<div className="segtabs" style={{ margin: 0, border: 0 }}>{([['calc', 'الحاسبات'], ['rates', 'جدول النسب']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{k === 'rates' && pending > 0 && <em>{pending}</em>}</button>)}</div>}>
    {loading || !data ? <Spinner /> : !rates.length ? <div className="card"><Empty text="جدول النسب غير محمّل بعد. يُحمَّل تلقائيًا مع تحديث المكتبة النظامية." /></div>
      : tab === 'calc' ? <Calculators rates={rates} onRates={() => setTab('rates')} /> : <RatesTable rates={rates} reload={reload} />}
  </Page>;
}

function RatesTable({ rates, reload }: { rates: Rate[]; reload: () => void }) {
  const { can } = useAuth(); const canApprove = can('legal.approve');
  const [filter, setFilter] = useState<Tone | null>(null); const [open, setOpen] = useState<Record<string, boolean>>({}); const [edit, setEdit] = useState<Rate | null>(null);
  const { run, busy } = useAction();
  const counts = useMemo(() => { const c: Record<Tone, number> = { ok: 0, warn: 0, danger: 0, info: 0 }; rates.forEach((r) => c[stateOf(r)[1]]++); return c; }, [rates]);
  const groups = [...new Set(rates.map((r) => r.grp))];
  const approve = async (r: Rate, value: number, note: string | null = null) => { const ok = await run(() => post(`/legal/rates/${r.id}/approve`, { value, note }), `اعتُمدت ${fmt(value, r.unit)}`); if (ok) reload(); return ok; };
  return <>
    <div className="rt-sum">{([['ok', 'متطابقة تلقائيًا', 'من مصدرين رسميين أو أكثر'], ['info', 'معتمدة منك', 'باسمك وتاريخ الاعتماد'], ['warn', 'تحتاج اعتماد', 'وُجدت في مصدر واحد'], ['danger', 'تحتاج قرارك', 'مختلفة أو تغيّر مصدرها']] as [Tone, string, string][]).map(([k, t, s]) =>
      <button key={k} className={`rt-card ${k}${filter === k ? ' on' : ''}`} onClick={() => setFilter(filter === k ? null : k)} aria-pressed={filter === k}><b>{counts[k]}</b><span>{t}</span><small>{s}</small></button>)}</div>
    {!canApprove && <div className="note">الاعتماد متاح لمدير المكتب ومدير النظام.</div>}
    {groups.map((g) => { const list = rates.filter((r) => r.grp === g && (!filter || stateOf(r)[1] === filter)); if (!list.length) return null;
      return <div key={g} className="card"><div className="ch"><span>{g}</span><span className="badge neutral">{cnt(list.length)}</span></div>
        {list.map((r) => { const [st, tone] = stateOf(r); const isOpen = open[r.id] ?? (tone === 'warn' || tone === 'danger'); const vals = [...new Set(r.evidence.map((e) => Number(e.value)))];
          return <div key={r.id} className="rt-row">
            <button className="rt-head" onClick={() => setOpen({ ...open, [r.id]: !isOpen })} aria-expanded={isOpen}>
              {isOpen ? <ChevronDown size={15} /> : <ChevronLeft size={15} />}
              <span className="rt-lbl"><b>{r.label}</b><small>{r.evidence[0] ? `${r.evidence[0].source.slice(0, 70)} | ${r.evidence[0].ref}` : 'لا مصدر'}</small></span>
              <span className="rt-val">{r.status === 'conflict' && r.approved_value == null ? 'اختر' : fmt(r.approved_value ?? r.extracted, r.unit)}</span>
              <span className={`badge ${tone}`}>{st}</span></button>
            {isOpen && <div className="rt-detail">
              {r.evidence.map((e, i) => <div key={i} className="rt-ev"><span className="rt-evv">{fmt(e.value, r.unit)}</span>
                <div><div className="rt-src">{e.source} <span className="muted">| {e.ref}{e.heading ? ` (${e.heading})` : ''} | ص {e.page}</span> <span className={`badge ${METHOD[e.method]?.[1] ?? 'neutral'}`}>{METHOD[e.method]?.[0] ?? e.method}</span></div>
                  <div className="rt-ex">… {e.excerpt} …</div></div></div>)}
              {r.approved_value != null && <div className="muted" style={{ fontSize: 12.5 }}>اعتمدها {r.approved_by_name ?? '—'} في {r.approved_at ? fmtDate(r.approved_at.slice(0, 10)) : '—'}{r.note ? ` | ملاحظة: ${r.note}` : ''}</div>}
              {r.changed && <div className="note warn">تغيّرت القيمة المستخرجة من المصدر بعد اعتمادك ({fmt(r.extracted, r.unit)} بدل {fmt(r.approved_value, r.unit)}). لن تُستخدم في الحاسبات حتى تراجعها.</div>}
              {canApprove && <div className="row">
                {(r.approved_value == null || r.changed) && vals.map((v) => <button key={v} className="btn sm" disabled={busy} onClick={() => approve(r, v)}><Check size={14} /> اعتماد {fmt(v, r.unit)}</button>)}
                <button className="btn sec sm" onClick={() => setEdit(r)}><Pencil size={14} /> قيمة أخرى مع ملاحظة</button>
                {r.approved_value != null && <button className="btn sec sm" disabled={busy} onClick={async () => { if (await run(() => post(`/legal/rates/${r.id}/revoke`), 'أُلغي الاعتماد')) reload(); }}><RotateCcw size={14} /> إلغاء الاعتماد</button>}
              </div>}
            </div>}
          </div>; })}
      </div>; })}
    {edit && <EditRate r={edit} onClose={() => setEdit(null)} onSave={async (v, n) => { if (await approve(edit, v, n)) setEdit(null); }} />}
  </>;
}

function EditRate({ r, onClose, onSave }: { r: Rate; onClose: () => void; onSave: (v: number, note: string) => void }) {
  const [v, setV] = useState(String(r.approved_value ?? r.extracted ?? '')); const [n, setN] = useState('');
  return <Modal title={`اعتماد قيمة: ${r.label}`} onClose={onClose}>
    <Field label={r.unit === '%' ? 'النسبة %' : 'المبلغ (ريال)'}><input type="number" value={v} onChange={(e) => setV(e.target.value)} min={0} step="0.0001" /></Field>
    <Field label="سبب التعديل والمرجع" hint="مطلوب إذا كانت القيمة لا تطابق أي مصدر في المكتبة، مثل قرار أو تعميم أحدث."><textarea rows={3} value={n} onChange={(e) => setN(e.target.value)} /></Field>
    <div className="row end"><button className="btn sec" onClick={onClose}>إلغاء</button><button className="btn" disabled={v === '' || Number(v) < 0} onClick={() => onSave(Number(v), n.trim())}>اعتماد</button></div>
  </Modal>;
}

const WHT = ['wht.mgmt', 'wht.royalty', 'wht.technical', 'wht.rent', 'wht.tickets', 'wht.telecom', 'wht.dividends', 'wht.interest', 'wht.insurance', 'wht.other'];
const CALCS: { k: string; t: string; d: string }[] = [
  { k: 'wht', t: 'ضريبة الاستقطاع', d: 'دفعة لغير مقيم' }, { k: 'it_penalty', t: 'غرامات ضريبة الدخل', d: 'تأخير الإقرار والسداد' }, { k: 'vat', t: 'القيمة المضافة', d: 'الضريبة وغرامات التأخير' },
  { k: 'zakat', t: 'الزكاة', d: 'النسبة حسب أيام السنة' }, { k: 'rett', t: 'التصرفات العقارية', d: 'ضريبة قيمة التصرف' }, { k: 'sweet', t: 'المشروبات المحلاة', d: 'الانتقائية حسب السكر لكل لتر' },
];

function Calculators({ rates, onRates }: { rates: Rate[]; onRates: () => void }) {
  const [k, setK] = useState('wht');
  const [f, setF] = useState<Record<string, Record<string, string | boolean>>>({
    wht: { type: 'wht.mgmt', amount: '100000', basis: 'gross' }, it_penalty: { unpaid: '80000', revenue: '3500000', file_days: '45', pay_days: '75', partial: 'full' },
    vat: { amount: '10000', basis: 'exclusive', late_months: '0', late_filing: false }, zakat: { base: '1000000', year: 'gregorian', days: '365', hijri_days: '354' }, rett: { value: '2000000' }, sweet: { sugar: '11', ml: '330', units: '1', no_sugar: false },
  });
  const [res, setRes] = useState<Calc | null>(null);
  const cur = f[k]; const set = (key: string, v: string | boolean) => setF({ ...f, [k]: { ...cur, [key]: v } });
  useEffect(() => { const t = setTimeout(() => { post<Calc>(`/legal/calc/${k}`, cur).then(setRes).catch(() => setRes(null)); }, 250); return () => clearTimeout(t); }, [k, cur]);
  const label = (id: string) => rates.find((r) => r.id === id)?.label ?? id;
  const inp = (key: string, l: string, hint?: string) => <Field label={l} hint={hint}><input type="number" min={0} value={String(cur[key] ?? '')} onChange={(e) => set(key, e.target.value)} /></Field>;
  const sel = (key: string, l: string, opts: [string, string][]) => <Field label={l}><select value={String(cur[key])} onChange={(e) => set(key, e.target.value)}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>;
  return <div className="rt-calc">
    <div className="rt-kinds">{CALCS.map((c) => <button key={c.k} className={k === c.k ? 'on' : ''} onClick={() => { setK(c.k); setRes(null); }}><Calculator size={16} /><b>{c.t}</b><small>{c.d}</small></button>)}</div>
    <div className="grid c2">
      <div className="card"><div className="ch"><span>المدخلات</span></div>
        {k === 'wht' && <>{sel('type', 'نوع الدفعة', WHT.map((id) => [id, label(id)]))}<div className="grid c2">{inp('amount', 'المبلغ (ريال)')}{sel('basis', 'المبلغ المتفق عليه', [['gross', 'إجمالي: يُخصم منه'], ['net', 'صافٍ للمستفيد: يتحمّل الدافع الضريبة']])}</div></>}
        {k === 'it_penalty' && <><div className="grid c2">{inp('unpaid', 'الضريبة غير المسددة (ريال)')}{inp('revenue', 'إجمالي الإيرادات (ريال)')}{inp('file_days', 'أيام تأخير تقديم الإقرار')}{inp('pay_days', 'أيام تأخير السداد')}</div>
          {sel('partial', 'جزء الثلاثين يومًا', [['full', 'يُحسب فترة كاملة (تقدير متحفّظ)'], ['complete', 'الفترات الكاملة فقط']])}</>}
        {k === 'vat' && <><div className="grid c2">{inp('amount', 'المبلغ (ريال)')}{sel('basis', 'المبلغ', [['exclusive', 'قبل الضريبة'], ['inclusive', 'شامل الضريبة']])}{inp('late_months', 'أشهر تأخير السداد', 'جزء الشهر يُحسب شهرًا بنص المادة 43')}</div>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={Boolean(cur.late_filing)} onChange={(e) => set('late_filing', e.target.checked)} style={{ width: 'auto' }} /> لم يُقدَّم الإقرار في موعده</label></>}
        {k === 'zakat' && <><div className="grid c2">{inp('base', 'الوعاء الزكوي (ريال)')}{sel('year', 'السنة المالية', [['hijri', 'هجرية'], ['gregorian', 'تختلف عن الهجرية']])}</div>
          {cur.year !== 'hijri' && <div className="grid c2">{inp('days', 'أيام السنة المالية للمكلف')}{inp('hijri_days', 'أيام السنة الهجرية المقابلة')}</div>}</>}
        {k === 'rett' && inp('value', 'إجمالي قيمة التصرف (ريال)')}
        {k === 'sweet' && <><label className="row" style={{ gap: 8, marginBottom: 8 }}><input type="checkbox" checked={Boolean(cur.no_sugar)} onChange={(e) => set('no_sugar', e.target.checked)} style={{ width: 'auto' }} /> خالٍ من السكر (محليات صناعية فقط)</label>
          <div className="grid c3">{!cur.no_sugar && inp('sugar', 'السكر الإجمالي (جرام لكل 100 مل)')}{inp('ml', 'حجم العبوة (مل)')}{inp('units', 'عدد العبوات')}</div></>}
        <p className="muted" style={{ fontSize: 12 }}>الأرقام الافتراضية مثال توضيحي وليست بيانات عميل.</p>
      </div>
      <div className="card"><div className="ch"><span>النتيجة</span></div>
        {!res ? <Spinner /> : !res.ok ? <div className="note warn"><AlertTriangle size={15} /> لا يمكن الحساب قبل اعتماد: {res.missing.map((m) => m.label).join('، ')}. <button className="linkbtn" onClick={onRates}>افتح جدول النسب</button></div>
          : <><table className="t compact"><tbody>{res.lines.map((l, i) => <tr key={i} className={l.strong ? 'total' : ''}><td>{l.label}</td><td className="num">{l.unit === '%' ? `${l.value}%` : money(l.value)}</td></tr>)}</tbody></table>
            {res.notes.map((n, i) => <p key={i} className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>{n}</p>)}
            <div className="rt-refs"><ShieldCheck size={14} /> المرجع: {res.refs.join('؛ ')} <Link to={`/library?q=${encodeURIComponent(res.refs[0]?.split(' | ').reverse().join(' ') ?? '')}`}>فتح في المكتبة</Link></div></>}
      </div>
    </div>
  </div>;
}
