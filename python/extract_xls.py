#!/usr/bin/env python3
"""قراءة ملفات Excel القديمة (.xls) عبر xlrd وإرجاع الأوراق كصفوف نصية JSON."""
import json
import sys


def main(path: str) -> None:
    try:
        import xlrd  # type: ignore
    except Exception as e:
        print(json.dumps({"method": "error", "error": f"xlrd غير متاح لقراءة .xls: {e}"}, ensure_ascii=False))
        return
    try:
        book = xlrd.open_workbook(path)
    except Exception as e:
        print(json.dumps({"method": "error", "error": str(e)}, ensure_ascii=False))
        return
    sheets = []
    for sh in book.sheets():
        rows = []
        for r in range(min(sh.nrows, 100000)):
            row = []
            for c in range(sh.ncols):
                cell = sh.cell(r, c)
                v = cell.value
                if cell.ctype == xlrd.XL_CELL_DATE:
                    try:
                        y, m, d, *_ = xlrd.xldate_as_tuple(v, book.datemode)
                        v = f"{y:04d}-{m:02d}-{d:02d}"
                    except Exception:
                        v = str(v)
                elif cell.ctype == xlrd.XL_CELL_NUMBER:
                    v = repr(v) if v != int(v) else str(int(v))
                elif cell.ctype == xlrd.XL_CELL_EMPTY:
                    v = ""
                else:
                    v = str(v)
                row.append(v)
            rows.append(row)
        sheets.append({"name": sh.name, "rows": rows})
    print(json.dumps({"method": "xls", "sheets": sheets}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
