#!/usr/bin/env python3
"""استخراج الجداول من PDF (نصي أو ممسوح ضوئيًا) ومن الصور، بإعادة بناء الأعمدة من مواضع الكلمات.

الاستخدام: python3 -I extract_pdf.py <file.pdf|png|jpg|tif>
الناتج JSON: {"method", "pages": [...], "tables": [{"name","page","rows"}], "warnings": [...], "confidence"}

لماذا المواضع وليس كاشف الجداول: موازين المراجعة المصدّرة من أنظمة ERP (wkhtmltopdf وغيره) بلا خطوط شبكية،
فلا يجد كاشف pdfplumber إلا صف العناوين. لذلك:
1) تُقرأ الكلمات بإحداثياتها (pdfplumber للملفات النصية، tesseract TSV للممسوح والصور).
2) يُصحَّح النص العربي المخزن بترتيب بصري معكوس (يُكتشف تلقائيًا) وتُطبَّع أشكال العرض (NFKC).
3) تُجمع الكلمات في أسطر بالارتفاع، ثم في خلايا داخل السطر (من اليمين لليسار).
4) تُستنتج حدود الأعمدة من أسطر البيانات (الأسطر التي فيها مبلغان أو أكثر)، وتُسند إليها العناوين متعددة الأسطر.
5) تُدمج أسطر الاسم المكسورة مع سطر بياناتها، وتُستبعد الترويسة والتذييل وأرقام الصفحات.
"""
import json
import os
import re
import statistics
import subprocess
import sys
import tempfile
import unicodedata

AR = re.compile(r"[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]")
NUMERIC = re.compile(r"^[-+(]?[\d٠-٩۰-۹][\d٠-٩۰-۹,٬.٫]*[)\-]?$")
AMOUNT = re.compile(r"^[-+(]?[\d٠-٩۰-۹]{1,3}([,٬][\d٠-٩۰-۹]{3})*([.٫][\d٠-٩۰-۹]+)?[)\-]?$|^[-+(]?[\d٠-٩۰-۹]+[.٫][\d٠-٩۰-۹]+[)\-]?$")


def is_numeric(t):
    if t.count("(") != t.count(")"):  # "16)" جزء من نص مثل (IFRS 16) وليس مبلغًا
        return False
    return bool(NUMERIC.match(t)) and any(ch.isdigit() for ch in t)


def is_amount(t):
    return bool(AMOUNT.match(t)) and (("." in t) or ("," in t) or ("٫" in t) or ("٬" in t))


# ---------------------------------------------------------------- قراءة الكلمات
def pdf_words(path):
    import pdfplumber  # type: ignore
    pages = []
    with pdfplumber.open(path) as pdf:
        for i, page in enumerate(pdf.pages[:300]):
            ws = page.extract_words(keep_blank_chars=False, use_text_flow=False) or []
            pages.append({"page": i + 1, "width": float(page.width), "height": float(page.height),
                          "words": [{"x0": float(w["x0"]), "x1": float(w["x1"]), "top": float(w["top"]), "bottom": float(w["bottom"]),
                                     "text": w["text"]} for w in ws if w["text"].strip()],
                          "text": page.extract_text() or ""})
    return pages


def tess(img_path, args, timeout=240):
    try:
        out = subprocess.run(["tesseract", img_path, "stdout", *args, "tsv"], capture_output=True, text=True, timeout=timeout).stdout
    except FileNotFoundError:
        raise RuntimeError("tesseract غير مثبت على الخادم")
    res = []
    for ln in out.splitlines()[1:]:
        parts = ln.split("\t")
        if len(parts) < 12 or parts[0] != "5":
            continue
        txt = parts[11].strip().replace("\u200e", "").replace("\u200f", "").strip("_—–~=|'\"`‘’“”")  # بقايا خطوط الجدول وعلامات الاتجاه
        if not txt:
            continue
        x, y, w, h, conf = int(parts[6]), int(parts[7]), int(parts[8]), int(parts[9]), float(parts[10])
        res.append({"x0": x, "x1": x + w, "top": y, "bottom": y + h, "text": unicodedata.normalize("NFKC", txt), "conf": conf})
    return res


