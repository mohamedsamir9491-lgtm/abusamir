import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

const NAV = [
  ['/', 'لوحة التحكم', 'clients.view'], ['/clients', 'العملاء', 'clients.view'], ['/engagements', 'الارتباطات', 'clients.view'], ['/upload', 'رفع المستندات', 'documents.upload'], ['/imports', 'الاستيراد والتحقق', 'clients.view'],
  ['/trial-balance', 'ميزان المراجعة', 'clients.view'], ['/analysis', 'التحليل المالي', 'clients.view'], ['/consolidation', 'التوحيد الدفتري', 'clients.view'], ['/ai', 'المحاسب الذكي', 'clients.view'], ['/findings', 'الملاحظات والتسويات', 'clients.view'], ['/reports', 'التقارير', 'clients.view'],
  ['/templates', 'قوالب التقارير', 'clients.view'], ['/office', 'ترويسة المكتب', 'clients.view'], ['/users', 'المستخدمون والصلاحيات', 'users.manage'], ['/audit', 'سجل التدقيق', 'audit.view'], ['/system', 'إعدادات النظام', 'audit.view'],
] as const;

export function Layout() {
  const { user, loading, logout, can } = useAuth();
  if (loading) return <div className="empty">جارٍ التحميل…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><b>منصة التحليل المالي</b><span>والتقارير المحاسبية</span></div>
      <nav>{NAV.filter(([, , perm]) => can(perm)).map(([to, label], i) => <NavLink key={to} to={to} end={to === '/'}><span className="num">{i + 1}</span>{label}</NavLink>)}</nav>
      <div className="user"><div><b>{user.full_name}</b></div><div style={{ opacity: .8 }}>{user.email}</div><button className="btn sec sm" onClick={logout}>تسجيل الخروج</button></div>
    </aside>
    <main className="main"><Outlet /></main>
  </div>;
}
