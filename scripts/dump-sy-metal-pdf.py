"""Dump 에스와이메탈 from 2025/2026 PDFs."""
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader  # type: ignore

out = Path(__file__).with_name(".sy-metal-pdf.txt")
parts = []
for name in ("2025년 거래처 원장.pdf", "2026년 거래처원장.pdf"):
    pdf = Path(r"C:\Users\찰리\Desktop") / name
    if not pdf.exists():
        parts.append(f"MISSING {pdf}\n")
        continue
    reader = PdfReader(str(pdf))
    parts.append(f"\n######## {name} ########\n")
    for i, page in enumerate(reader.pages):
        t = page.extract_text() or ""
        if "에스와이" in t or "[00176]" in t:
            parts.append(f"\n===== {name} PAGE {i+1} =====\n")
            parts.append(t)
            parts.append("\n")
out.write_text("".join(parts), encoding="utf-8")
print("wrote", out)
