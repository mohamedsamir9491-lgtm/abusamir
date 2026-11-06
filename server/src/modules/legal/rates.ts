/** جدول النسب النظامية: تحميله من ملف المكتبة، والاعتماد، والحاسبات. لا تُستخدم نسبة في حساب إلا إذا تطابقت في مصدرين رسميين أو اعتمدها المكتب */
import fs from 'node:fs';
import path from 'node:path';
import { pool, one, many } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { CORPUS_FILE } from './library.js';
import { badRequest, notFound } from '../../lib/errors.js';

export const RATES_FILE = path.join(path.dirname(CORPUS_FILE), 'rates.json');
interface Evidence { source: string; ref: string; heading: string; page: number; value: number; method: string; excerpt: string; primary: boolean; type: string }
interface RateFileItem { id: string; group: string; label: string; unit: string; value: number | null; status: string; evidence: Evidence[] }
export interface Rate { id: string; grp: string; label: string; unit: string; extracted: number | null; status: string; evidence: Evidence[]; approved_value: number | null; approved_by: string | null; approved_by_name?: string | null; approved_at: string | null; note: string | null; changed: boolean; effective: number | null; usable: boolean }

const AUTO = new Set(['match', 'match_note']);
const n = (v: unknown) => (v == null ? null : Number(v));
/** القيمة المستخدمة في الحساب: المعتمدة من المكتب، وإلا المتطابقة تلقائيًا من مصدرين */
export const effective = (r: { status: string; extracted: number | null; approved_value: number | null; changed: boolean }) =>
  r.approved_value != null && !r.changed ? r.approved_value : AUTO.has(r.status) && r.approved_value == null ? r.extracted : null;

export async function loadLegalRates(version: string | null, file = RATES_FILE): Promise<number> {
  if (!fs.existsSync(file)) return 0;
  const items = JSON.parse(fs.readFileSync(file, 'utf8')) as RateFileItem[];
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const it of items) {
      // تغيّر القيمة المستخرجة بعد اعتماد المكتب ← يحتاج مراجعة (لا يُستخدم القديم ولا الجديد حتى يُراجع)
      await c.query(`INSERT INTO legal_rates (id, grp, label, unit, extracted, status, evidence, library_version, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
        ON CONFLICT (id) DO UPDATE SET grp = EXCLUDED.grp, label = EXCLUDED.label, unit = EXCLUDED.unit, status = EXCLUDED.status, evidence = EXCLUDED.evidence, library_version = EXCLUDED.library_version, updated_at = now(),
          changed = legal_rates.changed OR (legal_rates.approved_value IS NOT NULL AND EXCLUDED.extracted IS DISTINCT FROM legal_rates.extracted AND EXCLUDED.extracted IS DISTINCT FROM legal_rates.approved_value),
          extracted = EXCLUDED.extracted`,
        [it.id, it.group, it.label, it.unit, it.value, it.status, JSON.stringify(it.evidence), version]);
    }
    // بند أُلغي في المصدر (مثل نسبة المشروبات المحلاة القديمة) لا يبقى في الجدول ولا تستخدمه الحاسبات
    await c.query('DELETE FROM legal_rates WHERE NOT (id = ANY($1::text[]))', [items.map((i) => i.id)]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  logger.info({ rates: items.length }, 'legal rates loaded');
  return items.length;
}

const shape = (r: Record<string, unknown>): Rate => {
  const x = { ...r, extracted: n(r.extracted), approved_value: n(r.approved_value), changed: Boolean(r.changed) } as unknown as Rate;
  const eff = effective(x); return { ...x, effective: eff, usable: eff != null };
};
export async function listRates(): Promise<Rate[]> {
  const rows = await many<Record<string, unknown>>(`SELECT r.*, u.full_name AS approved_by_name FROM legal_rates r LEFT JOIN users u ON u.id = r.approved_by ORDER BY array_position(ARRAY['الزكاة','ضريبة الدخل','الاستقطاع','القيمة المضافة','التصرفات العقارية','الانتقائية','الغرامات'], r.grp), r.id`);
  return rows.map(shape);
}
export async function getRates(): Promise<Map<string, Rate>> { return new Map((await listRates()).map((r) => [r.id, r])); }

export async function approveRate(id: string, value: number, note: string | null, userId: string): Promise<Rate> {
  const r = await one<Record<string, unknown>>('SELECT * FROM legal_rates WHERE id = $1', [id]);
  if (!r) throw notFound('البند غير موجود');
  const ev = (r.evidence as Evidence[]) ?? [];
  // قيمة لا يذكرها أي مصدر تحتاج ملاحظة تشرح سببها
  if (!ev.some((e) => Number(e.value) === value) && !(note && note.trim().length >= 5)) throw badRequest('القيمة لا تطابق أي مصدر؛ اكتب سبب التعديل');
  await one(`UPDATE legal_rates SET approved_value = $2, approved_by = $3, approved_at = now(), note = $4, changed = false WHERE id = $1 RETURNING id`, [id, value, userId, note]);
  return shape((await one<Record<string, unknown>>('SELECT r.*, u.full_name AS approved_by_name FROM legal_rates r LEFT JOIN users u ON u.id = r.approved_by WHERE r.id = $1', [id]))!);
}
export async function revokeRate(id: string): Promise<void> { await one('UPDATE legal_rates SET approved_value = NULL, approved_by = NULL, approved_at = NULL, note = NULL, changed = false WHERE id = $1 RETURNING id', [id]); }

