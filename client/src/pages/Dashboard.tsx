import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ReceiptText, Link2, Info, Hourglass, Clock3, RefreshCw, CalendarDays, Users, Zap, Maximize2, ChartLine, BarChart3 } from 'lucide-react';
import { get } from '../api';
import { Spinner, useLoad, useToast } from '../components/ui';
import { Icon } from '../components/nav';
import { CountUp, HeroWaves, Hub, type HubNode } from '../components/glass';
import { fmtDate, fmtMoney, ENG_TYPE, ACTION_LABELS, countAr } from '../format';
import { useAuth } from '../auth';

type Fin = { year: number; billed: number; collected: number; collected_gross: number; collection_rate: number | null; outstanding: number; aging: { key: string; label: string; v: number }[]; late_clients: number; months: { m: number; billed: number; collected: number }[];
  earned: number; unbilled: number; deferred: number; awaiting_signature: { count: number; value: number }; pipeline: { key: string; label: string; n: number }[]; mix: { type: string; fee: number }[]; target: number | null };
type Data = { counts: Record<string, string>; finance: Fin; deadlines: { date: string; title: string; client: string; tone: string }[]; top: { id: string; client_name: string; engagement_type: string; title: string; lifecycle: string | null; fee: number; collected_net: number; remaining: number; progress: { done: number; total: number } }[];
  team: { full_name: string; engagements: string }[]; activity: { action: string; created_at: string; user_name: string | null; client_name: string | null }[]; office_configured: boolean };
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const LC: Record<string, [string, string]> = { draft: ['مسودة خطاب', 'neutral'], issued: ['خطاب صادر', 'info'], sent: ['بانتظار التوقيع', 'warn'], signed: ['تحت التنفيذ', 'ok'], closed: ['مُقفل', 'neutral'], cancelled: ['ملغى', 'danger'] };
const AGE_DOT = ['#f6c344', '#f6c344', '#7cc4ff', '#7cc4ff', '#ff6b8a'];
const compact = (v: number) => Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : String(Math.round(v));

/** يصغّر الدائرة المركزية لتلائم عرض عمودها */
function Fit({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null); const [s, setS] = useState(1);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setS(Math.max(.55, Math.min(1.75, el.clientWidth / w, el.clientHeight / h)))); ro.observe(el); return () => ro.disconnect(); }, [w, h]);
  return <div ref={ref} className="fit"><div style={{ width: w, height: h, transform: `scale(${s})` }}>{children}</div></div>;
}
function Gauge2({ ratio }: { ratio: number }) {
  const [p, setP] = useState(0); useEffect(() => { const t = setTimeout(() => setP(Math.max(0, Math.min(1, ratio))), 80); return () => clearTimeout(t); }, [ratio]);
  const arc = 263.9 * p;
  return <svg className="g2" viewBox="0 0 132 132" role="img" aria-label={`نسبة التحصيل ${Math.round(ratio * 100)}%`}><defs><linearGradient id="g2g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#1c6cff" /><stop offset="1" stopColor="#55b9ff" /></linearGradient><radialGradient id="g2in"><stop offset="0" stopColor="#0d2a66" /><stop offset="1" stopColor="#061536" /></radialGradient></defs>
    <circle cx="66" cy="66" r="44" fill="url(#g2in)" /><g transform="rotate(135 66 66)"><circle cx="66" cy="66" r="56" fill="none" stroke="#56627a" strokeWidth="10" strokeLinecap="round" strokeDasharray="263.9 351.9" />
      <circle cx="66" cy="66" r="56" fill="none" stroke="url(#g2g)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${arc} 351.9`} className="g2a" />
      {p > .02 && <circle cx="66" cy="66" r="56" fill="none" stroke="#f6c344" strokeWidth="10" strokeLinecap="round" strokeDasharray={`0 ${Math.max(0, arc - 14)} 14 351.9`} className="g2a" />}</g>
    <text x="66" y="68" textAnchor="middle" className="g2v">{Math.round(ratio * 100)}%</text><text x="66" y="88" textAnchor="middle" className="g2l">نسبة التحصيل</text></svg>;
}

