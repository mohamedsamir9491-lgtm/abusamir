import { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sun, Moon, LogOut, Menu, X, CalendarDays, ChevronDown, ChevronLeft, Search, Maximize2, Gauge, Sparkles } from 'lucide-react';
import { get } from '../api';
import { useAuth } from '../auth';
import { ScopeProvider, ContextBar } from './Scope';
import { Icon, NAV, groupOf } from './nav';
import { CommandPalette, NotificationsBell } from './Palette';
import { Assistant, AssistantBar } from './Assistant';
import { AmbientBg, Globe, GIcon, IconDefs, SahmLogo, useMotion, useUiScale, UI_SCALES } from './glass';
export { Icon } from './nav';

/** الثيم: الزجاجي الليلي افتراضيًا، والصباحي الفاتح اختياري */
function useTheme() {
  const [theme, setTheme] = useState<string>(() => { try { return localStorage.getItem('theme') || 'dark'; } catch { return 'dark'; } });
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); try { localStorage.setItem('theme', theme); } catch { /* ignore */ } }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}
const initials = (name: string) => name.trim().replace(/^(شركة|مكتب|مؤسسة)\s+/, '').split(/\s+/).slice(0, 2).map((x) => x[0]).join('');
const ROLE: Record<string, string> = { admin: 'مدير النظام', partner: 'الشريك', manager: 'مدير', senior: 'محاسب أول', accountant: 'محاسب', reviewer: 'مراجع', viewer: 'مشاهد' };
const GROUP_ICON: Record<string, string> = { command: 'home', clients: 'users', finance: 'coins', data: 'box', analysis: 'bars', outputs: 'letter', settings: 'gear' };

/** هوية المكتب (الاسم والشعار) من «هوية المكتب والترويسة» */
function useOffice() {
  const [o, setO] = useState<{ name: string | null; logo: boolean } | null>(null);
  useEffect(() => { const load = () => get<{ settings: Record<string, string | null> }>('/office').then((r) => setO({ name: r.settings.name_ar?.trim() || null, logo: !!r.settings.logo_file_id })).catch(() => setO({ name: null, logo: false })); load(); window.addEventListener('office-changed', load); return () => window.removeEventListener('office-changed', load); }, []);
  return o;
}
/** حالة الاتصال بالخادم (تُفحص كل دقيقة) */
function useOnline() {
  const [s, setS] = useState<{ ok: boolean; build: string } | null>(null);
  useEffect(() => { const f = () => fetch('/api/health').then((r) => r.json()).then((j) => setS({ ok: !!j.ok, build: String(j.build ?? '') })).catch(() => setS({ ok: false, build: '' })); f(); const id = window.setInterval(f, 60000); return () => window.clearInterval(id); }, []);
  return s;
}

