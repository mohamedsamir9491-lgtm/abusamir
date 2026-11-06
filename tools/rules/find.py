"""للتحقق: لكل مواصفة (مصدر + نمط) يطبع المصدر والمرجع والصفحة ومقتطفًا من النص نفسه. python3 -I find.py specs.json out.json"""
import json, gzip, re, sys
c = json.load(gzip.open('/home/user/abusamir/server/assets/legal/corpus.json.gz'))
S = {s['code']: s for s in c['sources']}
specs = json.load(open(sys.argv[1], encoding='utf-8')); out = {}
for code, items in specs.items():
  res = []
  for it in items:
    srcs = [s for s in c['sources'] if all(k in s['title'] for k in it['src'])]
    srcs.sort(key=lambda s: (0 if ('المعتمد في المملكة' in s['title'] or 'النص الموحد' in s['title']) else 1, len(s['title'])))
    hit = None
    for s in srcs:
      for ch in c['chunks']:
        if ch['s'] != s['code']: continue
        if it.get('ref') and ch['r'] != it['ref']: continue
        t = re.sub(r'\s+', ' ', ch['t']); m = re.search(it['re'], t)
        if m: hit = (s, ch, t[max(0, m.start() - it.get('pre', 60)):m.end() + it.get('post', 180)].strip()); break
      if hit: break
    if not hit: res.append({'MISS': it}); continue
    s, ch, q = hit
    page = f"صفحة {ch['p1']}" + (f"–{ch['p2']}" if ch.get('p2') and ch['p2'] != ch['p1'] else '') if ch.get('p1') else ''
    mm = re.search(it['re'], re.sub(r'\s+', ' ', ch['t'])); pg = mm.groupdict().get('p') if mm else None
    para = it.get('para') or (f"الفقرة {pg}" if pg else None)
    if pg: q = q[q.find(pg):] if pg in q[:80] else q
    res.append({'source': s['title'], 'source_code': s['code'], 'ref': ch['r'] if ch['k'] == 'article' else (para or page), 'page': page, 'quote': q, 'para': para, 'lang': 'en' if 'النص الكامل' in s['title'] else 'ar'})
  out[code] = res
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k, v in out.items():
  for x in v: print(k, '|', 'MISS' if 'MISS' in x else f"{x['source'][:45]} | {x['ref']} | {x['quote'][:150]}")
