import json, gzip, re, sys
sys.path.insert(0, '.')
from anchors import A
c = json.load(gzip.open('/home/user/abusamir/server/assets/legal/corpus.json.gz'))
srcs = c['sources']; out = []
for std, para, rx, kws in A:
  cands = [s for s in srcs if s['title'].startswith(std + ' ') and ('النص الكامل' in s['title'])] + [s for s in srcs if s['title'].startswith(std + ' ') and 'المعتمد' in s['title']]
  hit = None
  for s in cands:
    for ch in c['chunks']:
      if ch['s'] != s['code']: continue
      t = re.sub(r'\s+', ' ', ch['t']); m = re.search(rx, t)
      if m: hit = (s, t[m.start():m.end() + 230].strip()); break
    if hit: break
  out.append({'std': std, 'para': para, 'kws': kws, **({'source': hit[0]['title'], 'source_code': hit[0]['code'], 'quote': hit[1], 'lang': 'en' if 'النص الكامل' in hit[0]['title'] else 'ar'} if hit else {'miss': True})})
  print(std, para, 'MISS' if not hit else hit[1][:90])
json.dump(out, open('anchors.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
