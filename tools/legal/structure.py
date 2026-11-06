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
    toks = [re.sub(r'^(و?ال)', '', t) for t in re.split(r'[\s\-]+', w) if t]
    n = 0; unit = 0; hundred = 0
    for i, t in enumerate(toks):
        if t in ('مائه', 'مئه', 'مايه'):
            hundred = 100
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

HEAD = re.compile(r'^\s*[\(\[]?\s*(?:ال)?ماد[ةه]\s*[:\-–]?\s*(.*)$')
ORD_WORDS = set(UNITS) | set(TENS) | {'عشر', 'عشره', 'مائه', 'مئه', 'مايه', 'بعد'}

def parse_head(line):
    """يعيد (الرقم، نص الرقم، العنوان) إن كان السطر عنوان مادة"""
    m = HEAD.match(line)
    if not m: return None
    rest = m.group(1).strip()
    d = re.match(r'^[\(\[]?\s*([\d٠-٩]+)\s*[\)\]]?\s*[:\-–.]?\s*(.*)$', rest)
    if d:
        return int(norm(d.group(1))), d.group(1), d.group(2).strip(' :-–')
    toks = rest.split(); used = []
    for t in toks:
        b = re.sub(r'^(و?ال)', '', norm(t).strip(':،.-–()'))
        if b in ORD_WORDS or (used and norm(t).startswith('و') and re.sub(r'^و?ال', '', norm(t).strip(':،.')) in ORD_WORDS):
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
        for line in page.split('\n'):
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
            if ok:
                if cur: arts.append(cur)
                cur = {'num': num, 'ref': 'المادة ' + numtxt, 'heading': head, 'lines': [], 'p1': pi, 'p2': pi}
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
        status = 'superseded' if re.search(r'السابق|1440 ?هـ|1438', label + ' ' + cat) else 'active'
        dtype = doc_type(item + ' ' + title, cat)
        arts, pre = split_articles(pages)
        use_articles = len(arts) >= 3 and dtype != 'guide'
        src = {'code': code, 'title': title, 'item': item, 'cat': cat, 'type': dtype, 'status': status, 'url': x['url'], 'page_url': x.get('item_url', ''),
               'sha256': x['sha256'], 'pages': len(pages), 'method': t.get('method'), 'lang': 'en' if re.search(r'[A-Za-z]{4}', title) and not re.search(r'[؀-ۿ]', title) else 'ar'}
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
                chunks.append({'s': code, 'k': 'page', 'r': f"صفحة {c['p1']}" + (f"–{c['p2']}" if c['p2'] != c['p1'] else ''), 'n': c['p1'], 'h': '', 't': c['text'], 'p1': c['p1'], 'p2': c['p2']})
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