DIGITS = ["-l", "eng", "-c", "tessedit_char_whitelist=0123456789.,-/()"]


def ocr_image(img_path, page_no):
    """OCR بمرورين: (1) عربي+إنجليزي للنصوص، (2) أرقام فقط للمبالغ (أدق بكثير)، ثم استرجاع رموز الحسابات بقص كل سطر."""
    text_pass = tess(img_path, ["-l", "ara+eng", "--psm", "6"])
    num_pass = [w for w in tess(img_path, [*DIGITS, "--psm", "11"]) if w["conf"] >= 60 and is_numeric(w["text"])]
    overlaps = lambda a, b: min(a["x1"], b["x1"]) > max(a["x0"], b["x0"]) and min(a["bottom"], b["bottom"]) > max(a["top"], b["top"])
    words = [w for w in text_pass if not is_numeric(w["text"]) or not any(overlaps(w, n) for n in num_pass)]
    words = [w for w in words if not (is_numeric(w["text"]) and w["conf"] < 60 and any(overlaps(w, n) for n in num_pass))] + num_pass
    confs = [w["conf"] for w in words if w["conf"] >= 0]
    try:
        from PIL import Image  # type: ignore
        with Image.open(img_path) as im:
            W, H = im.size
    except Exception:
        W = max((w["x1"] for w in words), default=1000); H = max((w["bottom"] for w in words), default=1400)
    page = {"page": page_no, "width": W, "height": H, "words": words, "text": " ".join(w["text"] for w in words), "image": img_path}
    recover_codes(page)
    return page, confs


def _ocr_code(im, box, tmp, tag):
    from PIL import ImageOps  # type: ignore
    crop = ImageOps.expand(im.crop(box), border=20, fill=255); fp = os.path.join(tmp, f"c{tag}.png"); crop.save(fp)  # الهامش الأبيض ضروري لدقة tesseract
    got = [w for w in tess(fp, ["-l", "eng", "-c", "tessedit_char_whitelist=0123456789", "--psm", "7"], timeout=30) if re.match(r"^\d{3,15}$", w["text"])]
    return max(got, key=lambda w: len(w["text"]))["text"] if got else None


