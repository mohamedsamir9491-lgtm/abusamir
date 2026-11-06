"""تقسيم نصوص الأنظمة إلى مواد (أو مقاطع صفحات للأدلة) وبناء ملف المكتبة النظامية
python3 structure.py text/ manifests... out.json.gz"""
import json, os, re, sys, gzip, hashlib, collections, datetime

def norm(s):
    s = re.sub('[ً-ْـ]', '', s)
    s = re.sub('[أإآٱ]', 'ا', s).replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي')
    return s.translate(str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'))

UNITS = {'اولي': 1, 'اول': 1, 'حاديه': 1, 'حادي': 1, 'ثانيه': 2, 'ثاني': 2, 'ثالثه': 3, 'ثالث': 3, 'رابعه': 4, 'رابع': 4, 'خامسه': 5, 'خامس': 5,
         'سادسه': 6, 'سادس': 6, 'سابعه': 7, 'سابع': 7, 'ثامنه': 8, 'ثامن': 8, 'تاسعه': 9, 'تاسع': 9, 'عاشره': 10, 'عاشر': 10}
TENS = {'عشرون': 20, 'عشرين': 20, 'ثلاثون': 30, 'ثلاثين': 30, 'اربعون': 40, 'اربعين': 40, 'خمسون': 50, 'خمسين': 50, 'ستون': 60, 'ستين': 60,
        'سبعون': 70, 'سبعين': 70, 'ثمانون': 80, 'ثمانين': 80, 'تسعون': 90, 'تسعين': 90}

def ordinal(words):
    """يحوّل «الحادية والعشرون» / «الخامسة» / «(5)» إلى رقم"""
    w = norm(words)
    m = re.search(r'\d+', w)
    if m:
        return int(m.group())
    toks = [fix_ord(re.sub(r'^(و?ال)', '', t)) for t in re.split(r'[\s\-]+', w) if t]
    n = 0; unit = 0; hundred = 0
    for i, t in enumerate(toks):
        if t in ('مائه', 'مئه', 'مايه'):
            hundred = max(hundred, 100)
        elif t in ('مايتان', 'مايتين', 'ماءتين', 'ماءتان', 'مئتين', 'مئتان'):
            hundred = 200  # «المائتان» / «الأولى بعد المائتين»
        elif t in TENS:
            n += TENS[t]
        elif t in ('عشر', 'عشره') and unit:
            n += 10
        elif t in UNITS and not unit:
            unit = UNITS[t]
        elif t in ('بعد',):
            continue
        else:
            if i == 0:
                return None
            break
    total = hundred + n + unit
    return total or None

def fix_ord(t):
    """تصحيح كلمة ترتيبية قرأها OCR خطأً: ت↔ث (الثالتة، التالث، الثامنه→)"""
    if t in ORD_WORDS: return t
    for v in (t.replace('ت', 'ث'), t.replace('ث', 'ت')):
        if v in ORD_WORDS: return v
    return t

def join_split(toks):
    """«الثلا ثون» ← «الثلاثون»: يدمج كلمتين متجاورتين إذا كان دمجهما عددًا ترتيبيًا"""
    out = []; i = 0
    while i < len(toks):
        if i + 1 < len(toks):
            j = re.sub(r'^(و?ال)', '', norm(toks[i] + toks[i + 1]).strip(':،.-–()'))
            if fix_ord(j) in ORD_WORDS and re.sub(r'^(و?ال)', '', norm(toks[i]).strip(':،.')) not in ORD_WORDS:
                out.append(toks[i] + toks[i + 1]); i += 2; continue
        out.append(toks[i]); i += 1
    return out

def fix_display(numtxt):
    """اسم المادة للعرض بعد تصحيح أخطاء القراءة الضوئية: «الثالتة» ← «الثالثة»، «التامنة» ← «الثامنة»"""
    out = []
    for t in numtxt.split():
        pre = re.match(r'^(و?ال)?', t).group(0); core = t[len(pre):]
        b = norm(core).strip(':،.')
        if b not in ORD_WORDS:
            for v in (core.replace('ت', 'ث'), core.replace('ث', 'ت')):
                if norm(v).strip(':،.') in ORD_WORDS: core = v; break
        out.append(pre + core)
    return ' '.join(out)

HEAD = re.compile(r'^\s*[\(\[]?\s*(?:ال)?ماد[ةه]\s*[:\-–]?\s*(.*)$')
ORD_WORDS = set(UNITS) | set(TENS) | {'عشر', 'عشره', 'مائه', 'مئه', 'مايه', 'بعد', 'مايتان', 'مايتين', 'ماءتين', 'ماءتان', 'مئتين', 'مئتان'}

def parse_head(line):
    """يعيد (الرقم، نص الرقم، العنوان) إن كان السطر عنوان مادة"""
    m = HEAD.match(line)
    if not m: return None
    rest = m.group(1).strip()
    d = re.match(r'^[\(\[]?\s*([\d٠-٩]+)\s*[\)\]]?\s*[:\-–.]?\s*(.*)$', rest)
    if d:
        return int(norm(d.group(1))), d.group(1), d.group(2).strip(' :-–')
    toks = join_split(rest.split()); used = []
    for t in toks:
        b = fix_ord(re.sub(r'^(و?ال)', '', norm(t).strip(':،.-–()')))
        if b in ORD_WORDS or (used and norm(t).startswith('و') and fix_ord(re.sub(r'^و?ال', '', norm(t).strip(':،.'))) in ORD_WORDS):
            used.append(t)
            if t.endswith(':'): break
        else:
            break
    if not used: return None
    num = ordinal(' '.join(x.strip(':') for x in used))
    if not num: return None
    head = ' '.join(toks[len(used):]).strip(' :-–')
    return num, ' '.join(used).strip(':'), head

def split_articles(pages):
    """يعيد قائمة مواد [{num, ref, heading, text, p1, p2}] بقبول العناوين المتسلسلة فقط"""
    arts = []; cur = None; last = 0; pre = []
    for pi, page in enumerate(pages, start=1):
        for line, mid in [(x, k > 0) for ln in page.split('\n') for k, x in enumerate(re.split(r'(?<=\S)\s+(?=(?:ال)?ماد[ةه]\s+[^\s:()]+(?:\s+[^\s:()]+){0,4}\s*:)', ln))]:
            raw = line.strip()
            if not raw:
                if cur: cur['lines'].append('')
                continue
            ph = parse_head(raw) if len(raw) < 160 else None
            ok = False
            if ph:
                num, numtxt, head = ph
                titled = ':' in raw[:60] or bool(head)
                ok = (last == 0 and num <= 3) or (last < num <= last + 3) or (last < num <= last + 25 and titled and ':' in raw[:70]) or (num == 1 and last >= 3)
                if mid and num not in (last + 1, last + 2): ok = False
            if ok:
                if cur: arts.append(cur)
                cur = {'num': num, 'ref': 'المادة ' + fix_display(numtxt), 'heading': head, 'lines': [], 'p1': pi, 'p2': pi}
                last = num
            else:
                if cur:
                    cur['lines'].append(raw); cur['p2'] = pi
                else:
                    pre.append((pi, raw))
    if cur: arts.append(cur)
    for a in arts:
        a['text'] = re.sub(r'\n{3,}', '\n\n', '\n'.join(a.pop('lines'))).strip()
    # تقسيم إلى دفعات عند كل عودة للمادة الأولى؛ الدفعة ذات النصوص القصيرة جدًا فهرس محتويات تُحذف
    runs = []; run = []
    for a in arts:
        if run and a['num'] <= 2 and run[-1]['num'] >= 3:
            runs.append(run); run = []
        run.append(a)
    if run: runs.append(run)
    keep = [r for r in runs if sum(len(a['text']) for a in r) / len(r) >= 120] or runs
    arts = [a for r in keep for a in r]
    return arts, pre

def page_chunks(pages, size=1800):
    out = []; buf = ''; p1 = 1
    for pi, page in enumerate(pages, start=1):
        for para in re.split(r'\n\s*\n', page):
            para = re.sub(r'\s*\n\s*', ' ', para).strip()
            if not para: continue
            if len(buf) + len(para) > size and buf:
                out.append({'p1': p1, 'p2': pi, 'text': buf.strip()}); buf = ''; p1 = pi
            if not buf: p1 = pi
            buf += para + '\n'
    if buf.strip(): out.append({'p1': p1, 'p2': len(pages), 'text': buf.strip()})
    return out

def strip_boiler(pages):
    """يحذف أرقام الصفحات والترويسة/التذييل المتكرر"""
    cnt = collections.Counter()
    for p in pages:
        for l in set(x.strip() for x in p.split('\n') if x.strip()):
            cnt[l] += 1
    rep = {l for l, c in cnt.items() if len(pages) >= 4 and c >= max(3, len(pages) * 0.5) and len(l) < 120}
    out = []
    for p in pages:
        lines = [l for l in p.split('\n') if l.strip() not in rep and not re.fullmatch(r'\s*[\-–]?\s*[\d٠-٩]{1,4}\s*[\-–]?\s*', l)]
        out.append('\n'.join(lines))
    return out

AR_WORD = re.compile(r'^[ء-ْـ٠-٩ٱ-ۓ]{2,}[.,،:؛)(]*$')
def noisy(line, lang='ar'):
    """سطر ضجيج من القراءة الضوئية (حروف لاتينية قصيرة مبعثرة، رموز) في وثيقة عربية"""
    toks = [t.strip('()[]{}.,،:;؛-–_|"\'«»') for t in line.split()]
    toks = [t for t in toks if t]
    if not toks or lang != 'ar': return False
    good = sum(1 for t in toks if AR_WORD.match(t) or re.fullmatch(r'[\d٠-٩.,%/]+', t) or (re.fullmatch(r'[A-Za-z]{4,}', t)))
    bad = sum(1 for t in toks if re.fullmatch(r'[A-Za-z~_=|\\/<>^`]{1,3}', t) or re.search(r'[~_=|\\<>^`]', t))
    return bad >= 2 and bad >= len(toks) * 0.15 or good < len(toks) * 0.5

def clean_heading(h):
    h = re.sub(r'[\s\(\):]*\d{1,3}[\s\(\):]*$', '', h.strip()).strip(' :()')  # أرقام الحواشي أو الصفحات الملتصقة
    h = re.sub(r'\)\s*:\s*\(\d+$|\)?\d+\)$', '', h).strip(' :()')
    if not h: return ''
    if noisy(h) or len(h) > 90 or re.search(r'[~_=|<>^`]|(?:^|\s)[A-Za-z]{1,3}(?:\s|$)|^[\d\s().]+', h): return ''
    return h

def clean_body(text, lang='ar'):
    out = [l for l in text.split('\n') if not l.strip() or not noisy(l, lang)]
    return re.sub(r'\n{3,}', '\n\n', '\n'.join(out)).strip()

def doc_type(title, cat):
    t = title + ' ' + cat
    if re.search(r'مدونة|الدفوع المثارة', t): return 'ruling'  # مبادئ وقرارات اللجان الزكوية والضريبية والجمركية
    if 'قواعد عمل اللجان' in t and 'دليل' not in t: return 'rules'
    if 'دليل' in t or 'أدلة' in cat: return 'guide'
    if re.search(r'اتفاقي', t): return 'agreement'
    if re.search(r'لائحة|اللائحة', t): return 'regulation'
    if re.search(r'نظام', t): return 'law'
    if re.search(r'قرار|تعميم|مرسوم|أمر ملكي', t): return 'decision'
    if re.search(r'قواعد|ضوابط|معايير|إجراءات|الآليات', t): return 'rules'
    return 'other'

AR_STD = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ifrs_ar.json'), encoding='utf-8')) if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ifrs_ar.json')) else {}
def std_code(name):
    """IFRS_16__… / IAS_02_AR__… / 44-IFRIC-1-2026 / SIC_07 → رمز المعيار"""
    m = re.search(r'(?<![A-Za-z])(IFRS|IAS|IFRIC|SIC)[_\-]0*(\d{1,2})(?!\d)', name) or re.search(r'(?<![A-Za-z])(IFRS|IAS|IFRIC|SIC) 0*(\d{1,2})(?!\d)', name)
    if not m:
        m2 = re.search(r'(?<!\d)(\d{1,2})\s+(IFRS|IAS|IFRIC|SIC)\b', name)
        if m2: k = m2.group(2); return f'SIC-{m2.group(1)}' if k == 'SIC' else f'{k} {m2.group(1)}'
        return 'Conceptual Framework' if re.search(r'Framework|إطار مفاهيم', name) and not re.search(r'Audit|Assurance|المراجعة|التأكيد', name) else None
    k = m.group(1).upper(); return f'SIC-{m.group(2)}' if k == 'SIC' else f'{k} {m.group(2)}'

