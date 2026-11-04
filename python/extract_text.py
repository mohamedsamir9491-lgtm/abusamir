#!/usr/bin/env python3
"""استخراج نص المستندات الرسمية صفحةً صفحة (محليًا بالكامل).
- PDF نصي: pdftotext مع تطبيع NFKC وإزالة محارف الاتجاه.
- صفحة نصها مشفر/تالف (خط مخصص) أو بلا نص، أو صورة: تعرف ضوئي tesseract (عربي + إنجليزي) بدقة 300.
الإخراج JSON: {"pages":[{"page":1,"method":"text|ocr","text":"..."}], "warnings":[...]}"""
import json, os, re, subprocess, sys, tempfile, unicodedata

BIDI = re.compile('[‎‏‪-‮⁦-⁩﻿]')
AR = re.compile('[ء-ي]'); LAT = re.compile('[A-Za-z]'); WEIRD = re.compile('[Ͱ-Ͽʰ-˿̀-ͯᴀ-ᶿ]')

DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹٬', '01234567890123456789,')

def norm(t):
    t = unicodedata.normalize('NFKC', t)
    t = BIDI.sub('', t).translate(DIGITS).replace('\u0640', '').replace('\u00ad', ' - ')
    return t

def quality(t):
    letters = len(AR.findall(t)) + len(LAT.findall(t)); weird = len(WEIRD.findall(t))
    return letters, weird

def page_count(path):
    out = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
    m = re.search(r'Pages:\s+(\d+)', out); return int(m.group(1)) if m else 0

def pdf_page_text(path, p):
    r = subprocess.run(['pdftotext', '-layout', '-f', str(p), '-l', str(p), path, '-'], capture_output=True, text=True)
    return norm(r.stdout)

SPECIAL = {0x03C1: 'ي', 0x02F0: '', 0x02EF: 'ء', 0x02EC: '-', 0x0BCC: 'هللا', 0x0BCD: '\ue000', 0x1000: ','}

def decode_char(ch):
    o = ord(ch)
    if o in SPECIAL: return SPECIAL[o]
    if 0x0370 <= o <= 0x03FF: return chr(o + 0xFB00)
    if 0x02F9 <= o <= 0x0302: return chr(o - 0x02F9 + 0x30)
    return ch

def decode_shifted_page(path, pno):
    """خطوط وزارة التجارة في بعض الشهادات (مثل السجل التجاري) تحمل خريطة محارف مُزاحة:
    أشكال الحروف العربية (U+FExx) مخزنة كـ U+03xx والأرقام كـ U+02F9.. ؛ نعيدها، ونبني الكلمات من مواضعها
    (الملف لا يحوي مسافات)، ونصحح الترتيب البصري (عربي من اليمين، أرقام من اليسار)."""
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[pno - 1]
        words = page.extract_words(x_tolerance=1.2, y_tolerance=2, keep_blank_chars=False, use_text_flow=False)
    rows = []
    for w in sorted(words, key=lambda w: (round(w['top'] / 4), -w['x1'])):
        if rows and abs(rows[-1]['top'] - w['top']) <= 4: rows[-1]['words'].append(w)
        else: rows.append({'top': w['top'], 'words': [w]})
    lines = []
    for r in rows:
        toks = []
        for w in sorted(r['words'], key=lambda w: -w['x1']):
            raw = re.sub(r'\(cid:3021\)', '\ue000', w['text'])
            raw = ''.join(decode_char(c) for c in raw)
            if AR.search(unicodedata.normalize('NFKC', raw)):
                raw = raw[::-1]  # يُعكس قبل NFKC كي لا ينقلب «لا» المركّب إلى «ال»
                raw = re.sub(r'[0-9\u0660-\u0669\u06f0-\u06f9A-Za-z.,٬/:@-]+', lambda m: m.group(0)[::-1], raw)
            t = norm(raw).replace('\ue000', ' ريال ')
            toks.append(t.translate(str.maketrans('()[]', ')(][')).strip())
        lines.append(' '.join(x for x in toks if x))
    return '\n'.join(lines)

OCR_FIXES = [0]
def ocr_png(png):
    r = subprocess.run(['tesseract', png, '-', '-l', 'ara+eng', '--psm', '6'], capture_output=True, text=True, timeout=300)
    import sys as _s, os as _o; _s.path.insert(0, _o.path.dirname(_o.path.abspath(__file__))); from textnorm import fix_text
    t, n = fix_text(norm(r.stdout)); OCR_FIXES[0] += n
    return t

def ocr_pdf_page(path, p, tmp):
    base = os.path.join(tmp, f'p{p}')
    subprocess.run(['pdftoppm', '-r', '300', '-f', str(p), '-l', str(p), '-png', '-singlefile', path, base], check=True, capture_output=True)
    return ocr_png(base + '.png')

def main(path):
    out = {'pages': [], 'warnings': []}
    ext = os.path.splitext(path)[1].lower()
    with tempfile.TemporaryDirectory() as tmp:
        if ext in ('.png', '.jpg', '.jpeg', '.tif', '.tiff'):
            out['pages'].append({'page': 1, 'method': 'ocr', 'text': ocr_png(path)})
        else:
            n = page_count(path)
            ocr_pages = 0
            for p in range(1, n + 1):
                t = pdf_page_text(path, p)
                letters, weird = quality(t)
                if weird > 20:
                    try: d = decode_shifted_page(path, p)
                    except Exception: d = ''  # noqa: BLE001
                    dl, dw = quality(d)
                    if dl > weird * 0.5 and dw < dl * 0.1:
                        out['pages'].append({'page': p, 'method': 'text-decoded', 'text': d}); continue
                if letters < 40 or weird > letters * 0.15:
                    try:
                        o = ocr_pdf_page(path, p, tmp); ocr_pages += 1
                        if quality(o)[0] > letters: out['pages'].append({'page': p, 'method': 'ocr', 'text': o}); continue
                    except Exception as e:  # noqa: BLE001
                        out['warnings'].append(f'تعذر التعرف الضوئي للصفحة {p}: {e}')
                out['pages'].append({'page': p, 'method': 'text', 'text': t})
            if ocr_pages: out['warnings'].append(f'قُرئت {ocr_pages} صفحة بالتعرف الضوئي (نصها في الملف تالف أو صورة)؛ راجع القيم المستخرجة.')
    if OCR_FIXES[0]: out['warnings'].append(f'صُحح تلقائيًا {OCR_FIXES[0]} رمزًا متشابهًا في القراءة الضوئية (مثل الحرف ا داخل رقم ← 1، أو الرقم ١ داخل كلمة ← ا)؛ راجع القيم قبل الاعتماد.')
    print(json.dumps(out, ensure_ascii=False))

if __name__ == '__main__':
    main(sys.argv[1])
