/**
 * استخراج الحقول من المستندات النظامية (نماذج وزارة التجارة الموحدة): عقد التأسيس / النظام الأساس، السجل التجاري.
 * محلي بالكامل وقائم على قواعد؛ لكل حقل دليله (الصفحة والسطر) ودرجة ثقة، ولا يُعتمد شيء دون مراجعة المستخدم.
 */
export interface Evidence { page: number; snippet: string }
export interface Field<T = string> { value: T | null; evidence: Evidence | null; confidence: number; source: 'auto' | 'manual' }
export interface Partner { name: string; id_no: string | null; nature: 'capital' | 'work' | 'founder' | 'owner'; shares: number | null; amount: number | null; pct: number | null }
export interface BoardMember { name: string; position: string; id_no: string | null }
export interface OfficialFields {
  doc_kind: Field<'articles' | 'cr' | 'other'>;
  company_name: Field; legal_form: Field<'llc' | 'jsc' | 'sole' | 'partnership' | 'other'>; single_person: Field<boolean>; closed_jsc: Field<boolean>;
  is_draft: Field<boolean>; request_no: Field; contract_date_hijri: Field; contract_date: Field;
  head_office: Field; activities: Field<string[]>;
  capital: Field<number>; paid_capital: Field<number>; shares_count: Field<number>; share_value: Field<number>; fully_paid: Field<boolean>;
  partners: Field<Partner[]>; board: Field<BoardMember[]>; owner_name: Field; owner_cr: Field;
  fy_end_month: Field<number>; fy_end_day: Field<number>; first_fy_end: Field;
  unified_no: Field; cr_no: Field; cr_issue_hijri: Field; cr_expiry_hijri: Field; cr_expiry: Field; city: Field;
}
export interface PageText { page: number; method: string; text: string }