# ملفات Drive: عناوين واضحة لملفات بأسماء رقمية، ونُسخ مكررة تُستبعد (يبقى الأصل الأحدث أو المقسّم)
DRIVE_TITLE = {
    '9.pdf': 'تحديثات الميثاق الدولي لسلوك وآداب المهنة: استخدام عمل الخبير الخارجي (IESBA يناير 2025)',
    '000573.pdf': 'تعميم الهيئة: قائمة الخدمات الجائز تقديمها لعميل المراجعة في الوقت ذاته (المحدثة)',
    '00_وثيقة اعتماد الميثاق الدولي لسلوك وآداب المهنة.pdf': 'وثيقة اعتماد الميثاق الدولي لسلوك وآداب المهنة للتطبيق في المملكة',
    'salwk-1-2026.pdf': 'الميثاق الدولي لسلوك وآداب المهنة للمحاسبين المهنيين (بما في ذلك معايير الاستقلال) المعتمد في المملكة — طبعة 2025',
    '8.pdf': 'تحديثات الميثاق الدولي: معايير السلوك والاستقلال لتأكيد معلومات الاستدامة (IESBA يناير 2025)',
    '7.pdf': 'تحديثات الميثاق الدولي: التخطيط الضريبي والخدمات ذات العلاقة (IESBA)',
    'وثيقة اعتماد معايير المحاسبة للتطبيق في المملكة.pdf': 'وثيقة اعتماد المعايير الدولية للتقرير المالي والمعيار الدولي للمنشآت الصغيرة والمتوسطة للتطبيق في المملكة',
    '21.pdf': 'IAS 21 تعديلات: الترجمة إلى عملة عرض تعاني من التضخم الجامح — المعتمد في المملكة',
    'Amendments-to-IAS-28-Investments-in-Associates-and-Joint-Ventures.pdf': 'IAS 28 تعديلات على معيار الاستثمارات في المنشآت الزميلة والمشروعات المشتركة — المعتمد في المملكة',
    'Amendments-to-IFRS-9-and-IFRS-7.pdf': 'IFRS 9 و IFRS 7 تعديلات: العقود المرتبطة بالكهرباء المعتمدة على الطبيعة — المعتمد في المملكة',
    '19.pdf': 'IFRS 19 المنشآت التابعة التي لا تخضع للمساءلة العامة: الإفصاحات — المعتمد في المملكة',
}
DRIVE_SKIP = {
    'Adaption-salwk-2025.pdf',  # نسخة أخرى من وثيقة اعتماد الميثاق
    'acc2026.pdf',  # الكتاب المجمّع؛ المعايير نفسها موجودة ملفًا لكل معيار
    'IFRS-for-SMEs-2019.pdf',  # الكتاب المجمّع؛ الأقسام نفسها موجودة ملفًا لكل قسم
    '20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_ vTrack.pdf',  # نسخة بتتبع التعديلات من النسخة النهائية vF
}
# أسماء معايير المراجعة كما وردت في الصفحة الأولى من ملفات الهيئة (بعد تصحيح أخطاء القراءة الضوئية)
ISA_AR = {'200': 'الأهداف العامة للمراجع المستقل والقيام بالمراجعة وفقًا للمعايير الدولية للمراجعة', '210': 'الاتفاق على شروط ارتباطات المراجعة', '220': 'إدارة الجودة لمراجعة القوائم المالية',
  '230': 'توثيق أعمال المراجعة', '240': 'مسؤوليات المراجع ذات العلاقة بالغش عند مراجعة القوائم المالية', '250': 'مراعاة الأنظمة واللوائح عند مراجعة القوائم المالية', '260': 'الاتصال بالمكلفين بالحوكمة',
  '265': 'إبلاغ أوجه القصور في الرقابة الداخلية للمكلفين بالحوكمة والإدارة', '300': 'التخطيط لمراجعة القوائم المالية', '315': 'التعرف على مخاطر التحريف الجوهري وتقييمها',
  '320': 'الأهمية النسبية عند تخطيط وتنفيذ المراجعة', '330': 'استجابات المراجع للمخاطر المقيّمة', '402': 'اعتبارات المراجعة ذات العلاقة بمنشأة تستخدم منشأة خدمية', '450': 'تقويم التحريفات المكتشفة خلال المراجعة',
  '500': 'أدلة المراجعة', '501': 'أدلة المراجعة: اعتبارات محددة لبنود مختارة', '505': 'المصادقات الخارجية', '510': 'ارتباطات المراجعة لأول مرة: الأرصدة الافتتاحية', '520': 'الإجراءات التحليلية',
  '530': 'العينات في المراجعة', '540': 'مراجعة التقديرات المحاسبية وما يتعلق بها من إفصاحات', '550': 'الأطراف ذات العلاقة', '560': 'الأحداث اللاحقة', '570': 'الاستمرارية', '580': 'الإفادات المكتوبة',
  '600': 'اعتبارات خاصة: عمليات مراجعة القوائم المالية للمجموعات (بما في ذلك عمل مراجعي المكونات)', '610': 'استخدام عمل المراجعين الداخليين', '620': 'استخدام عمل خبير استعان به المراجع',
  '700': 'تكوين الرأي والتقرير عن القوائم المالية', '701': 'الإبلاغ عن الأمور الرئيسة للمراجعة في تقرير المراجع المستقل', '705': 'التعديلات على الرأي في تقرير المراجع المستقل',
  '706': 'فقرات لفت الانتباه وفقرات أمور أخرى في تقرير المراجع المستقل', '710': 'المعلومات المقارنة: الأرقام المقابلة والقوائم المالية المقارنة', '720': 'مسؤوليات المراجع ذات العلاقة بالمعلومات الأخرى',
  '800': 'اعتبارات خاصة: مراجعة القوائم المالية المعدة وفقًا لأطر ذات غرض خاص', '805': 'اعتبارات خاصة: مراجعة قائمة مالية واحدة وعناصر أو حسابات أو بنود محددة في قائمة مالية',
  '810': 'الارتباطات لإعداد التقارير عن القوائم المالية الملخصة', '1000': 'اعتبارات خاصة عند مراجعة الأدوات المالية', '2400': 'الارتباطات لفحص القوائم المالية التاريخية',
  '2410': 'فحص المعلومات المالية الأولية من قبل المراجع المستقل للمنشأة', '3000': 'ارتباطات التأكيد الأخرى بخلاف عمليات مراجعة أو فحص المعلومات المالية التاريخية', '3400': 'اختبار المعلومات المالية المستقبلية',
  '3402': 'تقارير التأكيد عن أدوات الرقابة في المنشأة الخدمية', '3410': 'ارتباطات التأكيد عن قوائم غازات الاحتباس الحراري', '3420': 'ارتباطات التأكيد لإعداد تقرير عن تجميع المعلومات المالية التصورية المضمنة في نشرات الاكتتاب',
  '4400': 'ارتباطات الإجراءات المتفق عليها', '4410': 'ارتباطات التجميع', '5000': 'المتطلبات العامة لارتباطات تأكيد معلومات الاستدامة'}
