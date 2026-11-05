import {
  LayoutDashboard, Users, BriefcaseBusiness, Upload, FileCheck2, ScrollText, ClipboardList, Table2, ChartColumn, ChartLine, Network, Scale, Flag, Bot, FileText, LayoutTemplate,
  Building2, UserCog, History, Settings, Trash2, Sun, Moon, LogOut, CalendarDays, Stamp, File, FilePenLine, Gauge, CalendarCheck, Contact, Wallet, ReceiptText, HandCoins, Hourglass, TrendingUp,
  FolderOpen, Files, ShieldCheck, Library, type LucideIcon,
} from 'lucide-react';

/** مكتبة أيقونات موحدة (Lucide): نفس السمك والحجم في كل الشاشات */
const ICONS: Record<string, LucideIcon> = {
  home: Gauge, dashboard: LayoutDashboard, users: Users, contact: Contact, briefcase: BriefcaseBusiness, upload: Upload, import: FileCheck2, official: ScrollText, requests: ClipboardList, table: Table2, chart: ChartColumn, chartline: ChartLine,
  layers: Network, valuation: Scale, flag: Flag, sparkles: Bot, file: FileText, files: Files, template: LayoutTemplate, office: Building2, usercog: UserCog, list: History, settings: Settings,
  trash: Trash2, sun: Sun, moon: Moon, logout: LogOut, stamp: Stamp, calendar: CalendarDays, letter: FilePenLine, tasks: CalendarCheck, wallet: Wallet, claims: ReceiptText, payments: HandCoins, aging: Hourglass, revenue: TrendingUp,
  folder: FolderOpen, shield: ShieldCheck, library: Library,
};
export const Icon = ({ n, size = 18 }: { n: string; size?: number }) => { const C = ICONS[n] ?? File; return <C size={size} strokeWidth={1.8} aria-hidden="true" />; };

type NavItem = [to: string, label: string, perm: string, icon: string];
export interface NavGroup { key: string; title: string; icon: string; items: NavItem[] }
/** الشريط الجانبي: عناوين رئيسية تنزل منها شاشاتها */
export const NAV: NavGroup[] = [
  { key: 'command', title: 'مركز القيادة', icon: 'dashboard', items: [['/', 'لوحة المكتب', 'clients.view', 'home'], ['/tasks', 'المهام والمواعيد', 'clients.view', 'tasks']] },
  { key: 'clients', title: 'العملاء والارتباطات', icon: 'users', items: [['/clients', 'بيت العملاء', 'clients.view', 'contact'], ['/engagements', 'الارتباطات', 'clients.view', 'briefcase'], ['/letters', 'خطابات الارتباط والتوقيع', 'clients.view', 'letter']] },
  { key: 'finance', title: 'المالية والأتعاب', icon: 'wallet', items: [['/finance/claims', 'المطالبات', 'finance.view', 'claims'], ['/finance/payments', 'التحصيلات', 'finance.view', 'payments'], ['/finance/receivables', 'أعمار المستحقات', 'finance.view', 'aging'], ['/finance/revenue', 'إيرادات المكتب', 'finance.view', 'revenue']] },
  { key: 'data', title: 'بيانات العميل', icon: 'folder', items: [['/upload', 'رفع المستندات', 'documents.upload', 'upload'], ['/imports', 'الاستيراد والتحقق', 'clients.view', 'import'], ['/official', 'البيانات النظامية', 'clients.view', 'official'], ['/requests', 'طلبات العميل', 'clients.view', 'requests']] },
  { key: 'analysis', title: 'التحليل والتقييم', icon: 'chart', items: [['/trial-balance', 'ميزان المراجعة', 'clients.view', 'table'], ['/analysis', 'التحليل المالي', 'clients.view', 'chartline'], ['/consolidation', 'التوحيد الدفتري', 'clients.view', 'layers'], ['/valuation', 'التقييم والمساهمون', 'clients.view', 'valuation'], ['/findings', 'الملاحظات والتسويات', 'clients.view', 'flag'], ['/ai', 'المحاسب الذكي', 'clients.view', 'sparkles']] },
  { key: 'legal', title: 'المرجع النظامي', icon: 'library', items: [['/library', 'المكتبة النظامية', 'clients.view', 'library']] },
  { key: 'outputs', title: 'المخرجات', icon: 'file', items: [['/reports', 'التقارير', 'clients.view', 'files'], ['/templates', 'قوالب التقارير', 'clients.view', 'template']] },
  { key: 'settings', title: 'الإعدادات', icon: 'settings', items: [['/office', 'هوية المكتب والترويسة', 'clients.view', 'office'], ['/users', 'المستخدمون والصلاحيات', 'users.manage', 'usercog'], ['/audit', 'سجل التدقيق', 'audit.view', 'list'], ['/system', 'إعدادات النظام', 'audit.view', 'shield'], ['/cleanup', 'تنظيف البيانات', 'data.delete', 'trash']] },
];
const matchPath = (to: string, path: string) => to === '/' ? path === '/' : path === to || path.startsWith(to + '/');
/** أيقونة الصفحة الحالية (لرأس الصفحة) من القائمة */
export function pageIcon(path: string): string | null {
  if (/\/letter$/.test(path)) return 'letter';
  let best: NavItem | null = null;
  for (const g of NAV) for (const it of g.items) if (matchPath(it[0], path) && (!best || it[0].length > best[0].length)) best = it;
  return best?.[3] ?? null;
}
/** المجموعة التي تضم الصفحة الحالية (لفتحها تلقائيًا) */
export function groupOf(path: string): string | null {
  if (/\/letter$/.test(path)) return 'clients';
  let best: { g: string; len: number } | null = null;
  for (const g of NAV) for (const it of g.items) if (matchPath(it[0], path) && (!best || it[0].length > best.len)) best = { g: g.key, len: it[0].length };
  return best?.g ?? null;
}
