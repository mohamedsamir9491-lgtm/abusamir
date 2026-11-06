import json, sys, re
sys.path.insert(0, '/tmp/claude-0/-workspace/3f0c9cdb-eb6b-5493-bc6e-a6b73e9bf13f/scratchpad/rules')
from overrides import V
from collections import Counter, OrderedDict
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
D = '/tmp/claude-0/-workspace/3f0c9cdb-eb6b-5493-bc6e-a6b73e9bf13f/scratchpad/rules/'
L = json.load(open(D + 'linked.json'))
SUSPECT = {
 'cls-cogs-purchases': 'المشتريات تُعامل تكلفة مبيعات دون أثر تغير المخزون (IAS 2)',
 'cls-deferred-revenue': 'الإيراد المؤجل دائمًا متداول دون النظر للاستحقاق (IAS 1 ف69)',
 'cls-related-party': 'أرصدة الأطراف ذات العلاقة دائمًا متداولة (IAS 1 ف66/69)',
 'cls-eosb': 'مكافأة نهاية الخدمة كاملة غير متداولة (IAS 1 / IAS 19)',
 'cls-investments': 'كل الاستثمارات والصكوك غير متداولة (IAS 1 ف66)',
 'fs-unclassified-in-assets': 'الأرصدة غير المصنفة والمعلقة تُضاف لإجمالي الأصول (IAS 1)',
 'fs-cf-financing': 'حركة الأرباح المبقاة المباشرة وتوزيعات معلنة غير مدفوعة تُعامل نقدًا في التمويل (IAS 7 ف31–35)',
 'cons-nci-proportionate': 'نسبة الأرباح المختلفة عن الملكية لا تُستخدم، ولا تُقاس الشهرة (IFRS 10 / IFRS 3)',
 'ws-pre-acquisition': 'احتياطيات ما قبل الاقتناء قد تُستبعد بأكثر من رصيد الاستثمار (IFRS 3 / IFRS 10)',
 'ws-claim-nature-default': 'جاري الأم لدى التابعة يُعامل افتراضيًا اكتتابًا غير مسدد',
 'val-owner-valuation': '«تقييم المالك» بلا مقيّم معتمد ولا تطبيق على فئة الأصل كاملة (IAS 16 ف36 / نظام المقيمين المعتمدين)',
 'val-equal-holders-default': 'افتراض التساوي بين الشركاء عند غياب السجل',
 'kb-ias19': 'السماح بتقدير نظام العمل للمنشآت الصغيرة ممارسة أهمية نسبية وليس نص IAS 19',
 'kb-capital': 'عرض رأس المال غير المدفوع أصلًا؛ الشائع خصمه من حقوق الملكية',
 'off-doc002-unpaid-capital': '«يُعرض رأس المال غير المدفوع مخصومًا من حقوق الملكية» يحتاج سندًا',
 'off-control-since-contract': 'تاريخ السيطرة = تاريخ عقد التابعة؛ خطأ للتابعات المقتناة لاحقًا (IFRS 10 / IFRS 3)',
 'fin-earned-revenue': 'الإيراد المكتسب = الأتعاب × مراحل العمل الست، وليس قياس IFRS 15',
 'fin-aging-buckets': 'مطالبة بلا تاريخ استحقاق لا تتقادم أبدًا',
 'off-zakat-vat-not-parsed': 'شهادتا الزكاة والضريبة لا تُفحص صلاحيتهما ولا يُطابق الرقم الضريبي',
 'rpt-intro-not-audit-opinion': 'تقرير ارتباط «تأكيد/مراجعة» يقول إنه لا يمثل رأي مراجع (تعارض)',
}
def stdmatch(r, c):
  s = r.get('std')
  if not s: return False
  t = c.get('title') or ''; ref = c.get('ref') or ''
  return ref.startswith(s) or f'({s})' in t or t.startswith(s)