DRIVE_TITLE.update({'external-expert.pdf': 'تعديلات محدودة النطاق على معايير المراجعة والتأكيد بشأن استخدام عمل الخبير الخارجي (IAASB)',
  '2026-1.pdf': 'تعديلات محدودة النطاق على معايير إدارة الجودة والمراجعة ومعيار الفحص 2400 لتعريفي المنشأة المدرجة ومنشأة الاهتمام العام (IAASB أغسطس 2025)'})
DRIVE_SKIP.add('moraj3h-2026.pdf')  # الكتاب المجمّع لمعايير المراجعة؛ المعايير نفسها موجودة ملفًا لكل معيار
# إصدارات محدَّثة لم يحِن سريانها: تبقى النسخة الحالية هي المطبقة حتى تاريخ السريان
UPCOMING = {'معيار المراجعة 570 ISA - 41-ISA-570-_Revised-2024_-2025.pdf': 'يسري على الفترات التي تبدأ في 15 ديسمبر 2026 أو بعده',
            'معيار المراجعة 240 ISA - 240_Revised_.pdf': 'يسري على الفترات التي تبدأ في 15 ديسمبر 2026 أو بعده'}

def isa_title(lab, title):
    m = re.search(r'^(معيار [^\d]+?|مذكرة ممارسات المراجعة الدولية _?)(\d{3,4})_?\s*(ISAE|ISRE|ISRS|ISSA|IAPN|ISA)?', lab)
    if not m: return title
    n = m.group(2); kind = (m.group(3) or 'IAPN')
    name = ISA_AR.get(n)
    return f"{m.group(1).strip().rstrip('_').strip()} {n} ({kind} {n}){': ' + name if name else ''}" + (' — المحدَّث' if 'Revised' in lab or 'المحدث' in lab else '')