/** الترحيب في سطر السياق بالشريط العلوي (كما في التصور) */
function Hello({ name }: { name: string }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setSlot(document.getElementById('ctx-slot')); }, []);
  const el = <div className="hello-in"><span className="wave-hand" aria-hidden="true">👋</span><div className="hi"><b>مرحبًا {name}</b><span>نظرة شاملة على أداء المكتب اليوم</span></div></div>;
  return slot ? createPortal(el, slot) : el;
}

export function Dashboard() {
  const { can, user } = useAuth(); const nav = useNavigate(); const { show: toast } = useToast();
  const { data, loading, reload } = useLoad(() => get<Data>('/practice/dashboard'), []);
  if (loading || !data) return <Spinner />;
  const c = data.counts; const f = data.finance; const n = (k: string) => Number(c[k] ?? 0);
  const now = new Date(); const greet = now.getHours() < 12 ? 'صباح الخير' : 'مساء الخير';
  const hijri = (() => { try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(now); } catch { return ''; } })();
  const greg = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const shown = f.months.slice(0, Math.max(1, now.getFullYear() === f.year ? now.getMonth() + 1 : 12)); const mx = Math.max(1, ...shown.flatMap((m) => [m.billed, m.collected]));
  const ratio = f.billed ? f.collected / f.billed : 0; const ageTot = f.aging.reduce((t, b) => t + b.v, 0);
  const kpis: [string, string, number, string, string, number?][] = [
    ['contact', 'عملاء نشطون', n('clients'), n('group_companies') ? `+ ${n('group_companies')} شركة ضمن مجموعات` : 'عملاء رئيسيون', 'blue'],
    ['briefcase', 'تحت التنفيذ', n('active_engagements'), `أعمال لم يُطالب بها ${fmtMoney(f.unbilled, 0)}`, 'blue'],
    ['flag', 'ملاحظات مرتفعة', n('high_findings'), n('high_findings') ? `في ${countAr(n('high_findings_engs'), { one: 'ارتباط واحد', two: 'ارتباطين', few: 'ارتباطات', many: 'ارتباطًا' })}` : 'لا ملاحظات مرتفعة', 'pink'],
    ['requests', 'طلبات معلّقة', n('requests'), `منها ${n('requests_essential')} أساسية`, 'gold'],
    ['revenue', `المفوتر ${f.year}`, f.billed, `المكتسب حسب التنفيذ ${fmtMoney(f.earned, 0)}`, 'blue'],
    ['payments', 'المحصّل', f.collected, f.collection_rate != null ? `${f.collection_rate}% من المفوتر | بدون الضريبة` : 'لا مطالبات بعد', 'green'],
    ['aging', 'المستحق على العملاء', f.outstanding, f.late_clients ? `${f.late_clients} متأخرون أكثر من 60 يومًا` : 'شامل الضريبة', 'gold'],
    ['letter', 'بانتظار التوقيع', f.awaiting_signature.count, f.awaiting_signature.count ? `قيمتها ${fmtMoney(f.awaiting_signature.value, 0)}` : 'لا خطابات معلّقة', 'gold'],
  ];
  const next = data.deadlines[0];
  const nodes: HubNode[] = [
    { label: 'التحليل المالي', icon: 'gbars', big: true, to: '/analysis', info: n('high_findings') ? `${n('high_findings')} ملاحظات مرتفعة مفتوحة` : 'لا ملاحظات مرتفعة مفتوحة' },
    { label: 'العملاء', icon: 'client', to: '/clients', info: `${n('clients')} عملاء نشطون${n('group_companies') ? ` و${n('group_companies')} شركات ضمن مجموعات` : ''}` },
    { label: 'الإعدادات', icon: 'gear', to: data.office_configured ? '/system' : '/office', info: data.office_configured ? 'هوية المكتب مضبوطة' : 'هوية المكتب لم تُضبط بعد' },
    { label: 'المستندات', icon: 'folder', to: '/upload', info: `${n('requests')} طلبات معلقة من العملاء` },
    { label: 'الارتباطات', icon: 'link', to: '/engagements', info: `${n('active_engagements')} ارتباطات تحت التنفيذ` },
    { label: 'المهام', icon: 'cal', to: '/tasks', info: next ? `${next.title} (${fmtDate(next.date)})` : 'لا مواعيد قريبة' },
    { label: 'المالية', icon: 'coins', to: '/finance/receivables', info: `مستحق ${fmtMoney(f.outstanding)}${f.collection_rate != null ? ` · تحصيل ${Math.round(f.collection_rate)}%` : ''}` },
    { label: 'التقارير', icon: 'bbars', to: '/reports', info: `${n('draft_reports')} مسودات و${n('reports_awaiting')} بانتظار الاعتماد` },
  ];
  const quick = ([['/clients?new=1', 'users', 'عميل جديد', 'clients.manage'], ['/engagements?new=1', 'briefcase', 'ارتباط جديد', 'clients.manage'], ['/upload', 'upload', 'رفع ميزان', 'documents.upload'], ['/letters', 'letter', 'خطابات الارتباط', 'clients.view'], ['/finance/claims', 'claims', 'مطالبة جديدة', 'finance.view']] as const).filter(([, , , p]) => can(p));
  return <div className="gd">
    <Hello name={user?.full_name ?? ''} />
    <div className="gd-hello">{!data.office_configured && <div className="gd-notice"><Info size={16} /><span><b>لم تُضبط هوية المكتب بعد:</b> <Link to="/office">اضبط اسم المكتب وشعاره</Link> ليظهرا في البرنامج والتقارير.</span></div>}
      <button className="gd-refresh" onClick={() => { reload(); toast('تم تحديث أرقام اللوحة'); }} title="تحديث الأرقام" aria-label="تحديث الأرقام"><RefreshCw size={15} /></button></div>

    <section className="gp gd-hero"><HeroWaves />
      <div className="gh-txt"><div className="gh-date">{greet}، {user?.full_name} | {greg}{hijri ? ` | ${hijri}` : ''}</div>
        <h1>المكتب يدير <span className="gold">{countAr(n('clients'), { one: 'عميلًا واحدًا', two: 'عميلين', few: 'عملاء', many: 'عميلًا' })}</span> و<span className="gold">{countAr(n('active_engagements'), { one: 'ارتباطًا واحدًا', two: 'ارتباطين', few: 'ارتباطات', many: 'ارتباطًا' })}</span> تحت التنفيذ{f.outstanding > 0 && <>، ومستحق لك <span className="gold"><CountUp value={f.outstanding} dec={2} /> ريال</span></>}</h1>
        <div className="gh-btns">{can('clients.manage') && <Link className="gbtn pri" to="/engagements?new=1"><Plus size={18} />ارتباط جديد</Link>}{can('finance.view') && <Link className="gbtn" to="/finance/claims"><ReceiptText size={18} />المطالبات</Link>}{can('finance.view') && <Link className="gbtn" to="/finance/payments"><Link2 size={18} />التحصيلات</Link>}</div></div>
      <div className="gh-gauge"><div className="gv"><small>المفوتر {f.year}</small><b><CountUp value={f.billed} /></b><small>المحصّل</small><b><CountUp value={f.collected} /></b><small>{f.target ? `هدف ${f.year}` : 'المستحق'}</small><b><CountUp value={f.target ?? f.outstanding} /></b></div><Gauge2 ratio={ratio} /></div></section>

    <section className="gd-kpis">{kpis.map(([ic, l, v, s, tone]) => <div key={l} className="gp gk"><div className="gk-t"><span className={`tile ${tone}`}><Icon n={ic} size={17} /></span><span>{l}</span></div><b className="gk-v"><CountUp value={v} /></b><small>{s}</small></div>)}</section>

    <section className="gd-mid">
      <div className="gp gpan"><div className="gph"><span><Hourglass size={19} className="goldi" />أعمار المستحقات</span><Link to="/finance/receivables" className="gx" title="التفاصيل"><Maximize2 size={15} /></Link></div>
        <small className="gsub">إجمالي المستحق على العملاء (شامل الضريبة)</small><b className="gbig"><CountUp value={f.outstanding} dec={2} /></b>
        <div className="gtrack"><i style={{ width: ageTot ? '100%' : '0%' }} /></div>
        <div className="gage">{f.aging.filter((b, i) => i === 0 || b.key !== 'd90' || b.v > 0).map((b, i) => <div key={b.key}><span className="d" style={{ background: AGE_DOT[i], boxShadow: `0 0 7px ${AGE_DOT[i]}` }} /><span className="l">{b.label}</span><b><CountUp value={b.v} dec={2} /></b><small>{ageTot ? Math.round(b.v / ageTot * 100) : 0}%</small></div>)}</div></div>

      <div className="gd-hub"><Fit w={395} h={263}><Hub nodes={nodes} onOpen={(to) => nav(to)} /></Fit></div>

      <div className="gp gpan"><div className="gph"><span><BarChart3 size={19} />المفوتر مقابل المحصّل شهريًا {f.year}</span><Link to="/finance/revenue" className="gx" title="إيرادات المكتب"><Maximize2 size={15} /></Link></div>
        <div className="gleg"><span><i className="b" />المفوتر</span><span><i className="c" />المحصّل</span><small>بدون الضريبة</small></div>
        <div className="gch">{shown.map((m) => <div key={m.m} className="gcr" title={`${MONTHS[m.m - 1]}: المفوتر ${fmtMoney(m.billed)} | المحصّل ${fmtMoney(m.collected)}`}><span>{MONTHS[m.m - 1]}</span><div className="gcb"><i className="b" style={{ width: `${m.billed / mx * 100}%` }} /><i className="c" style={{ width: `${m.collected / mx * 100}%` }} /></div></div>)}</div>
        <div className="gtot"><span>{compact(f.billed)}</span><i className="b" style={{ flex: Math.max(f.billed, 1) }} /><i className="c" style={{ flex: Math.max(f.collected, f.billed ? 0 : 1) }} /><span>{compact(f.collected)}</span></div></div>

      <div className="gp gpan"><div className="gph"><span><ChartLine size={19} />مسار الارتباطات</span><Link to="/engagements" className="gx" title="الارتباطات"><Maximize2 size={15} /></Link></div>
        <div className="gfun">{f.pipeline.map((p, i) => <div key={p.key} className={`gfs${p.n ? ' hot' : ''}`} style={{ width: `${[56, 64, 88, 96, 66, 72][i] ?? 70}%` }}><span>{p.label}</span><b>{p.n}</b></div>)}</div>
        <div className="gfoot">من مسودة الخطاب إلى التحصيل الكامل</div></div>
    </section>

    <section className="gd-low">
      <div className="gp gpan wide"><div className="gph"><span><Users size={19} className="bluei" />أهم العملاء والارتباطات</span><Link to="/clients" className="gx" title="بيت العملاء"><Maximize2 size={15} /></Link></div>
        <div className="gtop"><div className="th"><span>العميل والخدمة</span><span>التنفيذ</span><span>الأتعاب</span><span>المحصّل</span><span>المتبقي</span><span>الحالة</span></div>
          {data.top.slice(0, 3).map((e) => <Link key={e.id} to={`/engagements/${e.id}`} className="tr"><span className="cn"><Info size={18} /><span><b>{e.client_name}</b><small>{ENG_TYPE[e.engagement_type] ?? e.title.split(' – ')[0]}</small></span></span>
            <span><i className="pb"><i style={{ width: `${e.progress.done / Math.max(1, e.progress.total) * 100}%` }} /></i><small>{e.progress.done}/{e.progress.total}</small></span><span>{fmtMoney(e.fee, 0)}</span><span>{fmtMoney(e.collected_net, 0)}</span><span><b>{fmtMoney(e.remaining, 0)}</b></span>
            <span><em className={`pill ${LC[e.lifecycle ?? 'draft']?.[1] ?? 'neutral'}`}>{LC[e.lifecycle ?? 'draft']?.[0] ?? '—'}</em></span></Link>)}
          {!data.top.length && <div className="empty">لا ارتباطات بعد</div>}</div></div>

      <div className="gp gpan"><div className="gph"><span><CalendarDays size={19} />المواعيد القادمة</span><Link to="/tasks" className="glink">كل المهام</Link></div>
        <div className="gdue">{data.deadlines.slice(0, 2).map((d, i) => { const dt = new Date(d.date + 'T12:00:00'); return <div key={i} className="gdc"><div className="db"><b>{dt.getDate()}</b><small>{MONTHS[dt.getMonth()]}</small></div><div className="dt"><b>{d.title}</b><span>{d.client}</span></div><span className={`dd ${d.tone}`} /></div>; })}{!data.deadlines.length && <div className="empty">لا مواعيد قريبة</div>}</div></div>

      <div className="gp gpan"><div className="gph"><span><RefreshCw size={19} />مزيج الخدمات حسب الأتعاب</span></div>
        <div className="gmix"><svg viewBox="0 0 84 84" className="gdonut" role="img" aria-label="مزيج الخدمات"><circle cx="42" cy="42" r="34" fill="none" stroke="rgba(60,110,200,.25)" strokeWidth="8" />
          {(() => { const tot = f.mix.reduce((t, x) => t + x.fee, 0) || 1; let s = 0; const cols = ['#2f8bff', '#f6c344', '#35d48a', '#ff8aa3', '#b48cff']; return f.mix.map((x, i) => { const len = 213.6 * x.fee / tot; const el = <circle key={x.type} cx="42" cy="42" r="34" fill="none" stroke={cols[i % 5]} strokeWidth="8" strokeDasharray={`${Math.max(0, len - (f.mix.length > 1 ? 2 : 0))} 213.6`} strokeDashoffset={-s} transform="rotate(-90 42 42)" className="gdn" />; s += len; return el; }); })()}
          <text x="42" y="43" textAnchor="middle" className="dv">{f.mix.length}</text><text x="42" y="58" textAnchor="middle" className="dl">نوع خدمة</text></svg>
          <div className="gmx">{f.mix.slice(0, 2).map((x) => <div key={x.type} className="mh"><span title={ENG_TYPE[x.type] ?? x.type}>{ENG_TYPE[x.type] ?? x.type}</span><b dir="ltr">{Math.round(x.fee / (f.mix.reduce((t, y) => t + y.fee, 0) || 1) * 100)}%</b></div>)}
            <div><span title="المكتسب حسب مرحلة التنفيذ">المكتسب بالتنفيذ</span><b><CountUp value={f.earned} dec={2} /></b></div><div><span title="أعمال منفذة لم يُطالب بها">لم يُطالب به</span><b><CountUp value={f.unbilled} dec={2} /></b></div><div><span title="مفوتر لم يُكتسب بعد">مفوتر لم يُكتسب</span><b><CountUp value={f.deferred} dec={2} /></b></div></div></div></div>

      <div className="gp gpan"><div className="gph"><span><Clock3 size={19} />آخر النشاطات</span><Link to="/audit" className="gx" title="سجل التدقيق"><Maximize2 size={15} /></Link></div>
        <div className="gact">{data.activity.slice(0, 5).map((a, i) => <div key={i}><span className="ib"><Icon n="files" size={13} /></span><span className="t">{ACTION_LABELS[a.action] ?? a.action}</span><span className="tm" dir="ltr">{fmtDate(a.created_at, { time: true })}</span></div>)}{!data.activity.length && <div className="empty">لا نشاطات</div>}</div></div>
    </section>

    <section className="gp gd-quick"><div className="qt"><span>إجراءات سريعة</span><Zap size={19} /></div>
      {quick.map(([to, ic, l]) => <Link key={to} to={to} className="qb"><Icon n={ic} size={21} /><span>{l}</span></Link>)}
      <button type="button" className="qb ai" onClick={() => window.dispatchEvent(new Event('open-assistant'))}><Icon n="sparkles" size={21} /><span>المحاسب الذكي</span></button></section>
  </div>;
}
