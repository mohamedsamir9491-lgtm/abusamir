import { many, one, query } from '../../db/pool.js';
import { badRequest } from '../../lib/errors.js';
import { loadEngagement, loadPeriod } from '../../middleware/scope.js';
import { getStatementsPackage, latestRun, upsertFindings } from '../analysis/service.js';
import { getProvider, checkAuthorization } from './provider.js';
import { AiAnalysisSchema, AiSectionDraftSchema, type AiAnalysis } from './schema.js';
import { sha256 } from '../../lib/crypto.js';
import { withTransaction } from '../../db/pool.js';
import type { EngineFinding } from '../../engine/types.js';
import { normalizeNumberString } from '../../engine/money.js';

const SYSTEM_PROMPT = `أنت محلل مالي ومحاسب مهني يساعد مكتب محاسبة في المملكة العربية السعودية. تكتب بالعربية الفصحى المهنية.
قواعد صارمة:
1. لا تخترع أي رقم أو رصيد أو معاملة أو مرجع أو نظام أو معيار. كل رقم تذكره يجب أن يكون منقولًا حرفيًا من البيانات المدخلة.
2. كل الحسابات الرياضية أُجريت مسبقًا بواسطة النظام؛ لا تعد حسابها ولا تقدّم أرقامًا جديدة. إن احتجت نسبة غير موجودة فقل "غير متاح".
3. لا تؤكد وجود احتيال أو مخالفة؛ صف الأنماط غير الاعتيادية واطلب مستندات وتفسيرات.
4. لا تدّعِ أن إجراءً تم تنفيذه (مثل مطابقة أو تأكيد) ما لم يرد صراحة في البيانات.
5. لا تستشهد بأنظمة أو معايير بأرقام مواد أو نصوص محددة؛ إن كان الأمر يتطلب مرجعًا نظاميًا فاكتب "يلزم التحقق من المتطلب النظامي النافذ" واجعله ضمن documents_needed أو limitations.
6. افصل الحقائق (من البيانات) عن التفسيرات (رأيك المهني) بصياغة واضحة.
7. المخرجات تحليل إداري أولي لمساعدة المحاسب، وليست رأي مراجع مستقل ولا تأكيدًا مهنيًا.
8. رتّب الملاحظات حسب الأهمية النسبية والمخاطر. في evidence_refs ضع مفاتيح البيانات التي اعتمدت عليها.`;

function anonymize(text: string, names: string[]): string {
  let t = text;
  for (const n of names.filter((x) => x && x.length > 2)) t = t.split(n).join('[العميل]');
  return t;
}