def drive_skip(x):
    lab = x.get('label', '')
    return lab in DRIVE_SKIP or (x.get('path', '').startswith('BOE') and lab.lower().endswith('.pdf'))  # يبقى النص الموحد (HTML) لأنه أحدث وأكمل

def drive_meta(x, title, cat):
    """بيانات الملفات التي أرسلها المكتب عبر Drive: النوع والعنوان والحالة حسب المجلد"""
    path = x.get('path', ''); lab = x.get('label', ''); std = None; dtype = None; status = 'active'; lang = None
    if path.startswith('IFRS_Standards') or path.startswith('SOCPA/01_Accounting_Standards/01_Endorsed_IFRS'):
        std = std_code(lab)
        if std:
            ar = AR_STD.get(std, ''); dtype = 'standard'
            if path.startswith('SOCPA'): title = f'{std} {ar} — المعتمد في المملكة (الهيئة السعودية للمراجعين والمحاسبين 2026)'; lang = 'ar'
            elif '06_Arabic' in path: title = f'{std} {ar} — الترجمة العربية الرسمية 2025'; lang = 'ar'
            else:
                en = re.sub(r'^[A-Za-z_\d]+__', '', re.sub(r'\.pdf$', '', lab)).replace('-', ' ')
                en = re.sub(r'^(ifrs|ias|ifric|sic)\s?\d+\s', '', en, flags=re.I).strip().title()
                title = f'{std} {ar} ({en}) — النص الكامل 2026'; lang = 'en'
            cat = 'المعايير الدولية IFRS'
    elif path.startswith('SOCPA/01_Accounting_Standards/02_Endorsed_IFRS_for_SMEs'):
        dtype = 'standard'; cat = 'المعايير الدولية IFRS - المنشآت الصغيرة والمتوسطة'
        sec = re.search(r'القسم رقم (\d+)', lab)
        if '2025' in path: title = 'المعيار الدولي للمنشآت الصغيرة والمتوسطة (إصدار 2025، يسري من 1 يناير 2027): ' + re.sub(r'^\d+ - |\.pdf$', '', lab); status = 'upcoming'
        else: title = 'المعيار الدولي للمنشآت الصغيرة والمتوسطة المعتمد (المطبق حاليًا): ' + (f'القسم {sec.group(1)} ' if sec else '') + re.sub(r'^\d+ - (القسم رقم \d+ )?|\.pdf$', '', lab)
    elif path.startswith('SOCPA/02_Auditing'):
        dtype = 'standard'; cat = 'معايير المراجعة المعتمدة في المملكة'; title = re.sub(r'\s*-\s*[\w\-]+\.pdf$|\.pdf$', '', lab) or title
        title = isa_title(lab, title)
        if lab in UPCOMING: status = 'upcoming'; title += ' (' + UPCOMING[lab] + ')'
    elif path.startswith('SOCPA/03_Code'): dtype = 'standard'; cat = 'الميثاق الدولي لسلوك وآداب المهنة'; title = re.sub(r'\.pdf$', '', lab); title = title if re.search(r'[؀-ۿ]', title) else 'الميثاق الدولي لسلوك وآداب المهنة المعتمد: ' + title
    elif path.startswith('SOCPA/01_Accounting_Standards'): dtype = 'standard'; cat = 'المعايير الدولية IFRS'; title = 'الهيئة السعودية للمراجعين والمحاسبين: ' + re.sub(r'\.pdf$', '', lab)
    elif path.startswith('OECD'): dtype = 'standard'; cat = 'منظمة التعاون الاقتصادي OECD'; title = re.sub(r'^\d+_|\.pdf$', '', lab).replace('_', ' '); lang = 'en'
    elif path.startswith('BOE'): cat = 'الأنظمة السعودية (هيئة الخبراء)'; title = re.sub(r'^\d+_|\.(pdf|html)$', '', lab) + (' — النص الموحد من هيئة الخبراء' if lab.endswith('.html') else ' — ملف هيئة الخبراء')
    elif path.startswith('ZATCA'):
        sub = path.split('/')[1] if '/' in path else ''
        cat = {'01_Zakat_Regulation_and_Decisions': 'الزكاة', '02_E-Invoicing_Technical_Specs': 'الفوترة الإلكترونية', '03_Zakat_Guidelines': 'أدلة إرشادية - أدلة زكوية عامة'}.get(sub, 'الزكاة')
        grp = path.split('/')[2] if path.count('/') >= 2 else ''
        title = re.sub(r'\.pdf$', '', lab) + (f' ({re.sub(r"^\d+_", "", grp)})' if grp else '')
    if lab in DRIVE_TITLE: title = DRIVE_TITLE[lab]
    return title, cat, dtype, status, lang, std

