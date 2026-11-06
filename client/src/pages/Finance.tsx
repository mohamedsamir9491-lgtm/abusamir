import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { get, put } from '../api';
import { useAuth } from '../auth';
import { Page, Spinner, Empty, Money, useLoad, useAction, Field } from '../components/ui';
import { CLAIM_STATE } from '../components/FinancePanel';
import { Butterfly, Donut, AgingBar, Funnel, Gauge } from '../components/charts';
import { fmtDate, fmtMoney, ENG_TYPE } from '../format';
import { matches } from '../text';

type Claim = { id: string; claim_no: string; client_id: string; client_name: string; engagement_id: string; engagement_title: string; issue_date: string; due_date: string | null; amount: number; vat_amount: number; total: number; paid: number; balance: number; state: string; external_invoice_no: string | null; age_days: number | null };
const STATES: [string, string][] = [['', 'الكل'], ['open', 'غير محصّلة بالكامل'], ['overdue', 'متأخرة'], ['partial', 'جزئية'], ['paid', 'محصّلة'], ['cancelled', 'ملغاة']];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <div className="sw-search" style={{ boxShadow: 'none', borderColor: 'var(--border)', background: 'var(--surface)', height: 40, flex: '1 1 320px' }}><Search size={16} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>;
}

export function FinanceClaims() {
  const [sp] = useSearchParams(); const [q, setQ] = useState(sp.get('q') ?? ''); const [state, setState] = useState(''); const [page, setPage] = useState(1);
  const { data, loading } = useLoad(() => get<{ claims: Claim[]; totals: { count: number; amount: number; total: number; paid: number; balance: number }; per: number }>(`/finance/claims?q=${encodeURIComponent(q)}&state=${state}&page=${page}&per=25`), [q, state, page]);
  return <Page title="المطالبات" sub="كل مطالبات الأتعاب لكل العملاء. المطالبة تصدر من صفحة الارتباط (الدورة المالية) على دفعات جدول الأتعاب، ويُسجَّل معها رقم الفاتورة من نظام الفوترة الخاص بك.">
    <div className="dgrid">{data && ([['عدد المطالبات', String(data.totals.count), ''], ['الإجمالي (شامل الضريبة)', fmtMoney(data.totals.total), ''], ['المحصّل', fmtMoney(data.totals.paid), 'okt'], ['المتبقي', fmtMoney(data.totals.balance), 'warnt']] as const).map(([l, v, c]) => <div key={l} className="card mk s3"><small>{l}</small><b className={c}>{v}</b></div>)}
    <section className="card s12"><div className="row" style={{ marginBottom: 12 }}><SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="رقم المطالبة أو رقم الفاتورة أو اسم العميل…" /><div className="segtabs" style={{ margin: 0, border: 0 }}>{STATES.map(([k, l]) => <button key={k} className={state === k ? 'on' : ''} onClick={() => { setState(k); setPage(1); }}>{l}</button>)}</div></div>
      {loading || !data ? <Spinner /> : !data.claims.length ? <Empty text="لا مطالبات" /> : <div className="tscroll" style={{ maxHeight: 'none' }}><table className="t ruled"><thead><tr><th>رقم المطالبة</th><th>العميل</th><th>رقم الفاتورة</th><th>التاريخ</th><th>الاستحقاق</th><th className="num">بدون الضريبة</th><th className="num">الإجمالي</th><th className="num">المحصّل</th><th className="num">المتبقي</th><th>الحالة</th></tr></thead><tbody>
        {data.claims.map((c) => <tr key={c.id}><td className="mono"><Link to={`/engagements/${c.engagement_id}`}>{c.claim_no}</Link></td><td><Link to={`/clients/${c.client_id}`}>{c.client_name}</Link></td><td>{c.external_invoice_no ?? <span className="muted">—</span>}</td><td>{fmtDate(c.issue_date)}</td><td>{c.due_date ? fmtDate(c.due_date) : '—'}</td>
          <td className="num"><Money v={c.amount} /></td><td className="num"><Money v={c.total} /></td><td className="num"><Money v={c.paid} /></td><td className="num"><b><Money v={c.balance} /></b></td><td><span className={`badge ${CLAIM_STATE[c.state][1]}`}>{CLAIM_STATE[c.state][0]}{c.state === 'overdue' ? ` ${c.age_days} يومًا` : ''}</span></td></tr>)}</tbody></table></div>}
      {data && data.totals.count > data.per && <div className="pg"><span className="muted">صفحة {page} من {Math.ceil(data.totals.count / data.per)}</span><button className="pgb" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><button className="pgb" disabled={page >= Math.ceil(data.totals.count / data.per)} onClick={() => setPage(page + 1)}>›</button></div>}
    </section></div></Page>;
}

