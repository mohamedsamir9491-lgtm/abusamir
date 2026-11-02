import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

/** أيقونات خطية بسيطة (SVG) بلا مكتبات خارجية */
const I: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z', users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  briefcase: 'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2', upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  import: 'M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 0 9H7M12 12v9m0 0l-3-3m3 3l3-3', table: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18', chart: 'M3 3v18h18M7 14l4-4 4 4 5-6',
  layers: 'M12 2l10 5-10 5L2 7l10-5zM2 12l10 5 10-5M2 17l10 5 10-5', sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17zM5 2l.6 1.8L7.5 4.5 5.6 5 5 7l-.6-2L2.5 4.5 4.4 3.8 5 2z',
  flag: 'M4 22V4a1 1 0 0 1 1-1h11l1 2h3v10h-7l-1-2H5', file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8', template: 'M4 4h16v4H4zM4 10h7v10H4zM13 10h7v4h-7zM13 16h7v4h-7z',
  stamp: 'M5 22h14M5 18h14a1 1 0 0 0 1-1v-2a2 2 0 0 0-2-2h-2l-1-6.5a3 3 0 0 0-6 0L8 13H6a2 2 0 0 0-2 2v2a1 1 0 0 0 1 1z', usercog: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 15.5a3 3 0 1 0 0 .1M19 11v1.5M19 20v1.5M23 16h-1.5M16.5 16H15',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L14.8 3H9.2l-.4 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.4 2.6h5.6l.4-2.6a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6', sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};
export const Icon = ({ n, size = 18 }: { n: string; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={I[n] ?? I.file} /></svg>;

const GROUPS: { title: string; items: [string, string, string, string][] }[] = [
  { title: 'العمل اليومي', items: [['/', 'لوحة التحكم', 'clients.view', 'home'], ['/clients', 'العملاء', 'clients.view', 'users'], ['/engagements', 'الارتباطات', 'clients.view', 'briefcase'], ['/upload', 'رفع المستندات', 'documents.upload', 'upload'], ['/imports', 'الاستيراد والتحقق', 'clients.view', 'import']] },
  { title: 'التحليل', items: [['/trial-balance', 'ميزان المراجعة', 'clients.view', 'table'], ['/analysis', 'التحليل المالي', 'clients.view', 'chart'], ['/consolidation', 'التوحيد الدفتري', 'clients.view', 'layers'], ['/findings', 'الملاحظات والتسويات', 'clients.view', 'flag'], ['/ai', 'المحاسب الذكي', 'clients.view', 'sparkles']] },
  { title: 'المخرجات', items: [['/reports', 'التقارير', 'clients.view', 'file'], ['/templates', 'قوالب التقارير', 'clients.view', 'template'], ['/office', 'ترويسة المكتب', 'clients.view', 'stamp']] },
  { title: 'الإدارة', items: [['/users', 'المستخدمون والصلاحيات', 'users.manage', 'usercog'], ['/audit', 'سجل التدقيق', 'audit.view', 'list'], ['/system', 'إعدادات النظام', 'audit.view', 'settings'], ['/cleanup', 'تنظيف البيانات', 'data.delete', 'trash']] },
];

function useTheme() {
  const [theme, setTheme] = useState<string>(() => { try { return localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { return 'light'; } });
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); try { localStorage.setItem('theme', theme); } catch { /* ignore */ } }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('');

export function Layout() {
  const { user, loading, logout, can } = useAuth(); const { theme, toggle } = useTheme();
  if (loading) return <div className="empty">جارٍ التحميل…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="mark">أس</div><div><b>منصة التحليل المالي</b><span>التقارير المحاسبية والتوحيد</span></div></div>
      <nav>{GROUPS.map((g) => { const items = g.items.filter(([, , perm]) => can(perm)); if (!items.length) return null; return <div key={g.title}><div className="group">{g.title}</div>{items.map(([to, label, , ic]) => <NavLink key={to} to={to} end={to === '/'} title={label}><Icon n={ic} /><span>{label}</span></NavLink>)}</div>; })}</nav>
      <div className="user"><div className="avatar">{initials(user.full_name)}</div><div className="meta"><b>{user.full_name}</b><span>{user.email}</span></div>
        <button className="iconbtn" title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'} onClick={toggle}><Icon n={theme === 'dark' ? 'sun' : 'moon'} /></button>
        <button className="iconbtn" title="تسجيل الخروج" onClick={logout}><Icon n="logout" /></button></div>
    </aside>
    <main className="main"><Outlet /></main>
  </div>;
}
