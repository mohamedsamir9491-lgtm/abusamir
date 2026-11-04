import { Link } from 'react-router-dom';
import { get } from '../api';
import { Page, useLoad, Spinner, Empty } from '../components/ui';
import { Icon } from '../components/Layout';
import { fmtDate, ENG_STATUS, ENG_TYPE, ACTION_LABELS } from '../format';
import { useAuth } from '../auth';


export function Dashboard() {
  const { can } = useAuth();
  const { data, loading } = useLoad(() => get<{ counts: Record<string, string>; recent_engagements: Record<string, string>[]; recent_activity: Record<string, string>[]; office_configured: boolean }>('/dashboard'), []);
  if (loading || !data) return <Spinner />;
  const c = data.counts; const n = (k: string) => Number(c[k] ?? 0);
  const stages: [string, string][] = [['planning', 'تخطيط'], ['data_collection', 'جمع بيانات'], ['analysis', 'تحليل'], ['review', 'مراجعة'], ['reporting', 'تقارير'], ['closed', 'مغلق']];
  const byStage = Object.fromEntries(stages.map(([k]) => [k, data.recent_engagements.filter((e) => e.status === k).length]));
  return <Page title="لوحة التحكم" sub="نظرة عامة على العملاء والارتباطات والملاحظات المفتوحة وما ينتظر قرارك">
    {!data.office_configured && <div className="alert warn"><Icon n="stamp" /> <span>لم تُضبط هوية المكتب بعد. <Link to="/office">اضبط اسم المكتب والترويسة</Link> قبل إصدار أي تقرير أو خطاب.</span></div>}
    <div className="grid c4">
      <div className="card stat"><div className="ic"><Icon n="users" size={22} /></div><div><div className="v">{c.clients}</div><div className="l">عميل فعلي {n('demo_clients') > 0 && <span className="demo-tag">+{c.demo_clients} تجريبي</span>}</div></div></div>
      <div className="card stat ok"><div className="ic"><Icon n="briefcase" size={22} /></div><div><div className="v">{c.active_engagements}</div><div className="l">ارتباط نشط</div></div></div>
      <div className={`card stat ${n('high_findings') > 0 ? 'danger' : ''}`}><div className="ic"><Icon n="flag" size={22} /></div><div><div className="v">{c.open_findings}</div><div className="l">ملاحظة مفتوحة ({c.high_findings} مرتفعة/حرجة)</div></div></div>
      <div className={`card stat ${n('reports_awaiting_approval') > 0 ? 'warn' : ''}`}><div className="ic"><Icon n="file" size={22} /></div><div><div className="v">{c.reports_awaiting_approval}</div><div className="l">تقرير بانتظار الاعتماد ({c.draft_reports} مسودة)</div></div></div>
    </div>
    <div className="grid c3" style={{ alignItems: 'start' }}>
      <div className="card" style={{ gridColumn: 'span 2' }}><h2>الارتباطات الأخيرة</h2>{data.recent_engagements.length ? <table className="t"><thead><tr><th>العميل والارتباط</th><th>الحالة</th><th className="num">ملاحظات مفتوحة</th><th>آخر تحديث</th></tr></thead><tbody>
        {data.recent_engagements.map((e) => <tr key={e.id}><td className="wrap"><Link to={`/engagements/${e.id}`}><b>{e.client_name}</b></Link>{e.is_demo && <span className="demo-tag" style={{ marginInlineStart: 6 }}>تجريبي</span>}
          <div className="muted">{ENG_TYPE[e.engagement_type] ?? e.title}{e.period_label ? ` | ${e.period_label}` : ''}{Number(e.components) > 0 ? ` | ${Number(e.components) + 1} شركات` : ''}</div></td>
          <td><span className={`badge ${e.status === 'closed' ? 'neutral' : e.status === 'reporting' ? 'ok' : 'info'}`}>{ENG_STATUS[e.status] ?? e.status}</span></td><td className="num">{Number(e.open_findings) ? <span className="badge warn">{e.open_findings}</span> : '—'}</td><td className="muted">{fmtDate(e.updated_at)}</td></tr>)}
      </tbody></table> : <Empty text="ابدأ بإنشاء عميل ثم ارتباط" />}</div>
      <div>
        <div className="card"><h2>إجراءات سريعة</h2><div className="quick">
          {can('clients.manage') && <Link to="/clients"><Icon n="users" /> عميل جديد<small>سجل ومعلومات اتصال</small></Link>}
          {can('clients.manage') && <Link to="/engagements?new=1"><Icon n="briefcase" /> ارتباط جديد<small>ثم خطاب الارتباط</small></Link>}
          {can('documents.upload') && <Link to="/upload"><Icon n="upload" /> رفع ميزان<small>Excel / CSV / PDF</small></Link>}
          <Link to="/reports"><Icon n="file" /> التقارير<small>توليد ومراجعة واعتماد</small></Link>
        </div></div>
        <div className="card"><h2>مراحل الارتباطات الأخيرة</h2><div className="pipe">{stages.map(([k, l]) => <div key={k} className="st"><b>{byStage[k]}</b><span>{l}</span></div>)}</div></div>
      </div>
    </div>
    <div className="card"><h2>آخر النشاطات</h2>{data.recent_activity.length ? <table className="t"><thead><tr><th>الإجراء</th><th>المستخدم</th><th>العميل</th><th>الوقت</th></tr></thead><tbody>
      {data.recent_activity.map((a, i) => <tr key={i}><td>{ACTION_LABELS[a.action] ?? a.action}</td><td>{a.user_name ?? '—'}</td><td>{a.client_name ?? '—'}</td><td className="muted">{fmtDate(a.created_at, { time: true })}</td></tr>)}
    </tbody></table> : <Empty />}</div>
  </Page>;
}
