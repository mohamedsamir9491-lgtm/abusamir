"""تحويل صفحات هيئة الخبراء المحفوظة (HTML) إلى نص بنفس صيغة extract.py: text/<file>.json
python3 -I html2text.py docs-drive text"""
import html, json, os, re, sys

src, out = sys.argv[1], sys.argv[2]
for f in sorted(os.listdir(src)):
    if not f.lower().endswith('.html'): continue
    s = open(os.path.join(src, f), encoding='utf-8', errors='ignore').read()
    s = re.sub(r'(?is)<(script|style)\b.*?</\1>', '', s)
    status = re.search(r'<th>الحالة</th>\s*<td>(.*?)</td>', s)
    s = re.sub(r'(?i)<br\s*/?>|</(p|div|h\d|li|tr|table)>', '\n', s)
    s = re.sub(r'(?i)<(h\d|p|div|li)\b[^>]*>', '\n', s)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', s))
    t = re.sub(r'[ \t\xa0]+', ' ', t); t = re.sub(r' *\n *', '\n', t); t = re.sub(r'\n{3,}', '\n\n', t).strip()
    t = t.replace('- اختر - تعليق خطأ لغوي خطأ في مادة خطأ في تاريخ أخرى', '')
    t = re.sub(r'(المادة\s+\S+)\s+و\s+(?=[ء-ي])', r' و', t)  # «الحادية و الستون» = «الحادية والستون»
    json.dump({'file': f, 'method': 'html', 'pages': [t], 'status': html.unescape(status.group(1)).strip() if status else ''}, open(os.path.join(out, f + '.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f, len(t), (status.group(1) if status else ''))