// ---------- الحاسبات ----------
export interface CalcLine { label: string; value: number; unit?: string; strong?: boolean }
export interface CalcResult { ok: boolean; lines: CalcLine[]; refs: string[]; notes: string[]; missing: { id: string; label: string }[] }
const r2 = (v: number) => Math.round(v * 100) / 100;
const ref = (r: Rate | undefined) => { const e = r?.evidence?.find((x) => x.primary) ?? r?.evidence?.[0]; return e ? `${e.source} | ${e.ref}` : ''; };

export function calculate(kind: string, input: Record<string, unknown>, rates: Map<string, Rate>): CalcResult {
  const missing: CalcResult['missing'] = []; const used: Rate[] = [];
  const need = (id: string): number => { const r = rates.get(id); if (!r || r.effective == null) { missing.push({ id, label: r?.label ?? id }); return NaN; } used.push(r); return r.effective; };
  const num = (k: string, d = 0) => { const v = Number(input[k]); return Number.isFinite(v) && v >= 0 ? v : d; };
  const lines: CalcLine[] = []; const notes: string[] = [];
  switch (kind) {
    case 'wht': {
      const id = String(input.type ?? ''); if (!id.startsWith('wht.')) throw badRequest('نوع الدفعة غير صحيح');
      const rate = need(id) / 100; const amt = num('amount'); const net = input.basis === 'net';
      const gross = net ? amt / (1 - rate) : amt; const tax = gross * rate;
      lines.push({ label: 'النسبة', value: rate * 100, unit: '%' }, { label: 'المبلغ الخاضع', value: r2(gross) }, { label: 'الضريبة المستقطعة', value: r2(tax), strong: true }, { label: 'المحوَّل للمستفيد', value: r2(gross - tax) });
      if (net) notes.push('المبلغ المتفق عليه صافٍ للمستفيد، فرُفع المبلغ الخاضع بحيث يتحمّل الدافع الضريبة.');
      notes.push('يُسدَّد المبلغ المستقطع خلال العشرة أيام الأولى من الشهر التالي لشهر الدفع (المادة 68/ب من نظام ضريبة الدخل).');
      break;
    }
    case 'it_penalty': {
      const unpaid = num('unpaid'); const rev = num('revenue'); const df = num('file_days'); const dp = num('pay_days'); const partialFull = input.partial !== 'complete';
      const a = Math.min(rev * need('pen.it.nofile') / 100, need('pen.it.nofile.cap'));
      const tierId = df <= 0 ? null : df <= 30 ? 'pen.it.late30' : df <= 90 ? 'pen.it.late90' : df <= 365 ? 'pen.it.late365' : 'pen.it.late365p';
      const tier = tierId ? need(tierId) : 0; const b = unpaid * tier / 100; const filing = df > 0 ? Math.max(a, b) : 0;
      const periods = partialFull ? Math.ceil(dp / 30) : Math.floor(dp / 30); const lateRate = need('pen.it.late');
      const late = unpaid * lateRate / 100 * periods;
      lines.push({ label: `غرامة الفقرة (أ): نسبة من الإيرادات بحد أعلى`, value: r2(a) }, { label: `غرامة الفقرة (ب): ${tier}% من الضريبة غير المسددة`, value: r2(b) },
        { label: 'غرامة تأخير الإقرار (الأعلى من الغرامتين)', value: r2(filing) }, { label: `غرامة تأخير السداد: ${lateRate}% × عدد فترات الثلاثين يومًا (${periods})`, value: r2(late) }, { label: 'الإجمالي', value: r2(filing + late), strong: true });
      const alt = unpaid * lateRate / 100 * (partialFull ? Math.floor(dp / 30) : Math.ceil(dp / 30));
      if (dp % 30) notes.push(partialFull ? `حُسب جزء الثلاثين يومًا فترة كاملة (تقدير متحفّظ). لو احتُسبت الفترات الكاملة فقط تكون غرامة السداد ${r2(alt).toLocaleString('en-US')} ريال. النظام ينص على «عن كل ثلاثين يوم تأخير» ولم يرد فيه «أو جزء منها».` : `احتُسبت فترات الثلاثين يومًا الكاملة فقط. بالتقدير المتحفّظ (جزء الفترة فترة كاملة) تكون ${r2(alt).toLocaleString('en-US')} ريال.`);
      notes.push('تُحسب غرامة التأخير من تاريخ استحقاق الضريبة إلى تاريخ السداد (المادة 77/أ).');
      break;
    }
    case 'vat': {
      const rate = need('vat.rate') / 100; const amt = num('amount'); const incl = input.basis === 'inclusive';
      const base = incl ? amt / (1 + rate) : amt; const vat = base * rate;
      lines.push({ label: 'النسبة', value: rate * 100, unit: '%' }, { label: 'القيمة قبل الضريبة', value: r2(base) }, { label: 'ضريبة القيمة المضافة', value: r2(vat), strong: true }, { label: 'الإجمالي شامل الضريبة', value: r2(base + vat) });
      const m = num('late_months');
      if (m > 0) { const p = need('pen.vat.latepay'); const months = Math.ceil(m); lines.push({ label: `غرامة عدم السداد: ${p}% عن كل شهر أو جزء منه × ${months}`, value: r2(vat * p / 100 * months) }); notes.push('النص: «عن كل شهر أو جزء منه لم تسدد عنه الضريبة» (المادة 43 من نظام ضريبة القيمة المضافة).'); }
      if (input.late_filing) { const lo = need('pen.vat.latefile'); const hi = need('pen.vat.latefile.max'); lines.push({ label: `غرامة عدم تقديم الإقرار: من ${lo}% إلى ${hi}% (تقدّرها الهيئة)`, value: r2(vat * lo / 100) }, { label: 'الحد الأعلى المحتمل', value: r2(vat * hi / 100) }); }
      break;
    }
    case 'zakat': {
      const base = num('base'); const days = num('days', 354); const hijri = num('hijri_days', 354); const rate = need('zakat.rate');
      const eff = input.year === 'hijri' ? rate : rate / hijri * days;
      lines.push({ label: 'نسبة الزكاة المطبقة', value: Math.round(eff * 10000) / 10000, unit: '%' }, { label: 'الوعاء الزكوي', value: r2(base) }, { label: 'الزكاة المستحقة', value: r2(base * eff / 100), strong: true });
      if (input.year !== 'hijri') notes.push(`السنة المالية تختلف عن الهجرية: النسبة = ${rate}% ÷ ${hijri} يومًا × ${days} يومًا (المادة 15/2 من اللائحة التنفيذية لجباية الزكاة).`);
      notes.push('الفترة المالية الأقل من 354 يومًا تخضع في بداية النشاط ولا تخضع في نهايته (المادة 15/3 و15/4). الوعاء نفسه يُحسب وفق عناصر الإضافة والحسم في اللائحة.');
      break;
    }
    case 'rett': {
      const v = num('value'); const rate = need('rett.rate');
      lines.push({ label: 'النسبة', value: rate, unit: '%' }, { label: 'قيمة التصرف', value: r2(v) }, { label: 'ضريبة التصرفات العقارية', value: r2(v * rate / 100), strong: true });
      notes.push('تحتسب الضريبة على إجمالي قيمة التصرف المتفق عليها (المادة 2 من النظام). راجع حالات الاستثناء من الضريبة في النظام ولائحته قبل الحساب.');
      break;
    }
    case 'sweet': {
      // المادة الثالثة من اللائحة التنفيذية للضريبة الانتقائية: معدل لكل لتر حسب السكر الإجمالي لكل 100 مل؛ والمادة الرابعة: المعدل × عدد اللترات
      const sugar = num('sugar'); const noSugar = Boolean(input.no_sugar); const ml = num('ml', 330); const units = num('units', 1);
      const tier = noSugar ? 1 : sugar < 5 ? 2 : sugar < 8 ? 3 : 4;
      const rate = need(`ex.sweet.t${tier}`); const litres = ml * units / 1000;
      const names = ['', 'الأولى (خالية من السكر)', 'الثانية (أقل من 5 جرام)', 'الثالثة (من 5 إلى 7.99 جرام)', 'الرابعة (8 جرام فأكثر)'];
      lines.push({ label: `الشريحة ${names[tier]}`, value: rate, unit: 'ريال/لتر' }, { label: 'الكمية باللتر', value: Math.round(litres * 1000) / 1000, unit: 'لتر' }, { label: 'الضريبة الانتقائية', value: r2(rate * litres), strong: true });
      notes.push('الشريحة حسب السكر الإجمالي لكل 100 مل من المشروب الجاهز للشرب (المادة 2/1/ج والمادة 3/3 من اللائحة التنفيذية للضريبة الانتقائية)؛ والضريبة = معدل الشريحة × عدد اللترات (المادة 4/2).');
      notes.push('المركزات والمساحيق تُحسب على المشروب النهائي بعد التخفيف حسب نسبة التخفيف المدونة على العبوة. والمشروبات الغازية المحلاة تخضع لهذه الشرائح.');
      break;
    }
    default: throw badRequest('حاسبة غير معروفة');
  }
  if (missing.length) return { ok: false, lines: [], refs: [], notes: [], missing };
  return { ok: true, lines, notes, missing, refs: [...new Set(used.map(ref).filter(Boolean))] };
}
