import { D, toStr, pct } from './money.js';

export interface VarianceRow {
  key: string; label_ar: string; label_en?: string;
  current: string; comparative: string; change: string; change_pct: string | null;
  material: boolean; direction: 'up' | 'down' | 'flat';
}

export function computeVariance(
  items: { key: string; label_ar: string; label_en?: string; current: string | null; comparative: string | null }[],
  opts: { materiality?: string; pctThreshold?: number } = {},
): { rows: VarianceRow[]; material_count: number; materiality: string | null; pct_threshold: number } {
  const mat = opts.materiality ? D(opts.materiality) : null;
  const thr = opts.pctThreshold ?? 10;
  const rows: VarianceRow[] = [];
  for (const it of items) {
    if (it.current == null && it.comparative == null) continue;
    const c = D(it.current ?? 0); const p = D(it.comparative ?? 0);
    const ch = c.minus(p);
    const chPct = p.isZero() ? null : pct(ch, p.abs());
    const material = (mat ? ch.abs().gte(mat) : !ch.isZero()) && (chPct === null || chPct.abs().gte(thr));
    rows.push({ key: it.key, label_ar: it.label_ar, label_en: it.label_en, current: toStr(c), comparative: toStr(p), change: toStr(ch),
      change_pct: chPct === null ? null : chPct.toFixed(2), material: material && !ch.isZero(), direction: ch.isZero() ? 'flat' : ch.gt(0) ? 'up' : 'down' });
  }
  return { rows, material_count: rows.filter((r) => r.material).length, materiality: mat ? toStr(mat) : null, pct_threshold: thr };
}