export async function buildAnalysisInput(engagementId: string, periodId: string, shareClientNames: boolean) {
  const e = await one<{ id: string; client_id: string; title: string; engagement_type: string; framework: string; currency: string; client_name: string; client_name_en: string | null; industry: string | null; entity_type: string }>(
    `SELECT e.id, e.client_id, e.title, e.engagement_type, e.framework, e.currency, c.legal_name_ar AS client_name, c.legal_name_en AS client_name_en, c.industry, c.entity_type FROM engagements e JOIN clients c ON c.id = e.client_id WHERE e.id = $1`, [engagementId]);
  if (!e) throw badRequest('الارتباط غير موجود');
  const p = await loadPeriod(periodId, engagementId);
  const pkg = await getStatementsPackage(periodId);
  const tbRun = await latestRun(periodId, 'tb_validation');
  if (!pkg || !tbRun) throw badRequest('يجب تشغيل فحص ميزان المراجعة وتوليد القوائم المالية قبل التحليل الذكي');
  const findings = await many<{ finding_ref: string; rule_code: string | null; category: string; severity: string; title: string; description: string; account_code: string | null; amount: string | null; review_status: string; calculation: string | null }>(
    `SELECT finding_ref, rule_code, category, severity, title, description, account_code, amount, review_status, calculation FROM findings WHERE period_id = $1 AND review_status <> 'rejected' AND origin <> 'ai'
     ORDER BY CASE severity WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END DESC LIMIT 60`, [periodId]);
  const recon = await many<{ recon_type: string; summary: unknown }>('SELECT recon_type, summary FROM reconciliation_results WHERE period_id = $1 ORDER BY created_at DESC LIMIT 10', [periodId]);
  const data = pkg.data;
  const input = {
    context: { client: shareClientNames ? e.client_name : '[العميل]', entity_type: e.entity_type, industry: e.industry, engagement_type: e.engagement_type, framework: e.framework, currency: e.currency,
      period: { label: p.label, start: p.start_date, end: p.end_date }, prior_period: data.prior ?? null, note: 'ميزان مراجعة قبل الإقفال؛ القوائم مشتقة آليًا من التصنيف الحالي للحسابات.' },
    trial_balance_summary: (tbRun as { summary: unknown }).summary,
    key_figures: data.statements.key_figures,
    statements: {
      sfp: { lines: data.statements.sfp.lines.map((l) => ({ code: l.code, label: l.label_ar, value: l.value, prior: l.prior_value })), totals: data.statements.sfp.totals, balanced: data.statements.sfp.balanced },
      pl: { lines: data.statements.pl.lines.map((l) => ({ code: l.code, label: l.label_ar, value: l.value, prior: l.prior_value })), totals: data.statements.pl.totals },
      cf: { status: data.statements.cf.status, totals: data.statements.cf.totals },
      notes: data.statements.notes,
    },
    ratios: data.ratios.map((r) => ({ code: r.code, label: r.label_ar, value: r.value, prior: r.prior_value ?? null, unit: r.unit, status: r.status, formula: r.formula_ar, inputs: r.inputs })),
    variance_material: data.variance?.rows.filter((v) => v.material).slice(0, 40) ?? [],
    engine_findings: findings.map((f) => ({ ref: f.finding_ref, rule: f.rule_code, category: f.category, severity: f.severity, title: f.title, description: shareClientNames ? f.description : anonymize(f.description, [e.client_name, e.client_name_en ?? '']), account: f.account_code, amount: f.amount, status: f.review_status, calculation: f.calculation })),
    reconciliations: recon,
  };
  return { engagement: e, period: p, input };
}

/** جمع كل الأرقام الواردة في المدخلات للتحقق من أن أرقام المخرجات ليست مختلقة */
function collectNumbers(obj: unknown, acc = new Set<string>()): Set<string> {
  if (obj == null) return acc;
  if (typeof obj === 'string') { const n = normalizeNumberString(obj); if (n && /^-?\d+(\.\d+)?$/.test(n)) { acc.add(n.replace(/\.?0+$/, '')); } return acc; }
  if (typeof obj === 'number') { acc.add(String(obj).replace(/\.?0+$/, '')); return acc; }
  if (Array.isArray(obj)) { for (const x of obj) collectNumbers(x, acc); return acc; }
  if (typeof obj === 'object') { for (const v of Object.values(obj as Record<string, unknown>)) collectNumbers(v, acc); }
  return acc;
}
function numbersInText(text: string): string[] {
  return (text.match(/-?\d[\d,٬]*(?:[.٫]\d+)?/g) ?? []).map((m) => normalizeNumberString(m).replace(/\.?0+$/, '')).filter((n) => n && /^-?\d+(\.\d+)?$/.test(n) && Math.abs(Number(n)) >= 100);
}