export function FinancePayments() {
  const [q, setQ] = useState('');
  const { data, loading } = useLoad(() => get<{ payments: Record<string, string>[]; total: number }>(`/finance/payments?q=${encodeURIComponent(q)}`), [q]);
  const M: Record<string, string> = { bank: 'تحويل بنكي', cash: 'نقدًا', cheque: 'شيك', card: 'بطاقة', other: 'أخرى' };
  return <Page title="التحصيلات" sub="كل المبالغ المحصّلة من العملاء على مطالباتهم (جزئية أو كاملة). يُسجَّل التحصيل من صفحة الارتباط.">
    <div className="card"><div className="row" style={{ marginBottom: 12 }}><SearchBox value={q} onChange={setQ} placeholder="رقم السند أو المطالبة أو العميل أو المرجع…" />{data && <span className="badge ok" style={{ height: 30 }}>الإجمالي {fmtMoney(data.total)}</span>}</div>
      {loading || !data ? <Spinner /> : !data.payments.length ? <Empty text="لا تحصيلات بعد" /> : <table className="t ruled"><thead><tr><th>رقم السند</th><th>التاريخ</th><th>العميل</th><th>المطالبة</th><th>رقم الفاتورة</th><th>الطريقة</th><th>المرجع</th><th className="num">المبلغ</th></tr></thead><tbody>
        {data.payments.map((p) => <tr key={p.id}><td className="mono">{p.payment_no}</td><td>{fmtDate(p.pay_date)}</td><td><Link to={`/clients/${p.client_id}`}>{p.client_name}</Link></td><td className="mono">{p.claim_no}</td><td>{p.external_invoice_no ?? '—'}</td><td>{M[p.method] ?? p.method}</td><td>{p.reference ?? '—'}</td><td className="num"><b><Money v={p.amount} /></b></td></tr>)}</tbody></table>}</div></Page>;
}

export function FinanceReceivables() {
  const { data, loading } = useLoad(() => get<{ clients: Record<string, string | number>[]; totals: Record<string, number> }>('/finance/receivables'), []);
  const B: [string, string][] = [['not_due', 'لم يحن'], ['d30', 'حتى 30'], ['d60', '31 إلى 60'], ['d90', '61 إلى 90'], ['d90p', 'أكثر من 90']];
  return <Page title="أعمار المستحقات" sub="المتبقي على العملاء من المطالبات (شامل الضريبة) موزعًا حسب أيام التأخر عن تاريخ الاستحقاق.">
    {loading || !data ? <Spinner /> : <div className="dgrid"><section className="card s5"><div className="mk"><small>إجمالي المستحق</small><b>{fmtMoney(data.totals.total ?? 0)}</b></div><AgingBar buckets={B.map(([k, l]) => ({ label: l, v: Number(data.totals[k] ?? 0) }))} /></section>
      <section className="card s7">{!data.clients.length ? <Empty text="لا مستحقات على العملاء" /> : <table className="t ruled"><thead><tr><th>العميل</th>{B.map(([, l]) => <th key={l} className="num">{l}</th>)}<th className="num">الإجمالي</th><th className="num">أقدم تأخر</th></tr></thead><tbody>
        {data.clients.map((c) => <tr key={String(c.client_id)}><td><Link to={`/clients/${c.client_id}`}><b>{c.client_name}</b></Link><div className="muted">{c.claims} مطالبات</div></td>{B.map(([k]) => <td key={k} className="num"><Money v={c[k]} /></td>)}<td className="num"><b><Money v={c.total} /></b></td><td className="num">{Number(c.oldest) > 0 ? `${c.oldest} يومًا` : '—'}</td></tr>)}</tbody>
        <tfoot><tr className="total"><td>الإجمالي</td>{B.map(([k]) => <td key={k} className="num"><Money v={data.totals[k]} /></td>)}<td className="num"><Money v={data.totals.total} /></td><td></td></tr></tfoot></table>}</section></div>}</Page>;
}