const f = <T>(value: T | null, ev: Evidence | null = null, confidence = value == null ? 0 : 0.8): Field<T> => ({ value, evidence: ev, confidence, source: 'auto' });
/** كلمة عربية قد يفصل PDF بين حروفها بمسافة ("ر يال") */
const w = (word: string) => [...word].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s?');
const num = (s: string | undefined | null) => { if (s == null) return null; const n = Number(String(s).replace(/[,٬\s]/g, '')); return Number.isFinite(n) ? n : null; };
const CITIES = ['الرياض', 'جدة', 'الدمام', 'مكة المكرمة', 'المدينة المنورة', 'الخبر', 'الطائف', 'تبوك', 'بريدة', 'أبها', 'الأحساء', 'القطيف', 'حائل', 'جازان', 'نجران', 'الجبيل', 'ينبع', 'الظهران'];
const fixCity = (s: string) => { const j = s.replace(/\s+/g, ''); return CITIES.find((c) => c.replace(/\s+/g, '') === j || j.startsWith(c.replace(/\s+/g, ''))) ?? s.trim(); };
const cleanName = (s: string) => s.replace(/\s+/g, ' ').replace(/^[|:\s-]+|[|:\s-]+$/g, '').replace(/\s+(?:مساهمة(?:\s+مقفلة)?|ذات\s+مسؤولية\s+محدودة|شخص واحد)$/, '').trim();
const nk = (s: string) => s.replace(/[\s\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const isoFromDmy = (s: string) => { const m = s.match(/(\d{1,4})\/(\d{1,2})\/(\d{1,4})/); if (!m) return null; let [a, b, c] = [m[1]!, m[2]!, m[3]!]; if (a.length === 4) [a, c] = [c, a]; return `${c.padStart(4, '0')}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`; };

interface Line { page: number; text: string; cells: string[] }
function linesOf(pages: PageText[]): Line[] {
  const out: Line[] = [];
  for (const p of pages) for (const raw of p.text.split(/\n/)) { const t = raw.replace(/ /g, ' ').trim(); if (!t) continue; out.push({ page: p.page, text: t.replace(/\s{2,}/g, ' | '), cells: t.split(/\s{2,}|\s\|\s/).map((c) => c.trim()).filter(Boolean) }); }
  return out;
}
const find = (lines: Line[], re: RegExp, from = 0) => { for (let i = from; i < lines.length; i++) { const m = lines[i]!.text.match(re); if (m) return { m, i, line: lines[i]! }; } return null; };
const ev = (l: Line): Evidence => ({ page: l.page, snippet: l.text.slice(0, 220) });

export function parseOfficial(pages: PageText[], hint?: string | null): OfficialFields {
  const L = linesOf(pages); const all = L.map((l) => l.text).join('\n');
  const isCr = hint === 'commercial_registration' || /رمزك التجاري|شهادة تسجيل|Registration Certificate|السجل التجاري\b/.test(all.slice(0, 600)) && !/نظام\s?أساس|عقد\s?تأسيس/.test(all.slice(0, 400));
  const isArticles = hint === 'articles_of_association' || /نظام\s?أ?ساس|عقد\s?تأسيس|تأسيس شركة/.test(all.slice(0, 1500));
  const r = {} as OfficialFields;
  r.doc_kind = f(isCr ? 'cr' : isArticles ? 'articles' : 'other', null, 0.9);
  // الاسم والشكل القانوني
  const nameHit = find(L, new RegExp(`^(?:نظام ${w('أساس')} )?(شركة [^|()]{2,60}?)(?:\\s*\\(|\\s*\\||$)`));
  r.company_name = nameHit ? f(cleanName(nameHit.m[1]!), ev(nameHit.line), 0.85) : f<string>(null);
  const formLine = find(L, /ذات\s?(?:ال)?مسؤولية\s?(?:ال)?محدودة|مساهمة|تضامن|توصية|مؤسسة فردية/);
  const formTxt = formLine?.m[0] ?? '';
  r.legal_form = formLine ? f(/مساهمة/.test(formTxt) ? 'jsc' : /محدودة/.test(formTxt) ? 'llc' : /تضامن|توصية/.test(formTxt) ? 'partnership' : /مؤسسة/.test(formTxt) ? 'sole' : 'other', ev(formLine.line), 0.85) : f<'llc'>(null);
  const sp = find(L, /شخص واحد/); r.single_person = f(!!sp, sp ? ev(sp.line) : null, sp ? 0.9 : 0.5);
  const cj = find(L, /مقفلة/); r.closed_jsc = f(!!cj && r.legal_form.value === 'jsc', cj ? ev(cj.line) : null, cj ? 0.8 : 0.4);
  // حالة المستند
  const dr = find(L, /مسودة\s*\d*/); r.is_draft = f(!!dr, dr ? ev(dr.line) : null, dr ? 0.95 : 0.6);
  const rq = find(L, /رقم الطلب\s*\|?\s*(\d{4,})/); r.request_no = rq ? f(rq.m[1]!, ev(rq.line), 0.9) : f<string>(null);
  // تاريخ العقد
  const cd = find(L, /تم في\s*\|?\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*هـ?\s*\|?\s*الموافق\s*\|?\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
  r.contract_date_hijri = cd ? f(cd.m[1]!, ev(cd.line), 0.9) : f<string>(null);
  r.contract_date = cd ? f(isoFromDmy(cd.m[2]!), ev(cd.line), 0.9) : f<string>(null);
  // المركز الرئيس والأنشطة
  const ho = find(L, new RegExp(`المركز الرئيس(?:ي)? للشركة (?:في|فى) مدينة\\s*([^\\s|،,]+(?:\\s[^\\s|،,]{1,3})?)`));
  r.head_office = ho ? f(fixCity(ho.m[1]!), ev(ho.line), 0.85) : f<string>(null);
  const actStart = find(L, /أغراض الشركة/); const acts: string[] = [];
  if (actStart) for (let i = actStart.i + 1; i < Math.min(L.length, actStart.i + 80); i++) {
    const t = L[i]!.text; if (/وتمارس الشركة أغراضها|المادة الرابعة|المادة الخامسة|مدة الشركة|رأس مال/.test(t)) break;
    if (/رقم الطلب|^الفئة|^الباب|تقوم الشركة بمزاولة/.test(t)) continue;
    const c = L[i]!.cells[0]; if (c && c.length > 4) acts.push(c.replace(/\s+/g, ' '));
  }
  r.activities = acts.length ? f(acts, actStart ? ev(actStart.line) : null, 0.7) : f<string[]>(null);
  // رأس المال
  const cap = find(L, new RegExp(`حدد ${w('رأس')} ${w('مال')} الشركة(?: المصدر)? ب\u0640?[^\\d]{0,60}?(\\d[\\d,.]*)`));
  r.capital = cap ? f(num(cap.m[1]), ev(cap.line), 0.9) : f<number>(null);
  const capCtx = cap ? L.slice(cap.i, cap.i + 3).map((x) => x.text).join(' ') : '';
  const shc = capCtx.match(/مقسم\s?(?:إلى|الى)[^\d]{0,6}(\d[\d,]*)/); r.shares_count = shc ? f(num(shc[1]), cap ? ev(cap.line) : null, 0.85) : f<number>(null);
  const shv = capCtx.match(/قيمة كل (?:حصة|منها|سهم)[^\d]{0,6}(\d[\d,.]*)/); r.share_value = shv ? f(num(shv[1]), cap ? ev(cap.line) : null, 0.85) : f<number>(null);
  const paid = find(L, /(?:قيمة المدفوع منه|دفع من قيمتها|المدفوع منه نقدا)[^\d]{0,80}?(\d[\d,.]{3,})/);
  r.paid_capital = paid ? f(num(paid.m[1]), ev(paid.line), 0.85) : f<number>(null);
  const fp = find(L, /الوفاء بقيمتها كاملة/); r.fully_paid = f(fp ? true : paid ? false : null, fp ? ev(fp.line) : paid ? ev(paid.line) : null, fp || paid ? 0.85 : 0);
  if (fp && r.capital.value != null && r.paid_capital.value == null) r.paid_capital = f(r.capital.value, ev(fp.line), 0.75);
  // الشركاء (ذات المسؤولية) وتوزيع الحصص
  const partners: Partner[] = [];
  for (const l of L) {
    const nat = l.text.match(new RegExp(`${w('شريك')} ب(رأس المال|العمل)`)); if (!nat) continue;
    const cells = l.cells; const idx = cells.findIndex((c) => /^الطرف/.test(c));
    const id = cells.find((c) => /^\d{10}$/.test(c)) ?? null;
    const name = idx > 0 ? cells[idx - 1]! : cells[cells.length - 1]!;
    partners.push({ name: cleanName(name), id_no: id, nature: nat[1] === 'العمل' ? 'work' : 'capital', shares: null, amount: null, pct: null });
  }
  const dist = find(L, /توز\s?يعها على الشركاء/);
  if (dist) for (let i = dist.i + 1; i < Math.min(L.length, dist.i + 12); i++) {
    const cells = L[i]!.cells; if (/الاجمال/.test(L[i]!.text)) break;
    const nums = cells.filter((c) => /^\d[\d,.]*$/.test(c)).map((c) => num(c)!); const name = cells.find((c) => /[ء-ي]{3}/.test(c) && !/قيمة|الحصص|اسم/.test(c));
    if (nums.length >= 3 && name) {
      const total = nums[0]!, cash = nums[3] ?? nums[nums.length - 1]!;
      const p = partners.find((x) => x.name.replace(/\s/g, '') === cleanName(name).replace(/\s/g, '')) ?? (() => { const n: Partner = { name: cleanName(name), id_no: null, nature: 'capital', shares: null, amount: null, pct: null }; partners.push(n); return n; })();
      p.amount = total; p.shares = (nums[3] ?? 0) + (nums[2] ?? 0) || cash; if (r.capital.value) p.pct = Math.round((total / r.capital.value) * 1e8) / 1e6;
    }
  }
  // مملوكة لشخص واحد
  const own = find(L, new RegExp(`مملوكة\\s?ل\\s*(شركة [^|]+?|[^|]+?)\\s*بموجب ${w('سجل')} ${w('تجار')}[يى] رقم\\s*\\|?\\s*(\\d{10})`));
  r.owner_name = own ? f(cleanName(own.m[1]!), ev(own.line), 0.9) : f<string>(null); r.owner_cr = own ? f(own.m[2]!, ev(own.line), 0.9) : f<string>(null);
  if (own && !partners.length) partners.push({ name: cleanName(own.m[1]!), id_no: own.m[2]!, nature: 'owner', shares: r.shares_count.value, amount: r.capital.value, pct: 100 });
  // المؤسسون (المساهمة) ومجلس الإدارة
  const fh = find(L, /اسم المؤسس/);
  if (fh) for (let i = fh.i + 1; i < Math.min(L.length, fh.i + 30); i++) {
    const cells = L[i]!.cells; const id = cells.find((c) => /^\d{10}$/.test(c)); if (!id) { if (partners.some((p) => p.nature === 'founder')) break; continue; }
    partners.push({ name: cleanName(cells[cells.length - 1]!), id_no: id, nature: 'founder', shares: null, amount: null, pct: null });
  }
  // دمج التكرار (نفس الاسم من جدول الأطراف وجدول الحصص)
  const merged: Partner[] = [];
  for (const p of partners) { const m = merged.find((x) => nk(x.name) === nk(p.name)); if (!m) merged.push({ ...p }); else { m.id_no ??= p.id_no; m.shares ??= p.shares; m.amount ??= p.amount; m.pct ??= p.pct; if (m.nature === 'founder' && p.nature !== 'founder') m.nature = p.nature; } }
  partners.length = 0; partners.push(...merged);
  r.partners = partners.length ? f(partners, dist ? ev(dist.line) : fh ? ev(fh.line) : own ? ev(own.line) : null, 0.75) : f<Partner[]>(null);
  const board: BoardMember[] = [];
  const bh = find(L, /^المنصب|المنصب \|/);
  if (bh) for (let i = bh.i + 1; i < Math.min(L.length, bh.i + 15); i++) { const cells = L[i]!.cells; const pos = cells.find((c) => /رئيس|عضو|أمين سر|مدير/.test(c)); const id = cells.find((c) => /^\d{10}$/.test(c)) ?? null; if (!pos) break; board.push({ position: pos, name: cleanName(cells[cells.length - 1]!), id_no: id }); }
  // السنة المالية
  const fy1 = find(L, /السنة المالية الأولى[^|]*?تنتهي في\s*\|?\s*([\d/]+)\s*هـ?\s*\|?\s*(?:الموافق)?\s*\|?\s*(\d{4}\/\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})/);
  if (fy1) { const iso = isoFromDmy(fy1.m[2]!); r.first_fy_end = f(iso, ev(fy1.line), 0.85); if (iso) { r.fy_end_month = f(Number(iso.slice(5, 7)), ev(fy1.line), 0.8); r.fy_end_day = f(Number(iso.slice(8, 10)), ev(fy1.line), 0.8); } }
  else r.first_fy_end = f<string>(null);
  const fyx = find(L, /تبدأ السنة المالية للشركة من أول شهر (\S+) وتنتهي بنهاية شهر (\S+)/);
  const MONTHS: Record<string, number> = { يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, ابريل: 4, مايو: 5, يونيو: 6, يوليو: 7, أغسطس: 8, اغسطس: 8, سبتمبر: 9, أكتوبر: 10, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12 };
  if (fyx && MONTHS[fyx.m[2]!]) { const m = MONTHS[fyx.m[2]!]!; r.fy_end_month = f(m, ev(fyx.line), 0.9); r.fy_end_day = f(new Date(Date.UTC(2001, m, 0)).getUTCDate(), ev(fyx.line), 0.9); }
  r.fy_end_month ??= f<number>(null); r.fy_end_day ??= f<number>(null);
  // السجل التجاري (نص فُك ترميزه بلا عناوين): القيم بترتيب النموذج
  r.unified_no = f<string>(null); r.cr_no = f<string>(null); r.cr_issue_hijri = f<string>(null); r.cr_expiry_hijri = f<string>(null); r.cr_expiry = f<string>(null); r.city = f<string>(null);
  if (isCr) {
    const ten = L.flatMap((l) => (l.text.match(/(?<!\d)\d{10}(?!\d)/g) ?? []).map((n) => ({ n, l })));
    const u = ten.find((x) => x.n.startsWith('7')); if (u) r.unified_no = f(u.n, ev(u.l), 0.85);
    const c = ten.find((x) => !x.n.startsWith('7') && /^[1-5]/.test(x.n)); if (c) r.cr_no = f(c.n, ev(c.l), 0.7);
    const hd = L.flatMap((l) => (l.text.match(/\d{4}\/\d{2}\/\d{2}\s*ه/g) ?? []).map((d) => ({ d: d.replace(/\s*ه$/, ''), l })));
    if (hd.length) { r.cr_issue_hijri = f(hd[0]!.d, ev(hd[0]!.l), 0.7); const mx = [...hd].sort((a, b) => b.d.localeCompare(a.d))[0]!; r.cr_expiry_hijri = f(mx.d, ev(mx.l), 0.7); r.cr_expiry = f(hijriToIso(mx.d), ev(mx.l), 0.7); }
    const capL = find(L, new RegExp(`\\d[\\d,]*\\s*${w('ريال')}`));
    if (capL && r.capital.value == null) {
      const toks = [...capL.line.text.matchAll(new RegExp(`(\\d[\\d,]*)(\\s*${w('ريال')})?`, 'g'))].map((m) => ({ v: num(m[1])!, riyal: !!m[2] }));
      const money = toks.filter((t) => t.riyal); const plain = toks.filter((t) => !t.riyal);
      if (money[0]) r.capital = f(money[0].v, ev(capL.line), 0.75); if (money[1] && money.length >= 3) r.paid_capital = f(money[1].v, ev(capL.line), 0.75);
      if (plain[0]) r.shares_count = f(plain[0].v, ev(capL.line), 0.7); if (money.length >= 2) r.share_value = f(money[money.length - 1]!.v, ev(capL.line), 0.7);
      if (r.paid_capital.value != null && r.capital.value != null) r.fully_paid = f(r.paid_capital.value >= r.capital.value, ev(capL.line), 0.7);
    }
    // سطر الإدارة: «الاسم - المنصب الاسم - المنصب ...» : نقسم على « - » ثم نفصل المنصب في بداية كل مقطع عن الاسم التالي
    const POS = /^((?:نائب )?رئيس مجلس (?:ال)?[إا]?دارة|عضو ?مجلس (?:ال)?[إا]?دارة|أمين سر المجلس|المدير العام|مدير(?: الشركة)?)\s*(.*)$/;
    for (const l of L) { if (!/ - (?:نائب |رئيس|عضو|أمين|مدير)/.test(l.text)) continue; const seg = l.text.replace(/\|/g, ' ').split(/\s+-\s+/); let name = seg[0]!.trim();
      for (let k = 1; k < seg.length; k++) { const m = seg[k]!.trim().match(POS); if (!m) { name = seg[k]!.trim(); continue; } board.push({ name: cleanName(name), position: m[1]!.replace('عضومجلس', 'عضو مجلس'), id_no: null }); name = m[2]!.trim(); } }
    const ct = find(L, new RegExp(`^(${CITIES.join('|')})\\b`)); if (ct) r.city = f(ct.m[1]!, ev(ct.line), 0.6);
    if (!r.company_name.value) { const n = find(L, /^شركة [^|]{2,60}$/); if (n) r.company_name = f(cleanName(n.m[0]), ev(n.line), 0.8); }
  }
  r.board = board.length ? f(board, null, 0.75) : f<BoardMember[]>(null);
  return r;
}

/** تحويل تاريخ هجري (أم القرى) yyyy/mm/dd إلى ميلادي ISO بالبحث عبر Intl (دقيق ضمن تقويم أم القرى) */
export function hijriToIso(h: string): string | null {
  const m = h.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/); if (!m) return null; const [Y, M, Dd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  const parts = (d: Date) => { const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value])); return [Number(String(p.year).replace(/\D/g, '')), Number(p.month), Number(p.day)]; };
  let t = Date.UTC(Math.round(Y * 0.97 + 622), 0, 1);
  for (let k = 0; k < 4000; k++) { const [y, mo, d] = parts(new Date(t)); const diff = (Y - y!) * 354 + (M - mo!) * 29.5 + (Dd - d!); if (Math.abs(diff) < 0.5) return new Date(t).toISOString().slice(0, 10); t += Math.max(1, Math.round(Math.abs(diff))) * 86400000 * Math.sign(diff); }
  return null;
}
