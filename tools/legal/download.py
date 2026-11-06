"""يحمّل ملفات الأنظمة من قائمة JSON (عناصر فيها docs) إلى مجلد docs/ ويكتب manifest.json"""
import json, sys, os, hashlib, subprocess, urllib.parse, re

items = json.load(open(sys.argv[1], encoding='utf-8'))
outdir = sys.argv[2]
man_path = os.path.join(outdir, 'manifest.json')
os.makedirs(outdir, exist_ok=True)
manifest = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else []
seen = {m['url'] for m in manifest}
for it in items:
    for d in it.get('docs', []):
        url = d['h']
        if url in seen:
            continue
        name = urllib.parse.unquote(url.split('/')[-1].split('?')[0])
        safe = re.sub(r'[^\w.\-؀-ۿ ]', '_', name)[:150]
        dest = os.path.join(outdir, hashlib.sha1(url.encode()).hexdigest()[:10] + '_' + safe)
        r = subprocess.run(['curl', '-sL', '-m', '180', '-A', 'Mozilla/5.0', '-o', dest, '-w', '%{http_code}', url], capture_output=True, text=True)
        code = r.stdout.strip()
        size = os.path.getsize(dest) if os.path.exists(dest) else 0
        sha = hashlib.sha256(open(dest, 'rb').read()).hexdigest() if size else ''
        manifest.append({'cat': it.get('cat', '').strip(), 'item': it.get('title', '').strip(), 'item_url': it.get('url', ''), 'label': d.get('t', ''), 'url': url, 'file': os.path.basename(dest), 'http': code, 'bytes': size, 'sha256': sha})
        seen.add(url)
        print(code, size, it.get('title', '')[:50], '|', name[:70], flush=True)
json.dump(manifest, open(man_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('total files', len(manifest))
