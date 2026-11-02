import { Link } from 'react-router-dom';
import { get } from '../api';
import { Page, useLoad, Spinner, Empty } from '../components/ui';
import { fmtDate, ENG_STATUS } from '../format';

export function Dashboard() {
  const { data, loading } = useLoad(() => get<{ counts: Record<string, string>; recent_engagements: Record<string, string>[]; recent_activity: Record<string, string>[]; office_configured: boolean }>('/dashboard'), []);
  if (loading || !data) return <Spinner />;
  const c = data.counts;
  return <Page title="لوحة التحكم" sub="نظرة عامة على العملاء والارتباطات والملاحظات المفتوحة">
    {!data.office_configured && <div className="alert warn">لم تُضبط هوية المكتب بعد. <Link to="/office">اضبط اسم المكتب والترويسة</Link> قبل إصدار أي تقرير.</div>}
    <div className="grid c4">
      <div className="card stat"><div className="v">{c.clients}</div><div className="l">عميل فعلي {Number(c.demo_clients) > 0 && <span className="demo-tag">+{c.demo_clients} تجريبي</span>}</div></div>
      <div className="card stat"><div className="v">{c.active_engagements}</div><div className="l">ارتباط نشط</div></div>
      <div className={`card stat ${Number(c.high_findings) > 0 ? 'danger' : ''}`}><div className="v">{c.open_findings}</div><div className="l">ملاحظة مفتوحة ({c.high_findings} مرتفعة/حرجة)</div></div>
      <div className={`card stat ${Number(c.reports_awaiting_approval) > 0 ? 'warn' : ''}`}><div className="v">{c.reports_awaiting_approval}</div><div className="l">تقرير بانتظار الاعتماد ({c.draft_reports} مسودة)</div></div>
    </div>
    <div className="grid c2">
      <div className="card"><h2>الارتباطات الأخيرة</h2>{data.recent_engagements.length ? <table className="t"><thead><tr><th>الارتباط</th><th>العميل</th><th>الحالة</th><th>ملاحظات مفتوحة</th></tr></thead><tbody>
        {data.recent_engagements.map((e) => <tr key={e.id}><td><Link to={`/engagements/${e.id}`}>{e.title}</Link></td><td>{e.client_name} {e.is_demo && <span className="demo-tag">تجريبي</span>}</td><td>{ENG_STATUS[e.status] ?? e.status}</td><td>{e.open_findings}</td></tr>)}
      </tbody></table> : <Empty text="ابدأ بإنشاء عميل ثم ارتباط" />}</div>
      <div className="card"><h2>آخر النشاطات</h2>{data.recent_activity.length ? <table className="t"><thead><tr><th>الإجراء</th><th>المستخدم</th><th>العميل</th><th>الوقت</th></tr></thead><tbody>
        {data.recent_activity.map((a, i) => <tr key={i}><td className="mono" style={{ fontSize: 12 }}>{a.action}</td><td>{a.user_name ?? '—'}</td><td>{a.client_name ?? '—'}</td><td>{fmtDate(a.created_at, { time: true })}</td></tr>)}
      </tbody></table> : <Empty />}</div>
    </div>
    <div className="card"><h2>مسار العمل القياسي</h2><div className="steps">{['إنشاء عميل', 'إنشاء ارتباط', 'رفع الملفات', 'ربط الأعمدة', 'التحقق', 'فحص محاسبي', 'تحليل', 'مراجعة الملاحظات', 'توليد تقرير', 'تحرير', 'اعتماد', 'تصدير PDF', 'طباعة على الترويسة'].map((s, i) => <div key={s} className="s"><span className="n">{i + 1}</span>{s}</div>)}</div></div>
  </Page>;
}
