"""Dump PDF pages for 삼양/상담/김영균."""
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader  # type: ignore

pdf = Path(r"C:\Users\찰리\Desktop\2026년 거래처원장.pdf")
out = Path(__file__).with_name(".samyang-counsel-pdf.txt")
needles = ("삼양", "김장현", "김정애", "상담", "김영균", "의사")
reader = PdfReader(str(pdf))
parts = []
for i, page in enumerate(reader.pages):
    t = page.extract_text() or ""
    if not any(n in t for n in needles):
        continue
    # prefer company header pages
    if "거래처명" not in t and "삼양-" not in t and "김영균" not in t and "의사" not in t:
        continue
    parts.append(f"\n===== PAGE {i+1} =====\n")
    parts.append(t)
    parts.append("\n")
out.write_text("".join(parts), encoding="utf-8")
print("wrote", out, "pages", len(parts) // 3)
