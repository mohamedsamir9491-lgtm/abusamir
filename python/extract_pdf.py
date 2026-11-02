#!/usr/bin/env python3
"""استخراج النص والجداول من PDF نصي. يُستدعى من الخادم عبر child_process.
الاستخدام: python3 -I extract_pdf.py <file.pdf>
الناتج JSON: {"method": "pdf-text"|"needs_ocr", "pages": [...], "tables": [...], "warnings": [...]}
"""
import json
import sys


def main(path: str) -> None:
    out = {"method": "pdf-text", "pages": [], "tables": [], "warnings": []}
    try:
        import pdfplumber  # type: ignore
    except Exception as e:  # pragma: no cover
        print(json.dumps({"method": "error", "error": f"pdfplumber غير متاح: {e}"}, ensure_ascii=False))
        return
    total_chars = 0
    try:
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages[:300]):
                text = page.extract_text() or ""
                total_chars += len(text.strip())
                out["pages"].append({"page": i + 1, "text": text})
                try:
                    for t in page.extract_tables() or []:
                        rows = [[(c if c is not None else "").strip() for c in row] for row in t if row]
                        rows = [r for r in rows if any(c for c in r)]
                        if rows:
                            out["tables"].append({"page": i + 1, "rows": rows})
                except Exception as te:  # pragma: no cover
                    out["warnings"].append(f"تعذر استخراج جدول من الصفحة {i + 1}: {te}")
    except Exception as e:
        print(json.dumps({"method": "error", "error": str(e)}, ensure_ascii=False))
        return
    if total_chars < 20:
        out["method"] = "needs_ocr"
        out["warnings"].append("الملف لا يحتوي على نص قابل للاستخراج (ممسوح ضوئيًا). يتطلب OCR.")
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"method": "error", "error": "missing path"}))
        sys.exit(1)
    main(sys.argv[1])
