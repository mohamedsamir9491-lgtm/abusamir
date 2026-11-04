import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sun, Moon, LogOut, Menu, X, CalendarDays, Landmark } from 'lucide-react';
import { get } from '../api';
import { useAuth } from '../auth';
import { ScopeProvider, ContextBar } from './Scope';
import { Icon, NAV } from './nav';
export { Icon } from './nav';

function useTheme() {
  const [theme, setTheme] = useState<string>(() => { try { return localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { return 'light'; } });
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); try { localStorage.setItem('theme', theme); } catch { /* ignore */ } }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}
const initials = (name: string) => name.trim().replace(/^(شركة|مكتب|مؤسسة)\s+/, '').split(/\s+/).slice(0, 2).map((x) => x[0]).join('');

/** هوية المكتب (الاسم والشعار) من «هوية المكتب والترويسة» */
function useOffice() {
  const [o, setO] = useState<{ name: string | null; logo: boolean } | null>(null);
  useEffect(() => { const load = () => get<{ settings: Record<string, string | null> }>('/office').then((r) => setO({ name: r.settings.name_ar?.trim() || null, logo: !!r.settings.logo_file_id })).catch(() => setO({ name: null, logo: false })); load(); window.addEventListener('office-changed', load); return () => window.removeEventListener('office-changed', load); }, []);
  return o;
}

export function Layout() {
  const { user, loading, logout, can } = useAuth(); const { theme, toggle } = useTheme(); const office = useOffice(); const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  if (loading) return <div className="empty">جارٍ التحميل…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  const name = office?.name ?? 'منصة التحليل المالي';
  return <ScopeProvider><div className={`app${open ? ' nav-open' : ''}`}>
    <aside className="sidebar">
      <div className="brand">{office?.logo ? <img className="mark img" src="/api/office/branding/logo" alt="" /> : <div className="mark">{office?.name ? initials(office.name) : <Landmark size={20} />}</div>}<div><b>{name}</b><span>التحليل المحاسبي والتقييم</span></div>
        <button className="iconbtn only-mobile" onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X size={18} /></button></div>
      <nav>{NAV.map((g) => { const items = g.items.filter(([, , perm]) => can(perm)); if (!items.length) return null; return <div key={g.title} className="navgroup"><div className="group">{g.title}</div>{items.map(([to, label, , ic]) => <NavLink key={to} to={to} end={to === '/'} title={label}><Icon n={ic} /><span>{label}</span></NavLink>)}</div>; })}</nav>
    </aside>
    <div className="scrim" onClick={() => setOpen(false)} />
    <div className="shell">
      <header className="appbar">
        <button className="iconbtn only-mobile" onClick={() => setOpen(true)} aria-label="القائمة"><Menu size={18} /></button>
        <ContextBar />
        <div className="appbar-end"><FiscalYearChip />
          <button className="iconbtn" title={theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'} onClick={toggle}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
          <div className="me" title={user.email}><span className="avatar">{initials(user.full_name)}</span><b>{user.full_name}</b></div>
          <button className="iconbtn" title="تسجيل الخروج" onClick={logout}><LogOut size={17} /></button></div>
      </header>
      <main className="main"><Outlet /></main>
    </div>
  </div></ScopeProvider>;
}

/** شارة السنة المالية الحالية في الشريط العلوي */
function FiscalYearChip() {
  const [fy, setFy] = useState<{ year: number; auto: boolean } | null>(null);
  useEffect(() => { const load = () => get<{ year: number; auto: boolean }>('/office/fiscal-year').then(setFy).catch(() => setFy(null)); load(); window.addEventListener('fiscal-year-changed', load); return () => window.removeEventListener('fiscal-year-changed', load); }, []);
  if (!fy) return null;
  return <NavLink to="/system" className="fy-chip" title={fy.auto ? 'تلقائية من تاريخ اليوم - تُغيَّر من إعدادات النظام' : 'مضبوطة يدويًا من إعدادات النظام'}><CalendarDays size={15} /><span>السنة المالية</span><b>{fy.year}</b></NavLink>;
}
