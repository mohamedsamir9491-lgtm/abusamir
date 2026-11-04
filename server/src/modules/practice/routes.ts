/** إدارة المكتب: بيت العملاء، ملف العميل، البحث الشامل، المهام والمواعيد، التنبيهات، لوحة المكتب */
import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../../db/pool.js';
import { parse } from '../../lib/validate.js';
import { notFound } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { audit } from '../../middleware/audit.js';
import { searchKey } from '../../lib/arabic.js';
import { officeFinance, engagementFinance, loadClaims, r2 } from '../finance/service.js';

export const practiceRouter = Router();
practiceRouter.use(authenticate, requirePermission('clients.view'));
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

/** ملخص كل عميل رئيسي (المجموعة = الأم + شركاتها) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clientRows(): Promise<Record<string, any>[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clients = await many<Record<string, any>>(`SELECT c.id, c.legal_name_ar, c.legal_name_en, c.entity_type, c.cr_number, c.vat_number, c.industry, c.is_active, c.is_demo, c.parent_client_id, c.created_at, c.assigned_to, u.full_name AS assigned_name,
      (SELECT max(a.created_at) FROM audit_logs a WHERE a.client_id = c.id) AS last_activity
    FROM clients c LEFT JOIN users u ON u.id = c.assigned_to WHERE c.deleted_at IS NULL`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const engs = await many<Record<string, any>>(`SELECT e.id, e.client_id, e.title, e.engagement_type, e.status, e.group_engagement_id, e.entity_role, e.ownership_pct, e.updated_at, e.due_date::text AS due_date, l.lifecycle, e.assigned_to, u.full_name AS assigned_name
    FROM engagements e LEFT JOIN engagement_letters l ON l.engagement_id = e.id LEFT JOIN users u ON u.id = e.assigned_to ORDER BY e.updated_at DESC`);
  const fin = await officeFinance(new Date().getFullYear());
  const claims = await loadClaims(`c.status <> 'cancelled'`, []);
  const byEng = new Map(fin.engagements.map((e) => [e.id, e]));
  return clients.map((c) => {
    const mine = engs.filter((e) => e.client_id === c.id);
    const root = mine.find((e) => !e.group_engagement_id) ?? null; const comp = mine.find((e) => e.group_engagement_id) ?? null;
    const f = root ? byEng.get(root.id) : null; const cc = claims.filter((x) => x.client_id === c.id);
    const outstanding = r2(cc.reduce((t, x) => t + x.balance, 0)); const overdue = cc.some((x) => x.state === 'overdue');
    const children = clients.filter((x) => x.parent_client_id === c.id).length;
    const status = !c.is_active ? 'archived' : root?.lifecycle && ['issued', 'sent'].includes(root.lifecycle) ? 'awaiting_signature' : overdue ? 'overdue' : root && root.status !== 'closed' ? 'active' : root ? 'closed' : 'new';
    return { ...c, children, engagement: root ? { id: root.id, title: root.title, type: root.engagement_type, status: root.status, lifecycle: root.lifecycle, due_date: root.due_date } : comp ? { id: comp.group_engagement_id, title: 'ضمن ارتباط المجموعة', type: comp.engagement_type, status: comp.status, lifecycle: null, due_date: null, component: true, role: comp.entity_role, ownership: comp.ownership_pct } : null,
      engagements: mine.length, fee: f?.fee ?? 0, collected: f?.collected_net ?? 0, outstanding, progress: f?.progress ?? null, status, assigned_name: c.assigned_name ?? root?.assigned_name ?? null };
  });
}
export const CLIENT_STATUS: Record<string, string> = { active: 'تحت التنفيذ', awaiting_signature: 'بانتظار التوقيع', overdue: 'متأخر في السداد', closed: 'مُقفل', new: 'بلا ارتباط', archived: 'مؤرشف' };

practiceRouter.get('/clients', async (req, res, next) => {
  try {
    const q = searchKey(String(req.query.q ?? '')); const seg = String(req.query.segment ?? 'all'); const ind = String(req.query.industry ?? ''); const type = String(req.query.type ?? ''); const sort = String(req.query.sort ?? 'activity');
    const all = await clientRows();
    let rows = all.filter((c) => !c.parent_client_id); // الرئيسيون؛ الشركات التابعة تظهر تحت مجموعتها
    const kids = (id: string) => all.filter((c) => c.parent_client_id === id);
    if (q) rows = rows.filter((c) => [c, ...kids(c.id)].some((x) => searchKey(`${x.legal_name_ar} ${x.legal_name_en ?? ''} ${x.cr_number ?? ''} ${x.vat_number ?? ''}`).includes(q)));
    const segCount = (fn: (c: typeof rows[number]) => boolean) => all.filter((c) => !c.parent_client_id).filter(fn).length;
    const segments = { all: segCount(() => true), active: segCount((c) => c.status === 'active'), awaiting_signature: segCount((c) => c.status === 'awaiting_signature'), overdue: segCount((c) => c.outstanding > 0 && c.status === 'overdue'), archived: segCount((c) => c.status === 'archived') };
    if (seg !== 'all') rows = rows.filter((c) => c.status === seg);
    if (ind) rows = rows.filter((c) => c.industry === ind); if (type) rows = rows.filter((c) => c.engagement?.type === type);
    const cmp: Record<string, (a: typeof rows[number], b: typeof rows[number]) => number> = { activity: (a, b) => String(b.last_activity ?? b.created_at).localeCompare(String(a.last_activity ?? a.created_at)), name: (a, b) => a.legal_name_ar.localeCompare(b.legal_name_ar, 'ar'), fee: (a, b) => b.fee - a.fee, outstanding: (a, b) => b.outstanding - a.outstanding };
    rows.sort(cmp[sort] ?? cmp.activity);
    const page = Math.max(1, Number(req.query.page ?? 1)); const per = Math.min(100, Math.max(10, Number(req.query.per ?? 25)));
    const pageRows = rows.slice((page - 1) * per, page * per).map((c) => ({ ...c, companies: kids(c.id) }));
    const industries = [...new Set(all.map((c) => c.industry).filter(Boolean))];
    const stats = { clients: all.filter((c) => !c.parent_client_id).length, groups: all.filter((c) => !c.parent_client_id && c.children > 0).length, group_companies: all.filter((c) => c.parent_client_id).length, active: segments.active, archived: segments.archived, fee: r2(all.reduce((t, c) => t + c.fee, 0)), outstanding: r2(all.reduce((t, c) => t + c.outstanding, 0)) };
    res.json({ clients: pageRows, total: rows.length, page, per, segments, industries, stats, status_labels: CLIENT_STATUS });
  } catch (e) { next(e); }
});

/** ملف العميل الشامل */
practiceRouter.get('/clients/:id', async (req, res, next) => {
  try {
    const c = await one<Record<string, any>>('SELECT c.*, u.full_name AS assigned_name, p.legal_name_ar AS parent_name FROM clients c LEFT JOIN users u ON u.id = c.assigned_to LEFT JOIN clients p ON p.id = c.parent_client_id WHERE c.id = $1 AND c.deleted_at IS NULL', [req.params.id]); // eslint-disable-line
    if (!c) throw notFound('العميل غير موجود');
    const companies = await many('SELECT c.id, c.legal_name_ar, c.cr_number, e.entity_role, e.ownership_pct, e.id AS engagement_id FROM clients c LEFT JOIN engagements e ON e.client_id = c.id AND e.group_engagement_id IS NOT NULL WHERE c.parent_client_id = $1 AND c.deleted_at IS NULL ORDER BY c.legal_name_ar', [c.id]);
    const ids = [c.id, ...companies.map((x) => (x as { id: string }).id)];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const engagements = await many<Record<string, any>>(`SELECT e.id, e.title, e.engagement_type, e.status, e.group_engagement_id, e.created_at, e.due_date::text AS due_date, l.lifecycle, l.letter_no, c.legal_name_ar AS client_name,
       (SELECT label FROM financial_periods p WHERE p.engagement_id = e.id ORDER BY (p.role = 'current') DESC, p.end_date DESC LIMIT 1) AS period_label FROM engagements e JOIN clients c ON c.id = e.client_id LEFT JOIN engagement_letters l ON l.engagement_id = e.id WHERE e.client_id = ANY($1) ORDER BY e.group_engagement_id NULLS FIRST, e.created_at DESC`, [ids]);
    const roots = engagements.filter((e) => !e.group_engagement_id && e.client_name === c.legal_name_ar);
    const finance = await Promise.all(roots.map(async (e) => ({ engagement_id: e.id, title: e.title, ...(await engagementFinance(e.id)) })));
    const sum = (k: 'fee_net' | 'billed' | 'collected_net' | 'outstanding' | 'earned' | 'unbilled') => r2(finance.reduce((t, f) => t + f.summary[k], 0));
    const counts = await one<Record<string, string>>(`SELECT (SELECT count(*) FROM source_documents WHERE client_id = ANY($1) AND deleted_at IS NULL) AS documents,
      (SELECT count(*) FROM client_requests r JOIN engagements e ON e.id = r.engagement_id WHERE e.client_id = ANY($1) AND r.status IN ('pending','sent') AND NOT r.obsolete) AS requests,
      (SELECT count(*) FROM findings WHERE client_id = ANY($1) AND review_status IN ('open','under_review')) AS findings,
      (SELECT count(*) FROM generated_reports r JOIN engagements e ON e.id = r.engagement_id WHERE e.client_id = ANY($1)) AS reports`, [ids]);
    const documents = await many(`SELECT d.id, d.title, d.document_type, d.status, d.uploaded_at, c.legal_name_ar AS company FROM source_documents d JOIN clients c ON c.id = d.client_id WHERE d.client_id = ANY($1) AND d.deleted_at IS NULL ORDER BY d.uploaded_at DESC LIMIT 100`, [ids]);
    const activity = await many(`SELECT a.action, a.created_at, u.full_name AS user_name, a.details FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE a.client_id = ANY($1) ORDER BY a.created_at DESC LIMIT 60`, [ids]);
    const tasks = await many(`SELECT t.*, t.due_date::text AS due_date FROM office_tasks t WHERE t.client_id = ANY($1) ORDER BY t.status, t.due_date NULLS LAST LIMIT 50`, [ids]);
    res.json({ client: c, companies, engagements, finance, totals: { fee: sum('fee_net'), billed: sum('billed'), collected: sum('collected_net'), outstanding: sum('outstanding'), earned: sum('earned'), unbilled: sum('unbilled') }, counts, documents, activity, tasks });
  } catch (e) { next(e); }
});