ABSENT = ('IVS', 'ISQM')
TITLES = json.load(open(D + 'std_titles.json'))
def std_title(sd):
  hits = [t for t in TITLES if t.startswith(sd + ' ') or f'({sd})' in t]
  pref = [t for t in hits if 'المعتمد في المملكة' in t or t.startswith('معيار')] or hits
  return min(pref, key=len) if pref else None
STATUS = OrderedDict([
 ('fixed', '✔️ صُحّحت واختُبرت'), ('fix', '⚠️ تحتاج تصحيح (تحقّقتُ منها)'), ('bug', '🐞 خلل برمجي (تحقّقتُ منه)'), ('link', '🔗 القيمة صحيحة وتحتاج ربطًا بجدول النسب'),
 ('decide', '🟡 تحتاج قرارك'), ('ok', '✅ موثّقة بنص (تحقّقتُ منها)'), ('pinned', '📌 مرتبطة بفقرة محددة (مطابقة آلية بالكلمات — للمراجعة)'), ('cand', '🔎 المعيار محدد والفقرة لم تُحدد بعد'),
 ('suspect', '❓ ملاحظة مراجِع آلي — لم أتحقق منها بعد'), ('practice', '📝 اجتهاد مهني بلا نص — يحتاج اعتماد المكتب'),
 ('absent', '📚 المعيار غير موجود في المكتبة'), ('none', '❔ لم يُعثر على سند بعد'), ('tech', '⚙️ تقني — لا يحتاج سندًا')])
PINS = json.load(open(D + 'pins.json', encoding='utf-8'))
BASIS = json.load(open('/tmp/claude-0/-workspace/3f0c9cdb-eb6b-5493-bc6e-a6b73e9bf13f/scratchpad/basis/basis_final.json', encoding='utf-8'))
rows = []
for r in L:
  src = ''; snip = ''; note = ''; prio = ''
  if r['id'] in V:
    st, src, note, prio = V[r['id']]
  elif r['kind'] == 'تقني' or (r['id'].startswith('off-') and not r['id'].startswith('off-doc') and r['kind'] == 'نظام الشركات'):
    st = 'tech'
  elif r['id'] in SUSPECT:
    st = 'suspect'; note = SUSPECT[r['id']]
  else:
    m = next((c for c in r['cands'] if stdmatch(r, c)), None)
    if r['kind'] == 'ممارسة مهنية/اجتهاد' and not m: st = 'practice'
    elif m:
      st = 'cand'; t0 = std_title(r['std']) or (m.get('title') or ''); src = t0[:110]
      if (m.get('title') or '') == t0 and m.get('ref'): src += f" — {(m.get('heading') or m.get('ref') or '')} (صفحة مرشحة)"; snip = re.sub(r'\s+', ' ', m.get('snip') or '')[:350]
    elif r.get('std') and r['std'].startswith(ABSENT): st = 'absent'; src = r['std']
    elif r.get('std') and std_title(r['std']): st = 'cand'; src = std_title(r['std'])[:110]
    elif r['kind'] == 'ممارسة مهنية/اجتهاد': st = 'practice'
    else: st = 'none'
  pin = PINS.get(r['id'])
  if st == 'cand' and pin:
    if pin['score'] >= 2: st = 'pinned'; src = f"{pin['ref']} — {pin['source'][:70]}"; snip = pin['quote'][:350]
    else: note = (note + ' ' if note else '') + f"فقرة مقترحة (مطابقة ضعيفة): {pin['ref']}"
  rows.append({**r, 'st': st, 'src': src, 'snip': snip, 'note': note, 'prio': prio})
json.dump(rows, open(D + 'register.json', 'w'), ensure_ascii=False, indent=1)
cnt = Counter(x['st'] for x in rows)
print(cnt, len(rows))