PARA = re.compile(r'(?m)^\s*((?:[A-Z]{1,2})?\d{1,3}[A-Z]{0,2})\s+[A-Z(a-z]')
def para_ref(text):
    ids = [m.group(1) for m in PARA.finditer(text)]
    return (ids[0], ids[-1]) if len(ids) >= 2 else None

def main():
    textdir = sys.argv[1]; out = sys.argv[-1]; manifests = [a for a in sys.argv[2:-1] if not a.endswith('.extra.json')]; extras = [a for a in sys.argv[2:-1] if a.endswith('.extra.json')]
    entries = []
    for mf in manifests:
        d = os.path.dirname(mf)
        for x in json.load(open(mf, encoding='utf-8')):
            x['_dir'] = d; entries.append(x)
    sources = []; chunks = []; stats = collections.Counter()
    seen_sha = set()
    for x in entries:
        tj = os.path.join(textdir, x['file'] + '.json')
        if not os.path.exists(tj) or not x.get('bytes'):
            stats['missing_text'] += 1; continue
        if re.search(r'لائحة عمل (لجنة|مجلس)|المنبثقة عن مجلس الإدارة', (x.get('item') or '') + ' ' + (x.get('label') or '')):
            stats['excluded_internal'] += 1; continue  # لوائح الحوكمة الداخلية للهيئة: ليست من الأحكام الضريبية
        if x.get('origin') == 'drive' and drive_skip(x):
            stats['duplicate_drive'] += 1; continue
        if x['sha256'] in seen_sha:
            stats['duplicate'] += 1; continue
        seen_sha.add(x['sha256'])
        t = json.load(open(tj, encoding='utf-8'))
        pages = strip_boiler(t['pages'])
        code = hashlib.sha1(x['url'].encode()).hexdigest()[:12]
        item = (x.get('item') or '').strip().strip('​ ')
        label = re.sub(r'[​‎‏]', '', x.get('label') or '').strip()
        weak = re.search(r'اضغط|الرابط|^هنا$|انقر', label) or len(label) < 6
        title = (item + (' (المحدثة)' if 'محدث' in label else '')) if weak else (label if len(label) > len(item) * 0.6 else item)
        cat = (x.get('cat') or '').strip()
        if cat.rstrip(': ') == 'اتفاقيات' and re.match(r'الاتفاقية مع', item): cat = 'اتفاقيات: اتفاقيات منع الازدواج الضريبي'
        cat = cat.replace('اتفاقيات: الاتفاقيات الضريبية', 'اتفاقيات: اتفاقيات منع الازدواج الضريبي')
        status = 'superseded' if x.get('origin') != 'drive' and re.search(r'السابق|1440 ?هـ|1438', label + ' ' + cat) else 'active'  # «لجنة التفسيرات السابقة» اسم جهة وليس حالة
        if t.get('status') in ('لاغي', 'ملغى', 'ملغي'): status = 'superseded'  # حالة النظام في هيئة الخبراء
        dtype = doc_type(item + ' ' + title, cat); std = None; lang = None
        if x.get('origin') == 'drive':
            title, cat, dt2, st2, lang, std = drive_meta(x, title, cat)
            if dt2: dtype = dt2
            if st2 != 'active': status = st2
        arts, pre = split_articles(pages)
        use_articles = len(arts) >= 3 and dtype not in ('guide', 'standard', 'ruling')
        src = {'code': code, 'title': title, 'item': item, 'cat': cat, 'type': dtype, 'status': status, 'url': x['url'], 'page_url': x.get('item_url', ''),
               'sha256': x['sha256'], 'pages': len(pages), 'method': t.get('method'), 'lang': lang or ('en' if re.search(r'[A-Za-z]{4}', title) and not re.search(r'[؀-ۿ]', title) else 'ar')}
        if x.get('origin') == 'drive': src['url'] = x.get('item_url', '')  # رابط الملف في Drive المكتب
        sources.append(src)
        if use_articles:
            intro = '\n'.join(l for _, l in pre).strip()
            if intro:
                chunks.append({'s': code, 'k': 'intro', 'r': 'الديباجة', 'n': 0, 'h': '', 't': clean_body(intro, src['lang'])[:6000], 'p1': 1, 'p2': pre[-1][0] if pre else 1})
            for a in arts:
                body = clean_body(a['text'], src['lang']); head = clean_heading(a['heading'])
                # مواد طويلة جدًا تُقسَّم مع إبقاء المرجع
                parts = [body[i:i + 6000] for i in range(0, max(1, len(body)), 6000)] or ['']
                for j, part in enumerate(parts):
                    chunks.append({'s': code, 'k': 'article', 'r': a['ref'] + (f' (جزء {j + 1})' if len(parts) > 1 else ''), 'n': a['num'], 'h': head, 't': part, 'p1': a['p1'], 'p2': a['p2']})
            stats['articles'] += len(arts); stats['docs_articles'] += 1
        else:
            for c in page_chunks(pages):
                c['text'] = clean_body(c['text'], src['lang'])
                if len(c['text']) < 40: continue
                pg = f"صفحة {c['p1']}" + (f"–{c['p2']}" if c['p2'] != c['p1'] else '')
                pr = para_ref(c['text']) if std and src['lang'] == 'en' else None
                ref = f"{std} | الفقرات {pr[0]}–{pr[1]}" if pr else (f"{std} | {pg}" if std else pg)
                chunks.append({'s': code, 'k': 'page', 'r': ref, 'n': c['p1'], 'h': '', 't': c['text'], 'p1': c['p1'], 'p2': c['p2']})
            stats['docs_pages'] += 1
    for ex in extras:  # مصادر جاهزة (مثل ملخصات IFRS من الويب)
        e = json.load(open(ex, encoding='utf-8')); sources += e['sources']; chunks += e['chunks']; stats['extra_sources'] += len(e['sources'])
    for i, c in enumerate(chunks):
        c['o'] = i
    corpus = {'version': datetime.datetime.utcnow().strftime('%Y%m%d%H%M'), 'built_at': datetime.datetime.utcnow().isoformat() + 'Z', 'sources': sources, 'chunks': chunks}
    with gzip.open(out, 'wt', encoding='utf-8') as f:
        json.dump(corpus, f, ensure_ascii=False)
    print(dict(stats), 'sources', len(sources), 'chunks', len(chunks), 'chars', sum(len(c['t']) for c in chunks))

if __name__ == '__main__':
    main()
