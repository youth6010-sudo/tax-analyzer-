"""Dump 해밀한의원 PDF page."""
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader  # type: ignore

pdf = Path(r"C:\Users\찰리\Desktop\2026년 거래처원장.pdf")
out = Path(__file__).with_name(".haemil-pdf.txt")
reader = PdfReader(str(pdf))
parts = []
for i, page in enumerate(reader.pages):
    t = page.extract_text() or ""
    if "해밀" in t or "01220" in t:
        parts.append(f"\n===== PAGE {i+1} =====\n")
        parts.append(t)
        parts.append("\n")
out.write_text("".join(parts), encoding="utf-8")
print("wrote", out)
