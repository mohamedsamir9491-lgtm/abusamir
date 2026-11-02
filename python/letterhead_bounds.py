#!/usr/bin/env python3
"""يحسب حدود تصميم الترويسة (أعلى/أسفل بالمليمتر على A4) ويقصّ شريطي الرأس والتذييل كصورتين PNG (base64)
لطباعتهما في هوامش الصفحة عبر قوالب رأس/تذييل Chromium، فيبقى المحتوى داخل المنطقة البيضاء.
الاستخدام: letterhead_bounds.py <image|pdf> → JSON {top_mm, bottom_mm, top_png, bottom_png, full_png}"""
import sys, json, io, base64
from PIL import Image

def load(path):
    if path.lower().endswith('.pdf'):
        import pypdfium2 as p
        return p.PdfDocument(path)[0].render(scale=2).to_pil()
    return Image.open(path)

img = load(sys.argv[1]).convert('RGB')
if img.width > 1100: img = img.resize((1100, round(img.height * 1100 / img.width)), Image.LANCZOS)
w, h = img.size
g = img.convert('L'); px = g.load(); step = max(1, w // 400)
rows = [sum(1 for x in range(0, w, step) if px[x, y] < 215) / (w / step) for y in range(h)]
thr = 0.03
top = 0
for y in range(int(h * 0.45)):
    if rows[y] > thr: top = y
bottom = h
for y in range(h - 1, int(h * 0.55), -1):
    if rows[y] > thr: bottom = y
pad = int(h * 0.006)
top_px = min(h, top + pad); bottom_px = max(0, bottom - pad)
def b64(im):  # JPEG لتصغير حجم الصفحات (الشريطان يُضمَّنان في كل صفحة)
    buf = io.BytesIO(); im.convert('RGB').save(buf, 'JPEG', quality=82, optimize=True); return base64.b64encode(buf.getvalue()).decode()
print(json.dumps({'top_mm': round(top_px / h * 297, 1), 'bottom_mm': round(bottom_px / h * 297, 1), 'width': w, 'height': h,
                  'top_png': b64(img.crop((0, 0, w, top_px))), 'bottom_png': b64(img.crop((0, bottom_px, w, h))), 'middle_png': b64(img.crop((0, top_px, w, bottom_px)))}))