type Overview = { year: number; billed: number; collected: number; collection_rate: number | null; outstanding: number; months: { m: number; billed: number; collected: number }[]; earned: number; unbilled: number; deferred: number; mix: { type: string; fee: number }[]; pipeline: { label: string; n: number }[]; target: number | null;
  engagements: { id: string; client_id: string; client_name: string; engagement_type: string; title: string; lifecycle: string | null; fee: number; billed: number; collected_net: number; remaining: number; progress: { done: number; total: number } }[] };
export function FinanceRevenue() {
  const { can } = useAuth(); const { run } = useAction(); const [year, setYear] = useState(new Date().getFullYear());
  // السنة الافتراضية = السنة المالية الحالية للمكتب من إعداداته
  useEffect(() => { get<{ year: number }>('/office/fiscal-year').then((r) => setYear(r.year)).catch(() => undefined); }, []);
  const { data, loading, reload } = useLoad(() => get<Overview>(`/finance/overview?year=${year}`), [year]);
  const [target, setTarget] = useState('');
  return <Page title="إيرادات المكتب" sub="الإيراد على أساسين معًا: المحصّل نقدًا، والمكتسب حسب مرحلة تنفيذ كل ارتباط. كل المبالغ بدون ضريبة القيمة المضافة."
    actions={<Field label="السنة"><select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 120 }}>{[0, 1, 2, 3].map((k) => new Date().getFullYear() - k).map((y) => <option key={y} value={y}>{y}</option>)}</select></Field>}>
    {loading || !data ? <Spinner /> : <div className="dgrid">
      {([['المفوتر', data.billed, ''], ['المحصّل', data.collected, 'okt'], ['المكتسب حسب التنفيذ', data.earned, ''], ['أعمال لم يُطالب بها', data.unbilled, 'warnt']] as const).map(([l, v, c]) => <div key={l} className="card mk s3"><small>{l}</small><b className={c}>{fmtMoney(v)}</b></div>)}
      <section className="card s8"><div className="ch"><span>المفوتر مقابل المحصّل شهريًا {data.year}</span></div><Butterfly rows={data.months.map((m) => ({ label: MONTHS[m.m - 1], left: m.billed, right: m.collected }))} leftLabel="المفوتر" rightLabel="المحصّل" /></section>
      <section className="card s4"><div className="ch"><span>التحقق مقابل الهدف</span></div><div style={{ display: 'flex', justifyContent: 'center' }}><Gauge ratio={data.target ? data.billed / data.target : 0} label={data.target ? `${Math.round(data.billed / data.target * 100)}%` : '—'} sub={data.target ? `من هدف ${fmtMoney(data.target, 0)}` : 'لم يُحدد هدف'} /></div>
        {can('finance.manage') && <div className="row"><input type="number" placeholder="هدف السنة (ريال)" value={target} onChange={(e) => setTarget(e.target.value)} /><button className="btn sec" onClick={async () => { await run(() => put('/finance/target', { revenue_target: target ? Number(target) : null }), 'حُفظ الهدف'); reload(); }}>حفظ الهدف</button></div>}
        <div className="kvs" style={{ marginTop: 12 }}><div><small>نسبة التحصيل</small><b>{data.collection_rate != null ? `${data.collection_rate}%` : '—'}</b></div><div><small>المستحق على العملاء</small><b>{fmtMoney(data.outstanding)}</b></div><div><small>مفوتر لم يُكتسب (مقدّم)</small><b>{fmtMoney(data.deferred)}</b></div></div></section>
      <section className="card s4"><div className="ch"><span>مزيج الخدمات</span></div>{data.mix.length ? <Donut items={data.mix.map((x) => ({ label: ENG_TYPE[x.type] ?? x.type, value: x.fee }))} center={String(data.mix.length)} centerSub="نوع خدمة" /> : <Empty text="لا خطابات موقعة بعد" />}</section>
      <section className="card s8"><div className="ch"><span>الإيراد حسب الارتباط</span></div><table className="t ruled"><thead><tr><th>العميل والارتباط</th><th>التنفيذ</th><th className="num">الأتعاب</th><th className="num">المكتسب</th><th className="num">المفوتر</th><th className="num">المحصّل</th><th className="num">المتبقي</th></tr></thead><tbody>
        {data.engagements.filter((e) => e.fee > 0).map((e) => <tr key={e.id}><td><Link to={`/engagements/${e.id}`}><b>{e.client_name}</b></Link><div className="muted">{ENG_TYPE[e.engagement_type] ?? e.engagement_type}</div></td><td>{e.progress.done}/{e.progress.total}</td><td className="num"><Money v={e.fee} /></td><td className="num"><Money v={e.fee * e.progress.done / e.progress.total} /></td><td className="num"><Money v={e.billed} /></td><td className="num"><Money v={e.collected_net} /></td><td className="num"><b><Money v={e.remaining} /></b></td></tr>)}
        {!data.engagements.some((e) => e.fee > 0) && <tr><td colSpan={7} className="empty">لا ارتباطات بأتعاب محددة</td></tr>}</tbody></table></section>
    </div>}</Page>;
}

