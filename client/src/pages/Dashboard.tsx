import { Link } from 'react-router-dom';
import { Plus, ReceiptText, HandCoins, TrendingUp, ArrowLeft, Info } from 'lucide-react';
import { get } from '../api';
import { Spinner, useLoad } from '../components/ui';
import { Icon } from '../components/nav';
import { Gauge, Butterfly, Funnel, Donut, AgingBar } from '../components/charts';
import { fmtDate, fmtMoney, ENG_TYPE, ACTION_LABELS, countAr } from '../format';
import { useAuth } from '../auth';

type Fin = { year: number; billed: number; collected: number; collected_gross: number; collection_rate: number | null; outstanding: number; aging: { key: string; label: string; v: number }[]; late_clients: number; months: { m: number; billed: number; collected: number }[];
  earned: number; unbilled: number; deferred: number; awaiting_signature: { count: number; value: number }; pipeline: { key: string; label: string; n: number }[]; mix: { type: string; fee: number }[]; target: number | null };
type Data = { counts: Record<string, string>; finance: Fin; deadlines: { date: string; title: string; client: string; tone: string }[]; top: { id: string; client_name: string; engagement_type: string; title: string; lifecycle: string | null; fee: number; collected_net: number; remaining: number; progress: { done: number; total: number } }[];
  team: { full_name: string; engagements: string }[]; activity: { action: string; created_at: string; user_name: string | null; client_name: string | null }[]; office_configured: boolean };
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const LC: Record<string, [string, string]> = { draft: ['مسودة خطاب', 'neutral'], issued: ['خطاب صادر', 'info'], sent: ['بانتظار التوقيع', 'warn'], signed: ['تحت التنفيذ', 'ok'], closed: ['مُقفل', 'neutral'], cancelled: ['ملغى', 'danger'] };
const m0 = (v: number) => fmtMoney(v, 0);