wb = Workbook(); NAVY = '1F2A44'; GOLD = 'B8962E'
hdr = Font(bold=True, color='FFFFFF', name='Arial'); hfill = PatternFill('solid', fgColor=NAVY)
thin = Side(style='thin', color='CCCCCC'); B = Border(top=thin, bottom=thin, left=thin, right=thin)
wrap = Alignment(wrap_text=True, vertical='top', horizontal='right', readingOrder=2)
FILL = {'pinned': 'E6EEFA', 'fixed': 'D9F2E3', 'fix': 'FDE2E1', 'bug': 'FDE2E1', 'link': 'FFF4D6', 'decide': 'FFF4D6', 'ok': 'E3F4E8', 'cand': 'EEF3FB', 'suspect': 'F3E8FF', 'practice': 'FFF9EB', 'absent': 'F1F1F1', 'none': 'F1F1F1', 'tech': 'FFFFFF'}
def sheet(ws, cols, data, widths):
  ws.sheet_view.rightToLeft = True
  for i, c in enumerate(cols, 1):
    x = ws.cell(row=1, column=i, value=c); x.font = hdr; x.fill = hfill; x.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True); x.border = B
  for ri, (vals, st) in enumerate(data, 2):
    for ci, v in enumerate(vals, 1):
      x = ws.cell(row=ri, column=ci, value=v); x.alignment = wrap; x.border = B; x.font = Font(name='Arial', size=10)
      if st: x.fill = PatternFill('solid', fgColor=FILL[st])
  for i, w in enumerate(widths, 1): ws.column_dimensions[get_column_letter(i)].width = w
  ws.freeze_panes = 'A2'; ws.auto_filter.ref = ws.dimensions; ws.row_dimensions[1].height = 30

ws = wb.active; ws.title = 'الملخص'; ws.sheet_view.rightToLeft = True
ws['A1'] = 'سجل القواعد'; ws['A1'].font = Font(bold=True, size=14, color=NAVY, name='Arial')
ws['A2'] = f'كل قاعدة يطبقها البرنامج مع موضعها في الكود والسند الرسمي من المكتبة النظامية. عدد القواعد: {len(rows)}'
ws['A2'].alignment = Alignment(wrap_text=True, horizontal='right', readingOrder=2); ws.merge_cells('A2:D2'); ws.row_dimensions[2].height = 32
r0 = 4
for i, c in enumerate(['الحالة', 'العدد', 'المعنى'], 1):
  x = ws.cell(row=r0, column=i, value=c); x.font = hdr; x.fill = hfill; x.border = B; x.alignment = Alignment(horizontal='center')
MEAN = {'pinned': 'رُبطت بفقرة من النص الكامل للمعيار بمطابقة كلمات القاعدة مع موضوع الفقرة، مع مقتطف النص', 'fixed': 'خطأ مؤكد صُحّح في البرنامج وله اختبار آلي', 'fix': 'خطأ مؤكد في المعالجة أو الصياغة مقارنة بالنص؛ الإصلاح مقترح', 'bug': 'خلل في البرنامج نفسه', 'link': 'رقم صحيح مكتوب ثابتًا في الكود', 'decide': 'قيمة أو سياسة لا يحددها نص؛ القرار لك', 'ok': 'طابقتُ القاعدة مع نص المادة/المعيار', 'cand': 'وُجد المعيار والصفحة المرشحة آليًا؛ المطابقة الدقيقة في المرحلة التالية', 'suspect': 'شك من المراجعة الآلية للكود، أتحقق منه قبل أي تعديل', 'practice': 'حدود وعتبات من اجتهاد البرنامج (مثل 10% و120 يومًا)', 'absent': 'المعيار غير متوفر في ملفات المكتبة (IVS للتقييم، ISQM 1 لإدارة الجودة)', 'none': 'لم يظهر سند في البحث الآلي', 'tech': 'إجراء تقني (حفظ، ترقيم، قراءة ملفات)'}
for i, (k, lab) in enumerate(STATUS.items(), r0 + 1):
  for ci, v in enumerate([lab, cnt.get(k, 0), MEAN[k]], 1):
    x = ws.cell(row=i, column=ci, value=v); x.border = B; x.fill = PatternFill('solid', fgColor=FILL[k]); x.alignment = wrap
