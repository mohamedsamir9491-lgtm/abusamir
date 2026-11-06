"""تحميل ملفات مجلد Drive المشارك (بالرابط) حسب الحصر، مع التحقق من الحجم، وكتابة manifest بنفس صيغة download.py
python3 -I dl_drive.py inventory.json outdir"""
import json, os, re, subprocess, sys, hashlib, time

inv = json.load(open(sys.argv[1], encoding='utf-8')); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
man_path = os.path.join(out, 'manifest.json')
manifest = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else []
done = {m['drive_id'] for m in manifest if m.get('bytes')}
CAT = {'IFRS_Standards': 'المعايير الدولية IFRS', 'SOCPA': 'الهيئة السعودية للمراجعين والمحاسبين', 'BOE_Saudi_Laws': 'الأنظمة السعودية (هيئة الخبراء)', 'OECD': 'منظمة التعاون الاقتصادي OECD', 'ZATCA': 'هيئة الزكاة والضريبة والجمارك'}
ok = bad = 0
for it in inv:
    fid = it['id']
    if fid in done: continue
    if it.get('mimeType', '').startswith('application/vnd.google-apps'): continue  # مستندات Google الأصلية لا تُحمَّل بهذه الطريقة
    name = re.sub(r'[^\w.\-؀-ۿ ]', '_', it['title'])[:150]
    dest = os.path.join(out, fid[:10] + '_' + name)
    url = f'https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t'
    code = ''
    for attempt in range(3):
        r = subprocess.run(['curl', '-sL', '-m', '300', '-o', dest, '-w', '%{http_code}', url], capture_output=True, text=True)
        code = r.stdout.strip(); size = os.path.getsize(dest) if os.path.exists(dest) else 0
        want = int(it['size']) if it.get('size') else None
        if code == '200' and size and (want is None or size == want): break
        time.sleep(2 * (attempt + 1))
    size = os.path.getsize(dest) if os.path.exists(dest) else 0
    head = open(dest, 'rb').read(64) if size else b''
    good = code == '200' and size > 0 and not head.lstrip().lower().startswith(b'<!doctype html')
    sha = hashlib.sha256(open(dest, 'rb').read()).hexdigest() if good else ''
    top = it.get('path', '').split('/')[0]
    manifest.append({'cat': CAT.get(top, top) + (' - ' + it['path'].split('/', 1)[1] if '/' in it.get('path', '') else ''), 'item': re.sub(r'\.(pdf|docx?|xlsx?)$', '', it['title'], flags=re.I).replace('_', ' ').strip(),
                     'item_url': f'https://drive.google.com/file/d/{fid}/view', 'label': it['title'], 'url': f'drive:{fid}', 'drive_id': fid, 'file': os.path.basename(dest),
                     'http': code, 'bytes': size if good else 0, 'sha256': sha, 'path': it.get('path', ''), 'origin': 'drive'})
    ok += good; bad += (not good)
    if (ok + bad) % 20 == 0:
        json.dump(manifest, open(man_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); print('progress', ok, bad, flush=True)
json.dump(manifest, open(man_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('done ok', ok, 'failed', bad, 'total manifest', len(manifest))