export function Dashboard() {
  const { can, user } = useAuth();
  const { data, loading } = useLoad(() => get<Data>('/practice/dashboard'), []);
  if (loading || !data) return <Spinner />;
  const c = data.counts; const f = data.finance; const n = (k: string) => Number(c[k] ?? 0);
  const now = new Date(); const hour = now.getHours();
  const greet = hour < 12 ? 'صباح الخير' : 'مساء الخير';
  const hijri = (() => { try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(now); } catch { return ''; } })();
  const greg = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const monthsShown = f.months.slice(0, Math.max(1, now.getFullYear() === f.year ? now.getMonth() + 1 : 12));
  const kpis: [string, string, string, string, string][] = [
    ['revenue', `إيرادات ${f.year} (مفوترة)`, m0(f.billed), `المكتسب حسب التنفيذ ${m0(f.earned)}`, ''],
    ['payments', 'المحصّل', m0(f.collected), f.collection_rate != null ? `${f.collection_rate}% من المفوتر | بدون الضريبة` : 'لا مطالبات بعد', 'ok'],
    ['aging', 'المستحق على العملاء', m0(f.outstanding), f.late_clients ? `${f.late_clients} عملاء متأخرون أكثر من 60 يومًا` : 'شامل الضريبة', 'warn'],
    ['letter', 'خطابات بانتظار التوقيع', String(f.awaiting_signature.count), f.awaiting_signature.count ? `قيمتها ${m0(f.awaiting_signature.value)}` : 'لا خطابات معلّقة', 'gold'],
    ['contact', 'عملاء نشطون', String(n('clients')), n('group_companies') ? `+ ${n('group_companies')} شركة ضمن مجموعات` : 'عملاء رئيسيون', ''],
    ['briefcase', 'ارتباطات تحت التنفيذ', String(n('active_engagements')), `أعمال لم يُطالب بها ${m0(f.unbilled)}`, ''],
    ['flag', 'ملاحظات مرتفعة مفتوحة', String(n('high_findings')), n('high_findings') ? `في ${n('high_findings_engs')} ارتباط` : 'لا ملاحظات مرتفعة', 'danger'],
    ['requests', 'طلبات عملاء معلّقة', String(n('requests')), `${n('requests_essential')} أساسية`, 'gold'],
  ];
  const ratio = f.billed ? f.collected / f.billed : 0;
  return <div className="dgrid">
    {!data.office_configured && <div className="alert warn s12" style={{ margin: 0 }}><Info size={16} /><span>لم تُضبط هوية المكتب بعد. <Link to="/office">اضبط اسم المكتب وشعاره</Link> ليظهرا في البرنامج والتقارير.</span></div>}
    <section className="hero s12"><div className="hz"><div className="greet">{greet}، {user?.full_name} | {greg}{hijri ? ` | ${hijri}` : ''}</div>
      <h2>المكتب يدير <span className="gl">{countAr(n('clients'), { one: 'عميلًا واحدًا', two: 'عميلين', few: 'عملاء', many: 'عميلًا' })}</span> و<span className="gl">{countAr(n('active_engagements'), { one: 'ارتباطًا واحدًا', two: 'ارتباطين', few: 'ارتباطات', many: 'ارتباطًا' })}</span> تحت التنفيذ{f.outstanding > 0 && <>، ومستحق لك <span className="gl">{fmtMoney(f.outstanding)} ريال</span></>}</h2>
      <div className="hb2">{can('clients.manage') && <Link className="hbtn p" to="/engagements?new=1"><Plus size={16} /> ارتباط جديد</Link>}{can('finance.view') && <Link className="hbtn" to="/finance/claims"><ReceiptText size={16} /> المطالبات</Link>}{can('finance.view') && <Link className="hbtn" to="/finance/payments"><HandCoins size={16} /> التحصيلات</Link>}</div></div>
      <div className="hg"><Gauge ratio={ratio} label={f.billed ? `${Math.round(ratio * 100)}%` : '—'} sub="نسبة التحصيل" size={180} /><div className="hgk"><div><small>المفوتر {f.year}</small><b>{m0(f.billed)}</b></div><div><small>المحصّل</small><b>{m0(f.collected)}</b></div><div><small>{f.target ? `هدف ${f.year}` : 'المستحق'}</small><b>{m0(f.target ?? f.outstanding)}</b></div></div></div></section>
    {kpis.map(([ic, l, v, s, t]) => <div key={l} className="card kt2 s3"><div className="kh"><span className={`ki ${t}`}><Icon n={ic} size={19} /></span><span className="kl">{l}</span></div><div className="kv">{v}</div><div className="ks">{s}</div></div>)}
    <section className="card s8"><div className="ch"><Icon n="chart" size={17} /><span>المفوتر مقابل المحصّل شهريًا {f.year}</span><span className="muted end" style={{ fontSize: 12 }}>بدون ضريبة القيمة المضافة</span></div>
      {f.billed || f.collected ? <Butterfly rows={monthsShown.map((m) => ({ label: MONTHS[m.m - 1], left: m.billed, right: m.collected }))} leftLabel="المفوتر" rightLabel="المحصّل" /> : <div className="empty">لا مطالبات أو تحصيلات في {f.year} بعد. تبدأ من «خطابات الارتباط» بعد توقيع العميل.</div>}</section>
    <section className="card s4"><div className="ch"><Icon n="chartline" size={17} /><span>مسار الارتباطات</span></div><Funnel steps={f.pipeline} /><div className="muted" style={{ textAlign: 'center', marginTop: 8, fontSize: 12 }}>من مسودة الخطاب إلى التحصيل الكامل</div></section>
    <section className="card s4"><div className="ch"><Icon n="aging" size={17} /><span>أعمار المستحقات</span><Link className="end" to="/finance/receivables" style={{ fontSize: 12.5 }}>التفاصيل</Link></div>
      <div className="mk"><small>إجمالي المستحق على العملاء (شامل الضريبة)</small><b>{fmtMoney(f.outstanding)}</b></div><AgingBar buckets={f.aging} /></section>
    <section className="card s4"><div className="ch"><Icon n="revenue" size={17} /><span>مزيج الخدمات حسب الأتعاب</span></div>
      {f.mix.length ? <Donut items={f.mix.map((x) => ({ label: ENG_TYPE[x.type] ?? x.type, value: x.fee }))} center={String(f.mix.length)} centerSub="نوع خدمة" /> : <div className="empty">تظهر بعد توقيع أول خطاب بأتعاب</div>}
      <div className="kvs" style={{ marginTop: 12 }}><div><small>المكتسب حسب مرحلة التنفيذ</small><b>{fmtMoney(f.earned)}</b></div><div><small>أعمال منفذة لم يُطالب بها</small><b>{fmtMoney(f.unbilled)}</b></div><div><small>مفوتر لم يُكتسب بعد</small><b>{fmtMoney(f.deferred)}</b></div></div></section>
    <section className="card s4"><div className="ch"><Icon n="tasks" size={17} /><span>المواعيد القادمة</span><Link className="end" to="/tasks" style={{ fontSize: 12.5 }}>كل المهام</Link></div>
      <div className="dls">{data.deadlines.length ? data.deadlines.map((d, i) => { const dt = new Date(d.date + 'T12:00:00'); return <div className="dl" key={i}><div className="dd"><b>{dt.getDate()}</b><small>{MONTHS[dt.getMonth()]}</small></div><div className="dt"><b>{d.title}</b><small>{d.client}</small></div><span className={`dot ${d.tone}`} /></div>; }) : <div className="empty">لا مواعيد قريبة</div>}</div></section>
    <section className="card s8"><div className="ch"><Icon n="contact" size={17} /><span>أهم العملاء والارتباطات</span><Link className="end" to="/clients" style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>بيت العملاء <ArrowLeft size={14} /></Link></div>
      <div className="tscroll" style={{ maxHeight: 'none', border: 0 }}><table className="t"><thead><tr><th>العميل والخدمة</th><th>التنفيذ</th><th className="num">الأتعاب</th><th className="num">المحصّل</th><th className="num">المتبقي</th><th>الحالة</th></tr></thead><tbody>
        {data.top.map((e) => <tr key={e.id}><td><Link to={`/engagements/${e.id}`} className="cl"><span className="cav">{e.client_name.replace(/^(شركة|مؤسسة|مجموعة|مصنع|مكتب)\s+/, '')[0]}</span><div><b>{e.client_name}</b><small>{ENG_TYPE[e.engagement_type] ?? e.title.split(' – ')[0]}</small></div></Link></td>
          <td><div className="mini"><i style={{ width: `${e.progress.done / e.progress.total * 100}%` }} /></div><small className="muted">{e.progress.done}/{e.progress.total}</small></td><td className="num">{m0(e.fee)}</td><td className="num">{m0(e.collected_net)}</td><td className="num"><b>{m0(e.remaining)}</b></td>
          <td><span className={`badge ${LC[e.lifecycle ?? 'draft']?.[1] ?? 'neutral'}`}>{LC[e.lifecycle ?? 'draft']?.[0] ?? '—'}</span></td></tr>)}
        {!data.top.length && <tr><td colSpan={6} className="empty">لا ارتباطات بعد</td></tr>}</tbody></table></div></section>
    <section className="card s4"><div className="ch"><Icon n="list" size={17} /><span>آخر النشاطات</span></div><div className="tl">{data.activity.map((a, i) => <div className="ev" key={i}><span className="dot2"><Icon n="list" size={14} /></span><div><b>{ACTION_LABELS[a.action] ?? a.action}</b><small>{a.user_name ?? '—'}{a.client_name ? ` | ${a.client_name}` : ''} | {fmtDate(a.created_at, { time: true })}</small></div></div>)}</div></section>
    {data.team.length > 1 ? <section className="card s8"><div className="ch"><Icon n="users" size={17} /><span>عبء العمل على الفريق</span></div>{data.team.map((t) => <div key={t.full_name} className="row" style={{ marginBottom: 10 }}><span className="avatar">{t.full_name[0]}</span><b style={{ width: 140 }}>{t.full_name}</b><div className="mini" style={{ flex: 1, width: 'auto' }}><i style={{ width: `${Math.min(100, Number(t.engagements) * 10)}%` }} /></div><span className="muted">{t.engagements} ارتباطات</span></div>)}</section> : null}
    <section className={`card ${data.team.length > 1 ? 's4' : 's12'}`}><div className="ch"><TrendingUp size={17} /><span>إجراءات سريعة</span></div><div className="qa-grid" style={data.team.length > 1 ? undefined : { gridTemplateColumns: 'repeat(6,1fr)' }}>
      {([['/clients?new=1', 'users', 'عميل جديد', 'clients.manage'], ['/engagements?new=1', 'briefcase', 'ارتباط جديد', 'clients.manage'], ['/upload', 'upload', 'رفع ميزان', 'documents.upload'], ['/letters', 'letter', 'خطابات الارتباط', 'clients.view'], ['/finance/claims', 'claims', 'مطالبة جديدة', 'finance.view'], ['/ai', 'sparkles', 'المحاسب الذكي', 'clients.view']] as const).filter(([, , , p]) => can(p)).map(([to, ic, l]) => <Link key={to} to={to} className="qa"><Icon n={ic} size={20} /><span>{l}</span></Link>)}</div></section>
  </div>;
}