/** البحث الشامل (Ctrl+K): عملاء وشركات وارتباطات ومطالبات ومستندات */
practiceRouter.get('/search', async (req, res, next) => {
  try {
    const raw = String(req.query.q ?? ''); const q = searchKey(raw); if (q.length < 1) { res.json({ results: [] }); return; }
    const like = `%${q}%`;
    const clients = await many<Record<string, string>>(`SELECT c.id, c.legal_name_ar, c.cr_number, c.parent_client_id, p.legal_name_ar AS parent_name, (SELECT e.id FROM engagements e WHERE e.client_id = c.id ORDER BY e.group_engagement_id NULLS FIRST, e.updated_at DESC LIMIT 1) AS engagement_id
      FROM clients c LEFT JOIN clients p ON p.id = c.parent_client_id WHERE c.deleted_at IS NULL AND (ar_norm(c.legal_name_ar) LIKE $1 OR ar_norm(coalesce(c.legal_name_en,'')) LIKE $1 OR ar_norm(coalesce(c.cr_number,'')) LIKE $1 OR ar_norm(coalesce(c.vat_number,'')) LIKE $1) ORDER BY c.parent_client_id NULLS FIRST, c.legal_name_ar LIMIT 12`, [like]);
    const engagements = await many<Record<string, string>>(`SELECT e.id, e.title, c.legal_name_ar AS client_name FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.group_engagement_id IS NULL AND ar_norm(e.title) LIKE $1 LIMIT 6`, [like]);
    const claims = await many<Record<string, string>>(`SELECT c.id, c.claim_no, c.engagement_id, cl.legal_name_ar AS client_name, c.total FROM fee_claims c JOIN clients cl ON cl.id = c.client_id WHERE ar_norm(c.claim_no) LIKE $1 OR ar_norm(coalesce(c.external_invoice_no,'')) LIKE $1 LIMIT 6`, [like]);
    const docs = await many<Record<string, string>>(`SELECT d.id, d.title, d.engagement_id, c.legal_name_ar AS client_name FROM source_documents d JOIN clients c ON c.id = d.client_id WHERE d.deleted_at IS NULL AND ar_norm(coalesce(d.title,'')) LIKE $1 ORDER BY d.uploaded_at DESC LIMIT 6`, [like]);
    res.json({ results: [...clients.map((c) => ({ kind: 'client', id: c.id, title: c.legal_name_ar, sub: c.parent_name ? `ضمن مجموعة ${c.parent_name}` : c.cr_number ? `س.ت ${c.cr_number}` : 'عميل', engagement_id: c.engagement_id, child: !!c.parent_client_id })),
      ...engagements.map((e) => ({ kind: 'engagement', id: e.id, title: e.title, sub: e.client_name })), ...claims.map((c) => ({ kind: 'claim', id: c.id, title: c.claim_no, sub: `${c.client_name} | ${Number(c.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, engagement_id: c.engagement_id })),
      ...docs.map((d) => ({ kind: 'document', id: d.id, title: d.title, sub: d.client_name, engagement_id: d.engagement_id }))] });
  } catch (e) { next(e); }
});

/** المهام والمواعيد: اليدوية + المولدة من البرنامج (استحقاق مطالبات، انتهاء عروض، تسليم ارتباطات) */
async function autoItems() {
  const t = today(); const items: { kind: string; title: string; date: string; client: string; engagement_id: string | null; tone: string; auto: true; ref: string }[] = [];
  for (const c of (await loadClaims(`c.status <> 'cancelled'`, [])).filter((c) => c.balance > 0.009 && c.due_date)) items.push({ kind: 'payment', title: `استحقاق المطالبة ${c.claim_no} (${c.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })})`, date: c.due_date!, client: c.client_name ?? '', engagement_id: c.engagement_id, tone: c.due_date! < t ? 'danger' : 'gold', auto: true, ref: c.id });
  for (const l of await many<Record<string, string>>(`SELECT l.valid_until::text AS d, e.id, c.legal_name_ar AS client FROM engagement_letters l JOIN engagements e ON e.id = l.engagement_id JOIN clients c ON c.id = e.client_id WHERE l.lifecycle IN ('issued','sent') AND l.valid_until IS NOT NULL`)) items.push({ kind: 'followup', title: 'انتهاء صلاحية عرض الأتعاب (لم يوقّع الخطاب)', date: l.d, client: l.client, engagement_id: l.id, tone: 'danger', auto: true, ref: l.id });
  for (const e of await many<Record<string, string>>(`SELECT e.due_date::text AS d, e.id, e.title, c.legal_name_ar AS client FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.due_date IS NOT NULL AND e.delivered_at IS NULL AND e.group_engagement_id IS NULL`)) items.push({ kind: 'delivery', title: `تسليم: ${e.title}`, date: e.d, client: e.client, engagement_id: e.id, tone: e.d < t ? 'danger' : 'ok', auto: true, ref: e.id });
  return items;
}
practiceRouter.get('/tasks', async (req, res, next) => {
  try {
    const status = String(req.query.status ?? 'open');
    const manual = await many<Record<string, any>>(`SELECT t.*, t.due_date::text AS due_date, c.legal_name_ar AS client_name, e.title AS engagement_title, u.full_name AS assigned_name FROM office_tasks t LEFT JOIN clients c ON c.id = t.client_id LEFT JOIN engagements e ON e.id = t.engagement_id LEFT JOIN users u ON u.id = t.assigned_to WHERE ($1 = 'all' OR t.status = $1) ORDER BY t.due_date NULLS LAST, t.created_at`, [status]); // eslint-disable-line
    res.json({ tasks: manual, auto: status === 'done' ? [] : (await autoItems()).sort((a, b) => a.date.localeCompare(b.date)) });
  } catch (e) { next(e); }
});
const taskSchema = z.object({ title: z.string().min(2).max(300), kind: z.enum(['delivery', 'followup', 'meeting', 'payment', 'document', 'other']).default('followup'), priority: z.enum(['high', 'normal', 'low']).default('normal'), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), client_id: z.string().uuid().nullable().optional(), engagement_id: z.string().uuid().nullable().optional(), notes: z.string().max(2000).nullable().optional() });
practiceRouter.post('/tasks', async (req, res, next) => {
  try { const d = parse(taskSchema, req.body);
    const r = await one<{ id: string }>('INSERT INTO office_tasks (title, kind, priority, due_date, client_id, engagement_id, notes, assigned_to, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id', [d.title, d.kind, d.priority, d.due_date ?? null, d.client_id ?? null, d.engagement_id ?? null, d.notes ?? null, req.user!.id]);
    await audit(req, { action: 'task.created', entityType: 'office_task', entityId: r!.id, clientId: d.client_id ?? undefined, details: { title: d.title } }); res.status(201).json({ id: r!.id }); } catch (e) { next(e); }
});
practiceRouter.patch('/tasks/:id', async (req, res, next) => {
  try { const d = parse(taskSchema.partial().extend({ status: z.enum(['open', 'done']).optional() }), req.body);
    const cur = await one<Record<string, unknown>>('SELECT * FROM office_tasks WHERE id = $1', [req.params.id]); if (!cur) throw notFound('المهمة غير موجودة');
    const m = { ...cur, ...d } as Record<string, unknown>;
    await query(`UPDATE office_tasks SET title=$2, kind=$3, priority=$4, due_date=$5, notes=$6, status=$7, done_at = CASE WHEN $7 = 'done' THEN COALESCE(done_at, now()) ELSE NULL END WHERE id=$1`, [req.params.id, m.title, m.kind, m.priority, m.due_date ?? null, m.notes ?? null, m.status]);
    res.json({ ok: true }); } catch (e) { next(e); }
});
practiceRouter.delete('/tasks/:id', async (req, res, next) => {
  try { await query('DELETE FROM office_tasks WHERE id = $1', [req.params.id]); res.json({ ok: true }); } catch (e) { next(e); }
});

/** التنبيهات (الجرس): تُحسب محليًا من حالة البيانات */
practiceRouter.get('/notifications', async (_req, res, next) => {
  try {
    const t = today(); const soon = addDays(t, 7); const out: { tone: string; icon: string; title: string; sub: string; link: string }[] = [];
    const claims = (await loadClaims(`c.status <> 'cancelled'`, [])).filter((c) => c.balance > 0.009);
    for (const c of claims.filter((c) => c.state === 'overdue').slice(0, 10)) out.push({ tone: 'danger', icon: 'hourglass', title: `مطالبة متأخرة ${c.claim_no}`, sub: `${c.client_name} | المتبقي ${c.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} | ${c.age_days} يومًا`, link: `/finance/claims?q=${c.claim_no}` });
    for (const c of claims.filter((c) => c.due_date && c.due_date >= t && c.due_date <= soon)) out.push({ tone: 'gold', icon: 'receipt', title: `مطالبة تستحق ${c.due_date}`, sub: `${c.claim_no} | ${c.client_name}`, link: `/finance/claims?q=${c.claim_no}` });
    for (const l of await many<Record<string, string>>(`SELECT e.id, c.legal_name_ar AS client, l.sent_at::text AS sent, l.valid_until::text AS vu FROM engagement_letters l JOIN engagements e ON e.id = l.engagement_id JOIN clients c ON c.id = e.client_id WHERE l.lifecycle IN ('issued','sent')`)) out.push({ tone: l.vu && l.vu < t ? 'danger' : 'warn', icon: 'letter', title: 'خطاب ارتباط لم يوقّع بعد', sub: `${l.client}${l.sent ? ` | أُرسل ${l.sent}` : ''}${l.vu ? ` | العرض صالح حتى ${l.vu}` : ''}`, link: `/engagements/${l.id}/letter` });
    for (const k of await many<Record<string, string>>(`SELECT t.title, t.due_date::text AS d, c.legal_name_ar AS client FROM office_tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.status = 'open' AND t.due_date IS NOT NULL AND t.due_date <= $1 ORDER BY t.due_date LIMIT 10`, [soon])) out.push({ tone: k.d < t ? 'danger' : 'pri', icon: 'calendar', title: k.title, sub: `${k.client ?? 'عام'} | ${k.d}`, link: '/tasks' });
    const req = await one<{ n: string }>(`SELECT count(*) AS n FROM client_requests WHERE priority = 'essential' AND status = 'pending' AND NOT obsolete`);
    if (Number(req?.n ?? 0)) out.push({ tone: 'warn', icon: 'requests', title: `${req!.n} طلبًا أساسيًا لم يُرسل للعملاء`, sub: 'من «طلبات العميل»', link: '/requests' });
    res.json({ items: out, count: out.length });
  } catch (e) { next(e); }
});

/** لوحة المكتب: كل العملاء */
practiceRouter.get('/dashboard', async (req, res, next) => {
  try { const d = await practiceDashboard(Number(req.query.year ?? new Date().getFullYear())); res.json({ ...d, engagements: undefined }); } catch (e) { next(e); }
});

/** بيانات لوحة المكتب (تُستخدم أيضًا في مساعد سهم الذكي) */
export async function practiceDashboard(year: number) {
  {
    const fin = await officeFinance(year);
    const counts = await one<Record<string, string>>(`SELECT (SELECT count(*) FROM clients WHERE deleted_at IS NULL AND parent_client_id IS NULL AND is_active) AS clients,
      (SELECT count(*) FROM clients WHERE deleted_at IS NULL AND parent_client_id IS NOT NULL) AS group_companies,
      (SELECT count(*) FROM engagements e JOIN clients c ON c.id = e.client_id WHERE c.deleted_at IS NULL AND e.group_engagement_id IS NULL AND e.status <> 'closed') AS active_engagements,
      (SELECT count(*) FROM findings WHERE review_status IN ('open','under_review') AND severity IN ('critical','high')) AS high_findings,
      (SELECT count(DISTINCT engagement_id) FROM findings WHERE review_status IN ('open','under_review') AND severity IN ('critical','high')) AS high_findings_engs,
      (SELECT count(*) FROM client_requests WHERE status IN ('pending','sent') AND NOT obsolete) AS requests,
      (SELECT count(*) FROM client_requests WHERE status IN ('pending','sent') AND NOT obsolete AND priority = 'essential') AS requests_essential,
      (SELECT count(*) FROM generated_reports WHERE status = 'draft') AS draft_reports, (SELECT count(*) FROM generated_reports WHERE status = 'reviewed') AS reports_awaiting,
      (SELECT count(*) FROM users WHERE is_active) AS users`);
    const items = (await autoItems()).filter((x) => x.date >= addDays(today(), -30)).sort((a, b) => a.date.localeCompare(b.date));
    const manual = await many<Record<string, string>>(`SELECT t.title, t.due_date::text AS date, c.legal_name_ar AS client, t.kind FROM office_tasks t LEFT JOIN clients c ON c.id = t.client_id WHERE t.status = 'open' AND t.due_date IS NOT NULL ORDER BY t.due_date LIMIT 10`);
    const deadlines = [...items.map((x) => ({ date: x.date, title: x.title, client: x.client, tone: x.tone })), ...manual.map((m) => ({ date: m.date, title: m.title, client: m.client ?? 'عام', tone: 'pri' }))].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
    const top = [...fin.engagements].sort((a, b) => b.fee - a.fee || String(b.title).localeCompare(String(a.title))).slice(0, 6);
    const team = Number(counts?.users ?? 1) > 1 ? await many(`SELECT u.full_name, count(e.id) AS engagements FROM users u LEFT JOIN engagements e ON e.assigned_to = u.id AND e.status <> 'closed' AND e.group_engagement_id IS NULL WHERE u.is_active GROUP BY u.id ORDER BY 2 DESC`) : [];
    const activity = await many(`SELECT a.action, a.created_at, u.full_name AS user_name, c.legal_name_ar AS client_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN clients c ON c.id = a.client_id WHERE a.action NOT LIKE 'auth.%' AND a.action NOT IN ('ai.assistant','ai.chat') ORDER BY a.created_at DESC LIMIT 8`);
    const office = await one<{ name_ar: string | null }>('SELECT name_ar FROM office_settings WHERE id = 1');
    return { counts, finance: { ...fin, engagements: undefined }, engagements: fin.engagements, deadlines, top, team, activity, office_configured: !!office?.name_ar };
  }
}