ws.cell(row=r0 + len(STATUS) + 1, column=1, value='الإجمالي').font = Font(bold=True); ws.cell(row=r0 + len(STATUS) + 1, column=2, value=len(rows)).font = Font(bold=True)
ar = Counter(x['area'] for x in rows); rr = r0 + len(STATUS) + 3
for i, c in enumerate(['المجال', 'عدد القواعد'], 1):
  x = ws.cell(row=rr, column=i, value=c); x.font = hdr; x.fill = hfill; x.border = B
for i, (k, v) in enumerate(ar.most_common(), rr + 1):
  ws.cell(row=i, column=1, value=k).border = B; ws.cell(row=i, column=2, value=v).border = B
for c, w in zip('ABCD', [42, 10, 70, 10]): ws.column_dimensions[c].width = w

order = {k: i for i, k in enumerate(STATUS)}
P = {'عالية': 0, 'متوسطة': 1, 'منخفضة': 2, '': 3}
dec = sorted([x for x in rows if x['st'] in ('fixed', 'fix', 'bug', 'link', 'decide')], key=lambda x: (order[x['st']] != 0, P[x['prio']], order[x['st']]))
sheet(wb.create_sheet('التصحيحات والقرارات'), ['#', 'الأولوية', 'الحالة', 'المجال', 'القاعدة الحالية في البرنامج', 'السند الرسمي', 'المشكلة والإصلاح المقترح', 'الموضع في البرنامج'],
      [([i, x['prio'], STATUS[x['st']], x['area'], x['rule_ar'], x['src'], x['note'], x['file']], x['st']) for i, x in enumerate(dec, 1)], [5, 9, 22, 13, 48, 42, 60, 30])
oks = [x for x in rows if x['st'] == 'ok']
sheet(wb.create_sheet('موثّقة'), ['#', 'المجال', 'القاعدة', 'السند الرسمي', 'ملاحظة', 'الموضع'], [([i, x['area'], x['rule_ar'], x['src'], x['note'], x['file']], 'ok') for i, x in enumerate(oks, 1)], [5, 13, 55, 55, 40, 30])
sus = [x for x in rows if x['st'] == 'suspect']
sheet(wb.create_sheet('للتحقق'), ['#', 'المجال', 'القاعدة الحالية', 'سبب الشك', 'الموضع'], [([i, x['area'], x['rule_ar'], x['note'], x['file']], 'suspect') for i, x in enumerate(sus, 1)], [5, 13, 60, 55, 30])
brow = []
for code, b in sorted(BASIS.items()):
  if b['kind'] == 'حسابي': brow.append(([code, 'فحص حسابي', '—', b.get('note', ''), '', ''], 'tech')); continue
  for it in b['items']: brow.append(([code, it['source'][:80], it['ref'], it.get('quote', '')[:400], 'إنجليزي (النص الكامل)' if it.get('lang') == 'en' else 'عربي', b.get('threshold', '')], 'ok'))
sheet(wb.create_sheet('أساس الملاحظات'), ['رمز الملاحظة', 'المصدر', 'المادة / الفقرة', 'نص المصدر (مقتطف)', 'لغة النص', 'العتبة'], brow, [12, 45, 22, 80, 14, 40])
full = sorted(rows, key=lambda x: (order[x['st']], x['area']))
sheet(wb.create_sheet('السجل الكامل'), ['#', 'المجال', 'الحالة', 'القاعدة', 'القيم المستخدمة', 'النوع', 'السند (من المكتبة)', 'مقتطف من النص', 'ملاحظة', 'قابلة للتعديل', 'الموضع في البرنامج'],
      [([i, x['area'], STATUS[x['st']], x['rule_ar'], x['params'], x['kind'], x['src'] or (x.get('code_cites') or ''), x['snip'], x['note'], 'نعم' if x.get('user_editable') else 'لا', x['file']], x['st']) for i, x in enumerate(full, 1)],
      [5, 13, 24, 50, 32, 14, 40, 50, 35, 9, 30])
out = '/workspace/سجل-القواعد.xlsx'
wb.save(out); print(out)