export async function runAiAnalysis(engagementId: string, periodId: string, userId: string) {
  const auth = await checkAuthorization();
  if (!auth.allowed) throw badRequest(auth.reason ?? 'غير مصرح');
  const { engagement, input } = await buildAnalysisInput(engagementId, periodId, auth.shareClientNames);
  const provider = getProvider();
  const userMsg = `حلّل البيانات المالية التالية (JSON) وأعد المخرجات وفق المخطط المطلوب. ركّز على: تفسير التغيرات الجوهرية، الحركات غير الاعتيادية، مخاطر السيولة والربحية والمديونية ورأس المال العامل، التناقضات بين القوائم والجداول، أسئلة للإدارة عن الأرصدة غير المفسرة، المستندات الإضافية المطلوبة، وقائمة مراجعة للمحاسب.\n\n${JSON.stringify(input)}`;
  const inputHash = sha256(userMsg);
  const reqRow = await one<{ id: string }>(`INSERT INTO ai_requests (engagement_id, period_id, provider, model, purpose, input_hash, created_by) VALUES ($1,$2,$3,$4,'analysis',$5,$6) RETURNING id`, [engagementId, periodId, provider.name, null, inputHash, userId]);
  const runRow = await one<{ id: string }>(`INSERT INTO analysis_runs (client_id, engagement_id, period_id, run_type, started_by) VALUES ($1,$2,$3,'ai_analysis',$4) RETURNING id`, [engagement.client_id, engagementId, periodId, userId]);
  const result = await provider.run<AiAnalysis>({ purpose: 'analysis', system: SYSTEM_PROMPT, user: userMsg, schema: AiAnalysisSchema, maxTokens: 16000 });
  if (!result.ok) {
    await query(`UPDATE ai_requests SET status = $2, error_message = $3, finished_at = now() WHERE id = $1`, [reqRow!.id, result.code === 'schema_rejected' ? 'rejected_schema' : 'failed', result.error]);
    await query(`UPDATE analysis_runs SET status = 'failed', error_message = $2, finished_at = now() WHERE id = $1`, [runRow!.id, result.error]);
    throw badRequest(result.error);
  }
  // التحقق من الأرقام: أي رقم مقتبس غير موجود في المدخلات يُعلَّم كغير متحقق
  const known = collectNumbers(input);
  const unverified: string[] = [];
  const checkText = (t: string | null | undefined, where: string) => { for (const n of numbersInText(t ?? '')) if (!known.has(n)) unverified.push(`${where}: ${n}`); };
  checkText(result.data.executive_summary_ar, 'executive_summary'); checkText(result.data.financial_commentary_ar, 'commentary');
  for (const o of result.data.observations) { checkText(o.explanation, `observation:${o.title}`); if (o.amount_quoted && !known.has(normalizeNumberString(o.amount_quoted).replace(/\.?0+$/, ''))) unverified.push(`observation:${o.title}: amount ${o.amount_quoted}`); }
  const output = { ...result.data, _verification: { numbers_checked: true, unverified_numbers: unverified, model: result.model, input_hash: inputHash, generated_at: new Date().toISOString() } };
  await withTransaction(async (tx) => {
    await query(`UPDATE ai_requests SET status = 'completed', model = $2, input_tokens = $3, output_tokens = $4, response = $5, finished_at = now() WHERE id = $1`, [reqRow!.id, result.model, result.inputTokens, result.outputTokens, JSON.stringify(output)], tx);
    const fs: EngineFinding[] = result.data.observations.map((o, i) => ({
      rule_code: 'AI', category: o.category, severity: o.severity, title: o.title, description: `${o.explanation}${o.confidence !== 'high' ? ` (ثقة المساعد: ${o.confidence === 'medium' ? 'متوسطة' : 'منخفضة'})` : ''}`,
      account_code: o.fs_line_or_account && /^\d/.test(o.fs_line_or_account) ? o.fs_line_or_account : null, fs_line_code: o.fs_line_or_account && !/^\d/.test(o.fs_line_or_account) ? o.fs_line_or_account.slice(0, 50) : null,
      amount: o.amount_quoted && known.has(normalizeNumberString(o.amount_quoted).replace(/\.?0+$/, '')) ? normalizeNumberString(o.amount_quoted) : null,
      evidence: { evidence_refs: o.evidence_refs, confidence: o.confidence, ai_request_id: reqRow!.id, amount_quoted: o.amount_quoted, amount_verified: !!(o.amount_quoted && known.has(normalizeNumberString(o.amount_quoted).replace(/\.?0+$/, ''))) },
      impact: o.potential_impact, recommendation: o.recommendation, dedupe_key: `AI:${inputHash.slice(0, 8)}:${i}`,
    }));
    // ملاحظات الذكاء الاصطناعي تُحفظ بأصل ai وتبقى مفتوحة للمراجعة البشرية
    for (const f of fs) {
      const ref = await one<{ n: string }>(`SELECT nextval('findings_ref_seq') AS n`, [], tx);
      await query(`INSERT INTO findings (client_id, engagement_id, period_id, finding_ref, rule_code, category, severity, title, description, account_code, fs_line_code, amount, currency, evidence, impact, recommendation, origin, dedupe_key, run_id, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'ai',$17,$18,$19) ON CONFLICT (engagement_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
        [engagement.client_id, engagementId, periodId, `F-${String(ref!.n).padStart(4, '0')}`, f.rule_code, f.category, f.severity, f.title, f.description, f.account_code, f.fs_line_code, f.amount, engagement.currency, JSON.stringify(f.evidence), f.impact, f.recommendation, `${periodId}:${f.dedupe_key}`, runRow!.id, userId], tx);
    }
    await query(`UPDATE analysis_runs SET status = 'completed', summary = $2, result = $3, finished_at = now() WHERE id = $1`, [runRow!.id, JSON.stringify({ observations: fs.length, unverified_numbers: unverified.length, model: result.model, ai_request_id: reqRow!.id }), JSON.stringify(output), tx]);
  });
  void upsertFindings;
  return { run_id: runRow!.id, request_id: reqRow!.id, analysis: output, usage: { input_tokens: result.inputTokens, output_tokens: result.outputTokens, model: result.model } };
}

export async function latestAiAnalysis(periodId: string) {
  const r = await one<{ id: string; result: unknown; summary: unknown; started_at: string }>(`SELECT id, result, summary, started_at FROM analysis_runs WHERE period_id = $1 AND run_type = 'ai_analysis' AND status = 'completed' ORDER BY started_at DESC LIMIT 1`, [periodId]);
  return r ?? null;
}

/** صياغة قسم تقرير بالعربية من بيانات محددة (يستخدمه محرر التقارير) */
export async function draftSection(params: { engagementId: string; periodId: string; sectionTitle: string; instructions: string; userId: string }) {
  const auth = await checkAuthorization();
  if (!auth.allowed) throw badRequest(auth.reason ?? 'غير مصرح');
  const { input } = await buildAnalysisInput(params.engagementId, params.periodId, auth.shareClientNames);
  const provider = getProvider();
  const userMsg = `اكتب نص قسم "${params.sectionTitle}" لتقرير تحليل مالي بالعربية المهنية. تعليمات المحاسب: ${params.instructions || 'بدون'}.\nاستخدم فقط الأرقام الواردة في البيانات التالية وضعها في figures_used.\n\n${JSON.stringify(input)}`;
  const reqRow = await one<{ id: string }>(`INSERT INTO ai_requests (engagement_id, period_id, provider, purpose, input_hash, created_by) VALUES ($1,$2,$3,'section_draft',$4,$5) RETURNING id`, [params.engagementId, params.periodId, provider.name, sha256(userMsg), params.userId]);
  const result = await provider.run({ purpose: 'section_draft', system: SYSTEM_PROMPT, user: userMsg, schema: AiSectionDraftSchema, maxTokens: 8000 });
  if (!result.ok) { await query(`UPDATE ai_requests SET status = 'failed', error_message = $2, finished_at = now() WHERE id = $1`, [reqRow!.id, result.error]); throw badRequest(result.error); }
  const known = collectNumbers(input);
  const unverified = numbersInText(result.data.text_ar).filter((n) => !known.has(n));
  await query(`UPDATE ai_requests SET status = 'completed', model = $2, input_tokens = $3, output_tokens = $4, response = $5, finished_at = now() WHERE id = $1`, [reqRow!.id, result.model, result.inputTokens, result.outputTokens, JSON.stringify({ ...result.data, unverified })]);
  return { text_ar: result.data.text_ar, unverified_numbers: unverified, request_id: reqRow!.id };
}

export async function aiStatus() {
  const auth = await checkAuthorization();
  const provider = getProvider();
  return { provider: provider.name, available: provider.available(), authorized: auth.allowed, reason: auth.reason ?? null, share_client_names: auth.shareClientNames, model: provider.name === 'anthropic' ? (await import('../../config.js')).config.ai.model : null };
}

/** التحليل المحلي (الافتراضي): بلا أي اتصال خارجي؛ يُحفظ بنفس شكل مخرجات المساعد ليظهر في الشاشة والتقارير */
export async function runLocalAnalysis(engagementId: string, periodId: string, userId: string) {
  const { buildLocalContext, localAnalysis, localObservations } = await import('./local.js');
  const ctx = await buildLocalContext(engagementId, periodId);
  const analysis = localAnalysis(ctx);
  const output = { ...analysis, _verification: { engine: 'local', numbers_checked: true, unverified_numbers: [] as string[], model: 'local-rules', generated_at: new Date().toISOString() } };
  const run = await withTransaction(async (tx) => {
    const r = await one<{ id: string }>(`INSERT INTO analysis_runs (client_id, engagement_id, period_id, run_type, status, summary, result, started_by, finished_at) VALUES ($1,$2,$3,'ai_analysis','completed',$4,$5,$6,now()) RETURNING id`,
      [ctx.clientId, engagementId, periodId, JSON.stringify({ engine: 'local', observations: analysis.observations.length }), JSON.stringify(output), userId], tx);
    await upsertFindings({ clientId: ctx.clientId, engagementId, periodId, runId: r!.id, rulePrefix: ['LA-'], findings: localObservations(ctx), userId }, tx);
    return r!;
  });
  return { run_id: run.id, analysis: output };
}

/** المحادثة عبر المزوّد الخارجي (جاهزة ومعطلة افتراضيًا): تُستخدم فقط إن فُعّل المزوّد وسمحت السياسة */
export async function externalChat(engagementId: string, periodId: string, question: string, userId: string) {
  const auth = await checkAuthorization();
  if (!auth.allowed) throw badRequest(auth.reason ?? 'المزوّد الخارجي غير مفعّل');
  const { input } = await buildAnalysisInput(engagementId, periodId, auth.shareClientNames);
  const { z } = await import('zod');
  const schema = z.object({ answer_ar: z.string().min(2).max(6000), figures_used: z.array(z.string().max(60)).max(40) });
  const provider = getProvider();
  const userMsg = `سؤال المحاسب: ${question}\nأجب بالعربية مستخدمًا فقط البيانات التالية (JSON) والمبادئ المحاسبية العامة، واذكر الأرقام حرفيًا:\n${JSON.stringify(input)}`;
  const reqRow = await one<{ id: string }>(`INSERT INTO ai_requests (engagement_id, period_id, provider, purpose, input_hash, created_by) VALUES ($1,$2,$3,'chat',$4,$5) RETURNING id`, [engagementId, periodId, provider.name, sha256(userMsg), userId]);
  const result = await provider.run({ purpose: 'chat', system: SYSTEM_PROMPT, user: userMsg, schema, maxTokens: 4000 });
  if (!result.ok) { await query(`UPDATE ai_requests SET status = 'failed', error_message = $2, finished_at = now() WHERE id = $1`, [reqRow!.id, result.error]); throw badRequest(result.error); }
  const known = collectNumbers(input); const unverified = numbersInText(result.data.answer_ar).filter((x) => !known.has(x));
  await query(`UPDATE ai_requests SET status = 'completed', model = $2, input_tokens = $3, output_tokens = $4, response = $5, finished_at = now() WHERE id = $1`, [reqRow!.id, result.model, result.inputTokens, result.outputTokens, JSON.stringify(result.data)]);
  return { answer: result.data.answer_ar, unverified_numbers: unverified, model: result.model };
}