export function Layout() {
  const { user, loading, logout, can } = useAuth(); const { theme, toggle } = useTheme(); const office = useOffice(); const loc = useLocation(); const online = useOnline(); const motion = useMotion(); const scale = useUiScale();
  const [open, setOpen] = useState(false); const [pal, setPal] = useState(false); const [ai, setAi] = useState(false); const [me, setMe] = useState(false);
  const cur = groupOf(loc.pathname);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('nav-open') ?? '{}'); } catch { return {}; } });
  useEffect(() => { setOpen(false); setMe(false); }, [loc.pathname]);
  // ارتفاع الشريط العلوي (لتملأ لوحة المكتب باقي الشاشة بالضبط)
  useEffect(() => { const el = document.querySelector('.appbar'); if (!el) return; const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--ab-h', `${(el as HTMLElement).offsetHeight}px`)); ro.observe(el); return () => ro.disconnect(); });
  useEffect(() => { try { localStorage.setItem('nav-open', JSON.stringify(expanded)); } catch { /* ignore */ } }, [expanded]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPal(true); } if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setAi(true); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  useEffect(() => { const h = () => setAi(true); window.addEventListener('open-assistant', h); return () => window.removeEventListener('open-assistant', h); }, []);
  if (loading) return <div className="empty">جارٍ التحميل…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.must_change_password && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  const isOpen = (k: string) => expanded[k] ?? k === cur;
  const glass = theme === 'dark';
  const full = () => { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch { /* ignore */ } };
  return <ScopeProvider><IconDefs />{glass && <AmbientBg />}<div className={`app${open ? ' nav-open' : ''}`}>
    <aside className="sidebar">
      <div className="brand">{office?.logo ? <img className="mark img" src="/api/office/branding/logo" alt="" /> : <SahmLogo size={54} />}
        {office?.name ? <div className="bn"><b>{office.name}</b><span>محاسبون قانونيون ومحللون ماليون</span></div>
          : <div className="bn sahm" dir="ltr"><b>SAHM ERP</b><i dir="rtl">ســــهــــم</i><span>Enterprise Resource Planning</span></div>}
        <button className="iconbtn only-mobile" onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X size={18} /></button></div>
      <nav>{NAV.map((g) => { const items = g.items.filter(([, , perm]) => can(perm)); if (!items.length) return null; const o = isOpen(g.key); const single = items.length === 1;
        return <div key={g.key} className={`navgroup${o ? ' open' : ''}${cur === g.key ? ' cur' : ''}`}>
          {single ? <NavLink className="group" to={items[0][0]} end={items[0][0] === '/'}><span>{g.title}</span><GIcon n={GROUP_ICON[g.key] ?? 'box'} /></NavLink>
            : <button className="group" onClick={() => setExpanded(o ? { [g.key]: false } : Object.fromEntries(NAV.map((x) => [x.key, x.key === g.key])))} aria-expanded={o}><span>{g.title}</span>{o ? <ChevronDown size={14} className="chev" /> : <ChevronLeft size={14} className="chev" />}<GIcon n={GROUP_ICON[g.key] ?? 'box'} /></button>}
          {o && !single && <div className="items">{items.map(([to, label, , ic]) => <NavLink key={to} to={to} end={to === '/'} title={label}><Icon n={ic} size={16} /><span>{label}</span></NavLink>)}</div>}</div>; })}</nav>
      {glass && <div className="globe-box"><Globe /></div>}
      <div className="side-status"><div><span>{online == null ? 'جارٍ الفحص…' : online.ok ? 'النظام متصل' : 'تعذر الاتصال بالخادم'}</span><i className={online?.ok === false ? 'off' : ''} /></div><small dir="ltr">SAHM ERP{online?.build ? ` · ${online.build}` : ''}</small></div>
    </aside>
    <div className="scrim" onClick={() => setOpen(false)} />
    <div className="shell">
      <header className="appbar">
        <div className="ab-row">
          <div className="me-wrap"><button className="me" onClick={() => setMe((x) => !x)} aria-expanded={me}><span className="avatar">{initials(user.full_name)}</span><span className="mt"><b>{user.full_name}</b><small>{ROLE[user.role_code] ?? 'مستخدم'}</small></span></button>
            {me && <><div className="sw-scrim" onClick={() => setMe(false)} /><div className="me-pop">
              <div className="me-h"><b>{user.full_name}</b><small>{user.email}</small></div>
              <button onClick={() => { motion.toggle(); }}><Gauge size={16} /><span>{motion.reduced ? 'تشغيل الحركة الكاملة' : 'تخفيف الحركة (للأجهزة الأبطأ)'}</span></button>
              <div className="me-scale"><span>حجم الواجهة</span><div>{UI_SCALES.map(([k, l]) => <button key={k} className={scale.mode === k ? 'on' : ''} onClick={() => scale.set(k)}>{l}</button>)}</div></div>
              <button onClick={toggle}>{glass ? <Sun size={16} /> : <Moon size={16} />}<span>{glass ? 'الوضع الصباحي الفاتح' : 'الثيم الزجاجي الليلي'}</span></button>
              <button onClick={() => { setMe(false); setAi(true); }}><Sparkles size={16} /><span>مساعد سهم الذكي <kbd>Ctrl J</kbd></span></button>
              <button className="danger" onClick={logout}><LogOut size={16} /><span>تسجيل الخروج</span></button></div></>}</div>
          <span className="vdiv" />
          <button className="tic hide-sm" title="ملء الشاشة" onClick={full}><Maximize2 size={21} /></button>
          <button className="tic" title={glass ? 'الوضع الصباحي' : 'الثيم الزجاجي'} onClick={toggle}>{glass ? <Sun size={22} /> : <Moon size={22} />}</button>
          <NotificationsBell />
          <span className="ab-spacer" />
          <AssistantBar onOpen={() => setAi(true)} />
          <button className="ab-search" onClick={() => setPal(true)}><Search size={19} /><span>ابحث عن عميل، ارتباط، مطالبة، تقرير…</span><kbd>Ctrl K</kbd></button>
          <button className="iconbtn only-mobile" onClick={() => setOpen(true)} aria-label="القائمة"><Menu size={18} /></button>
        </div>
        <div className="ab-row ctx-row"><div id="ctx-slot" className="ctx-slot" /><span className="ab-spacer" /><ContextBar /><FiscalYearChip /></div>
      </header>
      <main className="main"><Outlet /></main>
    </div>
    <CommandPalette open={pal} onClose={() => setPal(false)} />
    <Assistant open={ai} onClose={() => setAi(false)} />
  </div></ScopeProvider>;
}

/** شارة السنة المالية الحالية في الشريط العلوي */
function FiscalYearChip() {
  const [fy, setFy] = useState<{ year: number; auto: boolean } | null>(null);
  useEffect(() => { const load = () => get<{ year: number; auto: boolean }>('/office/fiscal-year').then(setFy).catch(() => setFy(null)); load(); window.addEventListener('fiscal-year-changed', load); return () => window.removeEventListener('fiscal-year-changed', load); }, []);
  if (!fy) return null;
  return <NavLink to="/system" className="fy-chip" title={fy.auto ? 'تلقائية من تاريخ اليوم - تُغيَّر من إعدادات النظام' : 'مضبوطة يدويًا من إعدادات النظام'}><span>السنة المالية</span><b>{fy.year}</b><CalendarDays size={18} /></NavLink>;
}