def recover_codes(page):
    """رموز الحسابات تلتصق بالاسم العربي فيفشل OCR في فصلها.
    (1) قراءة أولية لمنطقة يمين الاسم في كل سطر، (2) تعلم موضع عمود الرمز وطوله الغالب من القراءات السليمة،
    (3) إعادة قراءة الأسطر الشاذة بقص عمود الرمز تحديدًا."""
    try:
        from PIL import Image  # type: ignore
    except Exception:
        return
    lines = build_lines(page["words"])
    data = [ln for ln in lines if ln["amounts"] >= 2]
    if len(data) < 2:
        return
    im = Image.open(page["image"]).convert("L"); W = im.width
    tmp = tempfile.mkdtemp(prefix="code-")
    def code_cells(ln):
        return [c for c in ln["cells"] if c["num"] and not is_amount(c["text"])]
    reads = {}
    for i, ln in enumerate(data):
        h = ln["bottom"] - ln["top"]
        right_text = max((c["x1"] for c in ln["cells"] if not c["num"]), default=None)
        cc = [c for c in code_cells(ln) if right_text is None or c["x0"] >= right_text - h]
        if cc and re.match(r"^\d{3,15}$", cc[0]["text"]):
            reads[i] = (cc[0]["text"], cc[0]["x0"], cc[0]["x1"]); continue
        if right_text is None:
            continue
        box = (int(max(0, right_text - h * 0.3)), int(max(0, ln["top"] - h * 0.3)), int(min(W, right_text + h * 9)), int(ln["bottom"] + h * 0.3))
        t = _ocr_code(im, box, tmp, i)
        if t:
            reads[i] = (t, box[0], box[2])
    if not reads:
        return
    # (2) حدود عمود الرمز: يبدأ بعد نهاية عمود الاسم (الوسيط عبر الأسطر، مقاوم لتشويش OCR) وينتهي عند أقصى يمين القراءات
    rights = sorted(max(c["x1"] for c in ln["cells"] if not c["num"]) for ln in data if any(not c["num"] for c in ln["cells"]))
    name_right = rights[len(rights) // 2] if rights else min(v[1] for v in reads.values())
    code_right = max(v[2] for v in reads.values())
    for i, ln in enumerate(data):
        h = ln["bottom"] - ln["top"]
        box = (int(name_right + h * 0.12), int(max(0, ln["top"] - h * 0.3)), int(min(W, code_right + h * 0.6)), int(ln["bottom"] + h * 0.3))
        if box[2] - box[0] < h:
            continue
        t = _ocr_code(im, box, tmp, f"b{i}")
        if t:
            reads[i] = (t, box[0], box[2])
    # استبدال رموز السطر بالقراءة النهائية
    for i, ln in enumerate(data):
        if i not in reads:
            continue
        code, x0, x1 = reads[i]
        h = ln["bottom"] - ln["top"]
        page["words"] = [w for w in page["words"] if not (is_numeric(w["text"]) and not is_amount(w["text"]) and w["x1"] > x0 - h and w["top"] < ln["bottom"] and w["bottom"] > ln["top"])]
        page["words"].append({"x0": x0, "x1": x1, "top": ln["top"], "bottom": ln["bottom"], "text": code, "conf": 90})


def ocr_pdf(path):
    tmp = tempfile.mkdtemp(prefix="ocr-")
    subprocess.run(["pdftoppm", "-r", "300", "-png", path, os.path.join(tmp, "p")], check=True, timeout=600)
    pages, confs = [], []
    for i, f in enumerate(sorted(x for x in os.listdir(tmp) if x.endswith(".png"))[:100]):
        pg, c = ocr_image(os.path.join(tmp, f), i + 1)
        pages.append(pg); confs.extend(c)
    return pages, confs


# ---------------------------------------------------------------- تصحيح الاتجاه
MIRROR = str.maketrans("()[]{}<>", ")(][}{><")


def fix_visual_arabic(pages, allow_reverse=True):
    """بعض المولدات تخزن الحروف العربية بترتيب بصري (معكوس). نكتشف ذلك بإحصاء "ال" في بداية الكلمات مقابل "لا" في نهايتها.
    العكس يتم على أشكال العرض الأصلية قبل التطبيع (NFKC) حتى لا تنقلب ليغاتشر "لا" إلى "ال"."""
    fwd = rev = 0
    for p in pages:
        for w in p["words"]:
            t = unicodedata.normalize("NFKC", w["text"])
            if AR.search(t) and len(t) > 3:
                if t.startswith("ال"): fwd += 1
                if t.endswith("لا"): rev += 1
    reverse = allow_reverse and rev > fwd and rev >= 3
    for p in pages:
        for w in p["words"]:
            if reverse and AR.search(w["text"]) and not any(ch.isdigit() for ch in w["text"]):
                w["text"] = w["text"][::-1].translate(MIRROR)
            w["text"] = unicodedata.normalize("NFKC", w["text"])
            w["ar"] = bool(AR.search(w["text"]))
    return reverse


# ---------------------------------------------------------------- الأسطر والخلايا
def build_lines(words):
    if not words:
        return []
    hs = [w["bottom"] - w["top"] for w in words if w["bottom"] > w["top"]]
    h = statistics.median(hs) if hs else 10
    ws = sorted(words, key=lambda w: (w["top"] + w["bottom"]) / 2)
    lines, cur, cy = [], [], None
    for w in ws:
        c = (w["top"] + w["bottom"]) / 2
        if cur and abs(c - cy) > h * 0.55:
            lines.append(cur); cur = []
        cur.append(w)
        cy = c if len(cur) == 1 else (cy * (len(cur) - 1) + c) / len(cur)
    if cur:
        lines.append(cur)
    out = []
    for ln in lines:
        ln = sorted(ln, key=lambda w: -w["x1"])  # من اليمين إلى اليسار
        cells = []
        for w in ln:
            num = is_numeric(w["text"])
            if cells:
                prev = cells[-1]
                gap = prev["x0"] - w["x1"]
                if not num and not prev["num"] and gap < h * 0.9:
                    prev["toks"].append(w); prev["x0"] = min(prev["x0"], w["x0"]); continue
                if w["text"] in ("-", "–") and gap < h * 0.9:  # فاصل نطاق تاريخ
                    prev["text"] += " -"; prev["x0"] = min(prev["x0"], w["x0"]); prev["num"] = False; continue
                if prev["text"].endswith(" -") and gap < h * 0.9:
                    prev["text"] += " " + w["text"]; prev["x0"] = min(prev["x0"], w["x0"]); continue
            cells.append({"x0": w["x0"], "x1": w["x1"], "text": w["text"], "num": num, "toks": [w]})
        for c in cells:  # داخل الخلية النصية: مقاطع لاتينية/رقمية متتالية تُقرأ من اليسار لليمين
            toks = c.pop("toks")
            if len(toks) > 1 and not c["num"]:
                seq, run = [], []
                flip = lambda r: r[::-1] if any(re.search(r"[A-Za-z]", t["text"]) for t in r) else r  # اللاتيني يُقرأ LTR؛ الأرقام المتتالية تبقى RTL
                for t in toks:
                    if t.get("ar", bool(AR.search(t["text"]))):
                        seq += flip(run) + [t]; run = []
                    else:
                        run.append(t)
                seq += flip(run)
                c["text"] = " ".join(t["text"] for t in seq)
        top = min(w["top"] for w in ln); bottom = max(w["bottom"] for w in ln)
        out.append({"y": (top + bottom) / 2, "top": top, "bottom": bottom, "cells": cells,
                    "amounts": sum(1 for c in cells if is_amount(c["text"]))})
    return out


def build_bands(data_lines):
    """أعمدة من أسطر البيانات: تُدمج فترات الخلايا المتداخلة من النوع نفسه (رقمي/نصي)."""
    bands = []
    for kind in (True, False):
        iv = sorted(((c["x0"], c["x1"]) for ln in data_lines for c in ln["cells"] if c["num"] == kind), key=lambda t: t[0])
        merged = []
        for a, b in iv:
            if merged and a <= merged[-1][1] + 0.5:
                merged[-1][1] = max(merged[-1][1], b)
            else:
                merged.append([a, b])
        for a, b in merged:
            n = sum(1 for ln in data_lines for c in ln["cells"] if c["num"] == kind and c["x0"] < b and c["x1"] > a)
            if n >= max(2, len(data_lines) * 0.15):
                bands.append({"x0": a, "x1": b, "num": kind})
    bands.sort(key=lambda b: -(b["x0"] + b["x1"]) / 2)  # ترتيب الأعمدة من اليمين لليسار (اتجاه الوثيقة العربية)
    return bands


def band_of(cell, bands, prefer_right=True):
    best, bo = None, 0.0
    for i, b in enumerate(bands):
        ov = min(cell["x1"], b["x1"]) - max(cell["x0"], b["x0"])
        if ov > 0 and b["num"] == cell.get("num"):
            ov = ov * 3 + 1  # تفضيل العمود من النوع نفسه (رقمي/نصي) عند التداخل
        if ov > bo + (0.01 if prefer_right else 0):
            best, bo = i, ov
    if best is None:  # بلا تداخل: الأقرب
        cx = (cell["x0"] + cell["x1"]) / 2
        best = min(range(len(bands)), key=lambda i: abs((bands[i]["x0"] + bands[i]["x1"]) / 2 - cx)) if bands else None
    return best


def reconstruct(pages):
    all_lines = []
    for p in pages:
        for ln in build_lines(p["words"]):
            ln["page"] = p["page"]; all_lines.append(ln)
    data = [ln for ln in all_lines if ln["amounts"] >= 2]
    if len(data) < 2:
        return None, ["لم تُكتشف أسطر بيانات رقمية كافية لإعادة بناء الجدول"]
    bands = build_bands(data)
    if len(bands) < 3:
        return None, ["تعذر تحديد أعمدة الجدول من مواضع الكلمات"]
    warnings = []
    gaps = []
    for p in sorted(set(ln["page"] for ln in data)):
        ys = [ln["y"] for ln in data if ln["page"] == p]
        gaps += [b - a for a, b in zip(ys, ys[1:])]
    spacing = statistics.median(gaps) if gaps else 20

    # --- العناوين: أسطر فوق أول سطر بيانات في الصفحة الأولى، متقاربة رأسيًا
    first_page = data[0]["page"]
    page_lines = [ln for ln in all_lines if ln["page"] == first_page]
    first_idx = page_lines.index(data[0])
    header_lines, prev_y = [], data[0]["y"]
    for ln in reversed(page_lines[:first_idx]):
        if prev_y - ln["y"] > spacing * 1.3:
            break
        header_lines.insert(0, ln); prev_y = ln["y"]
    logical, cur, last_y = [], [], None
    for ln in header_lines:
        if cur and ln["y"] - last_y > spacing * 0.8:
            logical.append(cur); cur = []
        cur.append(ln); last_y = ln["y"]
    if cur:
        logical.append(cur)
    header_rows = []
    for group in logical:
        row = [""] * len(bands)
        for ln in group:
            for c in ln["cells"]:
                bi = band_of({**c, "num": None}, bands)
                if bi is not None:
                    row[bi] = (row[bi] + " " + c["text"]).strip()
        header_rows.append(row)
    if not header_rows:
        header_rows = [[""] * len(bands)]
    # أعمدة بلا عنوان: استنتاج من المحتوى (رمز الحساب / اسم الحساب)
    last = header_rows[-1]
    inferred = []
    for bi, b in enumerate(bands):
        if any(r[bi] for r in header_rows):
            continue
        vals = [c["text"] for ln in data for c in ln["cells"] if band_of(c, bands) == bi]
        if not vals:
            continue
        ints = sum(1 for v in vals if re.match(r"^[\d٠-٩]{2,15}$", v))
        texts = sum(1 for v in vals if AR.search(v) or re.search(r"[A-Za-z]{3,}", v))
        if ints >= len(vals) * 0.6 and "رمز الحساب" not in last:
            last[bi] = "رمز الحساب"; inferred.append("رمز الحساب")
        elif texts >= len(vals) * 0.5 and "اسم الحساب" not in last:
            last[bi] = "اسم الحساب"; inferred.append("اسم الحساب")
    if inferred:
        warnings.append("أعمدة بلا عنوان في الملف، استُنتجت من محتواها: " + "، ".join(inferred) + ". تحقق من الربط.")

    # --- البيانات: أسطر البيانات مع دمج أسطر الاسم المكسورة القريبة
    data_set = set(id(ln) for ln in data)
    text_bands = [i for i, b in enumerate(bands) if not b["num"]]
    rows_by_line = {}
    for ln in data:
        row = [""] * len(bands)
        assigned = [(band_of(c, bands), c) for c in ln["cells"]]
        numeric_hit = {bi for bi, c in assigned if bi is not None and c["num"]}
        for bi, c in assigned:
            if bi is None:
                continue
            if bands[bi]["num"] and not c["num"] and bi in numeric_hit:
                continue  # تشويش نصي داخل عمود رقمي بجانب رقم صحيح
            row[bi] = (row[bi] + " " + c["text"]).strip()
        rows_by_line[id(ln)] = row
    header_ids = set(id(ln) for ln in header_lines)
    for p in sorted(set(ln["page"] for ln in all_lines)):
        pl = [ln for ln in all_lines if ln["page"] == p]
        dl = [ln for ln in pl if id(ln) in data_set]
        if not dl:
            continue
        for ln in pl:
            if id(ln) in data_set or id(ln) in header_ids or ln["amounts"] > 0:
                continue
            if ln["y"] < dl[0]["y"] - spacing * 0.6 or ln["y"] > dl[-1]["y"] + spacing * 0.6:
                continue  # ترويسة/تذييل/رقم صفحة
            cand = min(dl, key=lambda d: abs(d["y"] - ln["y"]))
            if abs(cand["y"] - ln["y"]) > spacing * 0.9:
                continue
            for c in ln["cells"]:
                bi = band_of(c, bands)
                if bi is not None and bi in text_bands:
                    r = rows_by_line[id(cand)]
                    r[bi] = (r[bi] + " " + c["text"]).strip() if ln["y"] > cand["y"] else (c["text"] + " " + r[bi]).strip()
    rows = header_rows + [rows_by_line[id(ln)] for ln in data]
    return rows, warnings


def main(path):
    out = {"method": "pdf-text", "pages": [], "tables": [], "warnings": [], "confidence": 0.9}
    ext = os.path.splitext(path)[1].lower()
    try:
        if ext in (".png", ".jpg", ".jpeg", ".tif", ".tiff"):
            pg, confs = ocr_image(path, 1)
            pages = [pg]; out["method"] = "ocr"
            out["confidence"] = round(statistics.mean(confs) / 100, 2) if confs else 0.5
        else:
            pages = pdf_words(path)
            chars = sum(len(p["text"].strip()) for p in pages)
            if chars < 20:
                pages, confs = ocr_pdf(path)
                out["method"] = "ocr"
                out["confidence"] = round(statistics.mean(confs) / 100, 2) if confs else 0.5
                out["warnings"].append("الملف ممسوح ضوئيًا: قُرئ بالتعرف الضوئي (OCR)؛ راجع الأرقام قبل الاعتماد.")
    except RuntimeError as e:
        print(json.dumps({"method": "needs_ocr", "pages": [], "tables": [], "warnings": [str(e)]}, ensure_ascii=False)); return
    except Exception as e:
        print(json.dumps({"method": "error", "error": str(e)}, ensure_ascii=False)); return
    if fix_visual_arabic(pages, allow_reverse=out["method"] == "pdf-text"):
        out["warnings"].append("النص العربي في الملف مخزن بترتيب بصري معكوس؛ صُحّح تلقائيًا.")
    out["pages"] = [{"page": p["page"], "text": " ".join(w["text"] for w in sorted(p["words"], key=lambda w: (round(w["top"] / 4), -w["x1"])))} for p in pages]
    rows, warns = reconstruct(pages)
    out["warnings"] += warns
    if rows:
        out["tables"].append({"name": "جدول معاد بناؤه من المواضع", "page": pages[0]["page"], "rows": rows})
    # جداول pdfplumber الشبكية (إن وجدت خطوط) كبديل للمقارنة
    if out["method"] == "pdf-text":
        try:
            import pdfplumber  # type: ignore
            with pdfplumber.open(path) as pdf:
                for i, page in enumerate(pdf.pages[:300]):
                    for t in page.extract_tables() or []:
                        rws = [[unicodedata.normalize("NFKC", (c or "").strip()) for c in row] for row in t if row]
                        rws = [r for r in rws if any(r)]
                        if len(rws) >= 3:
                            out["tables"].append({"name": f"جدول شبكي (ص{i + 1})", "page": i + 1, "rows": rws})
        except Exception:
            pass
    if not out["tables"] and out["method"] == "ocr" and not any(p["words"] for p in pages):
        out["method"] = "needs_ocr"; out["warnings"].append("لم يُتعرف على نص في الصورة.")
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"method": "error", "error": "missing path"})); sys.exit(1)
    main(sys.argv[1])
