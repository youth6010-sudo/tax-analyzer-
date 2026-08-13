#!/usr/bin/env python3
"""국세청 세금계산서 발급 xls에서 녹색(신규) 행 인덱스(0-based)를 JSON으로 출력."""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import xlrd
except ImportError:
    print(json.dumps({"error": "xlrd required", "greenRows": []}), flush=True)
    sys.exit(1)


def is_green_rgb(rgb) -> bool:
    if not rgb or not isinstance(rgb, tuple) or len(rgb) < 3:
        return False
    r, g, b = rgb[0], rgb[1], rgb[2]
    return g >= 160 and g > r + 15 and g > b + 15


def green_rows(path: Path) -> list[int]:
    wb = xlrd.open_workbook(str(path), formatting_info=True)
    sh = wb.sheet_by_index(0)
    xf_list = wb.xf_list
    color_map = wb.colour_map
    out: list[int] = []
    for r in range(sh.nrows):
        for c in range(min(8, sh.ncols)):
            try:
                xf = xf_list[sh.cell_xf_index(r, c)]
                rgb = color_map.get(xf.background.pattern_colour_index)
                if is_green_rgb(rgb):
                    out.append(r)
                    break
            except Exception:
                continue
    return out


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: parse-tax-invoice-green.py <file.xls>", "greenRows": []}))
        sys.exit(2)
    path = Path(sys.argv[1])
    rows = green_rows(path)
    print(json.dumps({"file": path.name, "greenRows": rows}, ensure_ascii=False))


if __name__ == "__main__":
    main()
