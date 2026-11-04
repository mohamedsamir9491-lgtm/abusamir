import {
  LayoutDashboard, Users, BriefcaseBusiness, Upload, FileCheck2, ScrollText, ClipboardList, Table2, ChartColumn, Network, Scale, Flag, Bot, FileText, LayoutTemplate,
  Building2, UserCog, History, Settings, Trash2, Sun, Moon, LogOut, CalendarDays, Stamp, File, type LucideIcon,
} from 'lucide-react';

/** مكتبة أيقونات موحدة (Lucide): نفس السمك والحجم في كل الشاشات */
const ICONS: Record<string, LucideIcon> = {
  home: LayoutDashboard, users: Users, briefcase: BriefcaseBusiness, upload: Upload, import: FileCheck2, official: ScrollText, requests: ClipboardList, table: Table2, chart: ChartColumn,
  layers: Network, valuation: Scale, flag: Flag, sparkles: Bot, file: FileText, template: LayoutTemplate, office: Building2, usercog: UserCog, list: History, settings: Settings,
  trash: Trash2, sun: Sun, moon: Moon, logout: LogOut, stamp: Stamp, calendar: CalendarDays,
};
export const Icon = ({ n, size = 18 }: { n: string; size?: number }) => { const C = ICONS[n] ?? File; return <C size={size} strokeWidth={1.8} aria-hidden="true" />; };

type NavItem = [to: string, label: string, perm: string, icon: string];
export const NAV: { title: string; items: NavItem[] }[] = [
  { title: 'العمل اليومي', items: [['/', 'لوحة التحكم', 'clients.view', 'home'], ['/clients', 'العملاء', 'clients.view', 'users'], ['/engagements', 'الارتباطات', 'clients.view', 'briefcase']] },
  { title: 'بيانات العميل', items: [['/upload', 'رفع المستندات', 'documents.upload', 'upload'], ['/imports', 'الاستيراد والتحقق', 'clients.view', 'import'], ['/official', 'البيانات النظامية', 'clients.view', 'official'], ['/requests', 'طلبات العميل', 'clients.view', 'requests']] },
  { title: 'التحليل والتقييم', items: [['/trial-balance', 'ميزان المراجعة', 'clients.view', 'table'], ['/analysis', 'التحليل المالي', 'clients.view', 'chart'], ['/consolidation', 'التوحيد الدفتري', 'clients.view', 'layers'], ['/valuation', 'التقييم والمساهمون', 'clients.view', 'valuation'], ['/findings', 'الملاحظات والتسويات', 'clients.view', 'flag'], ['/ai', 'المحاسب الذكي', 'clients.view', 'sparkles']] },
  { title: 'المخرجات', items: [['/reports', 'التقارير', 'clients.view', 'file'], ['/templates', 'قوالب التقارير', 'clients.view', 'template']] },
  { title: 'الإعدادات', items: [['/office', 'هوية المكتب والترويسة', 'clients.view', 'office'], ['/users', 'المستخدمون والصلاحيات', 'users.manage', 'usercog'], ['/audit', 'سجل التدقيق', 'audit.view', 'list'], ['/system', 'إعدادات النظام', 'audit.view', 'settings'], ['/cleanup', 'تنظيف البيانات', 'data.delete', 'trash']] },
];
/** أيقونة الصفحة الحالية (لرأس الصفحة) من القائمة */
export function pageIcon(path: string): string | null {
  let best: NavItem | null = null;
  for (const g of NAV) for (const it of g.items) if ((it[0] === '/' ? path === '/' : path === it[0] || path.startsWith(it[0] + '/')) && (!best || it[0].length > best[0].length)) best = it;
  return best?.[3] ?? null;
}

