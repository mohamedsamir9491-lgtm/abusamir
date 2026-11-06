"""استخراج نص الأنظمة صفحةً صفحة: طبقة النص إن كانت سليمة، وإلا قراءة ضوئية عربية (tesseract)
الناتج: text/<file>.json = {file, method, pages:[...]}"""
import json, os, re, subprocess, sys, unicodedata, tempfile
from multiprocessing import Pool

BIDI = re.compile('[‎‏‪-‮⁦-⁩﻿]')
BROKEN = re.compile(r'(?:^|\s)(?:[وفبك]?)(اال|األ|اإل|اآل)')
PROPER = re.compile(r'(?:^|\s)(?:[وفبك]?)(الا|الأ|الإ|الآ)')

def clean(t):
    t = unicodedata.normalize('NFKC', t)
    t = BIDI.sub('', t)
    t = t.replace('ـ', '')
    return re.sub(r'[ \t]+', ' ', t)

def npages(pdf):
    o = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    m = re.search(r'Pages:\s+(\d+)', o)
    return int(m.group(1)) if m else 0

def text_layer(pdf, n):
    out = []
    for i in range(1, n + 1):
        r = subprocess.run(['pdftotext', '-layout', '-f', str(i), '-l', str(i), pdf, '-'], capture_output=True, text=True)
        out.append(clean(r.stdout))
    return out

def arabic_ratio(s):
    a = len(re.findall(r'[؀-ۿ]', s)); l = len(re.findall(r'[A-Za-z]', s))
    return a / max(1, a + l)

def ocr_page(args):
    pdf, i = args
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(['pdftoppm', '-f', str(i), '-l', str(i), '-r', '250', '-gray', pdf, os.path.join(d, 'p')], capture_output=True)
        imgs = sorted(f for f in os.listdir(d) if f.endswith('.pgm'))
        if not imgs:
            return ''
        env = dict(os.environ, OMP_THREAD_LIMIT='1')
        r = subprocess.run(['tesseract', os.path.join(d, imgs[0]), '-', '-l', 'ara+eng', '--psm', '6'], capture_output=True, text=True, env=env)
        return clean(r.stdout)

def main():
    src_dirs = sys.argv[1:-1]; outdir = sys.argv[-1]; os.makedirs(outdir, exist_ok=True)
    files = []
    for d in src_dirs:
        for f in sorted(os.listdir(d)):
            if f.lower().endswith('.pdf'):
                files.append(os.path.join(d, f))
    pool = Pool(4)
    for pdf in files:
        dest = os.path.join(outdir, os.path.basename(pdf) + '.json')
        if os.path.exists(dest):
            continue
        n = npages(pdf)
        if not n:
            print('SKIP no pages', pdf, flush=True); continue
        pages = text_layer(pdf, n)
        joined = '\n'.join(pages)
        ar = arabic_ratio(joined); broken = len(BROKEN.findall(joined)); proper = len(PROPER.findall(joined))
        chars = len(re.sub(r'\s', '', joined))
        method = 'text'
        if chars < 80 * n:
            method = 'ocr'  # ممسوح ضوئيًا
        elif ar > 0.5 and broken > proper:
            method = 'ocr'  # ترميز عربي معطوب (لام ألف مقلوبة)
        if method == 'ocr':
            pages = pool.map(ocr_page, [(pdf, i) for i in range(1, n + 1)])
        json.dump({'file': os.path.basename(pdf), 'method': method, 'pages': pages, 'broken': broken, 'proper': proper}, open(dest, 'w', encoding='utf-8'), ensure_ascii=False)
        print(method, n, 'pages', os.path.basename(pdf)[:80], 'broken/proper', broken, proper, flush=True)

if __name__ == '__main__':
    main()