const LCL: Record<string, [string, string]> = { draft: ['مسودة', 'neutral'], issued: ['صادر', 'info'], sent: ['بانتظار التوقيع', 'warn'], signed: ['موقّع وساري', 'ok'], closed: ['مُقفل', 'neutral'], cancelled: ['ملغى', 'danger'], none: ['لا يوجد خطاب', 'neutral'] };
export function Letters() {
  const [q, setQ] = useState(''); const [f, setF] = useState('');
  const { data, loading } = useLoad(() => get<Overview>('/finance/overview'), []);
  const rows = (data?.engagements ?? []).filter((e) => matches(`${e.client_name} ${e.title}`, q) && (!f || (e.lifecycle ?? 'none') === f));
  const cnt = (k: string) => (data?.engagements ?? []).filter((e) => (e.lifecycle ?? 'none') === k).length;
  return <Page title="خطابات الارتباط والتوقيع" sub="حالة خطاب كل ارتباط: مسودة، صادر، مرسل بانتظار التوقيع، موقّع وساري، مُقفل. ارفع النسخة الموقعة من صفحة الارتباط فيُنشأ جدول الأتعاب تلقائيًا.">
    {loading || !data ? <Spinner /> : <div className="dgrid"><section className="card s4"><div className="ch"><span>مسار الخطابات</span></div><Funnel steps={data.pipeline.slice(0, 4)} /></section>
      <section className="card s8"><div className="row" style={{ marginBottom: 12 }}><SearchBox value={q} onChange={setQ} placeholder="ابحث باسم العميل أو الارتباط…" /></div>
        <div className="segtabs">{([['', 'الكل', data.engagements.length], ['sent', 'بانتظار التوقيع', cnt('sent') + cnt('issued')], ['signed', 'سارية', cnt('signed')], ['draft', 'مسودات', cnt('draft') + cnt('none')], ['closed', 'مُقفلة', cnt('closed')]] as const).map(([k, l, n]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}<em>{n}</em></button>)}</div>
        <table className="t ruled"><thead><tr><th>العميل والارتباط</th><th>حالة الخطاب</th><th className="num">الأتعاب</th><th className="num">المحصّل</th><th></th></tr></thead><tbody>
          {rows.map((e) => { const s = LCL[e.lifecycle ?? 'none']; return <tr key={e.id}><td><b>{e.client_name}</b><div className="muted">{ENG_TYPE[e.engagement_type] ?? e.title}</div></td><td><span className={`badge ${s[1]}`}>{s[0]}</span></td><td className="num"><Money v={e.fee} /></td><td className="num"><Money v={e.collected_net} /></td>
            <td className="row" style={{ minWidth: 0 }}><Link className="btn sec sm" to={`/engagements/${e.id}/letter`}>الخطاب</Link><Link className="btn sm" to={`/engagements/${e.id}#finance`}>الدورة المالية</Link></td></tr>; })}
          {!rows.length && <tr><td colSpan={5} className="empty">لا خطابات</td></tr>}</tbody></table></section></div>}</Page>;
}
