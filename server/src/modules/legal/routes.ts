/** واجهة المكتبة النظامية: الإحصاءات، والمصادر، والمواد، والبحث */
import { Router } from 'express';
import { many, one } from '../../db/pool.js';
import { notFound } from '../../lib/errors.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { z } from 'zod';
import { parse } from '../../lib/validate.js';
import { searchLegal, snippet, legalStats, queryTerms } from './library.js';
import { listRates, approveRate, revokeRate, getRates, calculate } from './rates.js';
import { audit } from '../../middleware/audit.js';

export const legalRouter = Router();
legalRouter.use(authenticate, requirePermission('clients.view'));

legalRouter.get('/stats', async (_req, res, next) => { try { res.json(await legalStats()); } catch (e) { next(e); } });

legalRouter.get('/sources', async (req, res, next) => {
  try {
    const cat = String(req.query.category ?? '');
    res.json({ sources: await many(`SELECT s.code, s.title, s.item, s.category, s.doc_type, s.status, s.source_url, s.page_url, s.pages, s.lang,
        count(c.id) FILTER (WHERE c.kind = 'article') AS articles, count(c.id) AS chunks
      FROM legal_sources s LEFT JOIN legal_chunks c ON c.source_code = s.code ${cat ? 'WHERE s.category = $1' : ''} GROUP BY s.code ORDER BY s.category, s.status, s.title`, cat ? [cat] : []) });
  } catch (e) { next(e); }
});

legalRouter.get('/sources/:code', async (req, res, next) => {
  try {
    const s = await one('SELECT * FROM legal_sources WHERE code = $1', [req.params.code]); if (!s) throw notFound('المصدر غير موجود');
    const toc = await many(`SELECT id::text, ord, kind, ref, num, heading, page_from, page_to, length(body) AS len FROM legal_chunks WHERE source_code = $1 ORDER BY ord`, [req.params.code]);
    res.json({ source: s, toc });
  } catch (e) { next(e); }
});

legalRouter.get('/chunks/:id', async (req, res, next) => {
  try {
    const c = await one<{ source_code: string; ord: number }>(`SELECT c.id::text, c.source_code, c.ord, c.kind, c.ref, c.num, c.heading, c.body, c.page_from, c.page_to, s.title, s.category, s.status, s.source_url, s.doc_type FROM legal_chunks c JOIN legal_sources s ON s.code = c.source_code WHERE c.id = $1`, [req.params.id]);
    if (!c) throw notFound('المادة غير موجودة');
    const nb = await many(`SELECT id::text, ref, heading, ord FROM legal_chunks WHERE source_code = $1 AND ord IN ($2 - 1, $2 + 1) ORDER BY ord`, [c.source_code, c.ord]);
    res.json({ terms: req.query.q ? queryTerms(String(req.query.q).slice(0, 300)) : [], chunk: c, prev: nb.find((x) => Number(x.ord) < c.ord) ?? null, next: nb.find((x) => Number(x.ord) > c.ord) ?? null });
  } catch (e) { next(e); }
});

/** تحديد المقطع الذي يحتوي مقتطف «الأساس النظامي» لفتحه مباشرة في المكتبة */
legalRouter.get('/locate', async (req, res, next) => {
  try {
    const d = parse(z.object({ source: z.string().min(4).max(64), quote: z.string().min(10).max(400) }), req.query);
    const head = d.quote.replace(/\s+/g, ' ').trim().slice(0, 60);
    const r = await one<{ id: string }>(`SELECT id::text FROM legal_chunks WHERE source_code = $1 AND regexp_replace(body, '\\s+', ' ', 'g') LIKE '%' || $2 || '%' ORDER BY page_from NULLS LAST LIMIT 1`, [d.source, head]);
    if (!r) throw notFound('لم يُعثر على المقطع');
    res.json(r);
  } catch (e) { next(e); }
});

legalRouter.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '').slice(0, 300);
    const r = await searchLegal(q, { limit: Number(req.query.limit ?? 20), category: String(req.query.category ?? '') || undefined, status: String(req.query.status ?? '') || undefined, type: String(req.query.type ?? '') || undefined, source: String(req.query.source ?? '') || undefined });
    res.json({ terms: r.terms, hits: r.hits.map((h) => ({ ...h, body: undefined, snippet: snippet(h.body, r.terms) })) });
  } catch (e) { next(e); }
});

// ---------- النسب النظامية والحاسبات ----------
legalRouter.get('/rates', async (_req, res, next) => { try { res.json({ rates: await listRates() }); } catch (e) { next(e); } });

legalRouter.post('/rates/:id/approve', requirePermission('legal.approve'), async (req, res, next) => {
  try {
    const d = parse(z.object({ value: z.number().finite().nonnegative(), note: z.string().max(500).nullable().optional() }), req.body);
    const r = await approveRate(String(req.params.id), d.value, d.note ?? null, req.user!.id);
    await audit(req, { action: 'legal.rate_approved', entityType: 'legal_rate', entityId: r.id, details: { value: d.value, extracted: r.extracted, status: r.status, note: d.note ?? null } });
    res.json({ rate: r });
  } catch (e) { next(e); }
});

legalRouter.post('/rates/:id/revoke', requirePermission('legal.approve'), async (req, res, next) => {
  try { await revokeRate(String(req.params.id)); await audit(req, { action: 'legal.rate_revoked', entityType: 'legal_rate', entityId: String(req.params.id) }); res.json({ ok: true }); } catch (e) { next(e); }
});

legalRouter.post('/calc/:kind', async (req, res, next) => {
  try { res.json(calculate(String(req.params.kind), (req.body ?? {}) as Record<string, unknown>, await getRates())); } catch (e) { next(e); }
});
