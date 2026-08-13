"""Find 회생채권 / 9085750 in year PDFs."""
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader  # type: ignore

out = Path(__file__).with_name(".hoesaeng-pdf.txt")
parts = []
desk = Path(r"C:\Users\찰리\Desktop")
for name in (
    "2022년 거래처 원장.pdf",
    "2023년 거래처 원장.pdf",
    "2024년 거래처 원장.pdf",
    "2025년 거래처 원장.pdf",
    "2026년 거래처원장.pdf",
):
    pdf = desk / name
    if not pdf.exists():
        parts.append(f"MISSING {name}\n")
        continue
    reader = PdfReader(str(pdf))
    parts.append(f"\n######## {name} ########\n")
    for i, page in enumerate(reader.pages):
        t = page.extract_text() or ""
        if "회생" in t or "00234" in t or ("팀코리아" in t and "회생" in t):
            parts.append(f"\n===== {name} PAGE {i+1} =====\n")
            parts.append(t)
            parts.append("\n")
        elif "9,085,750" in t or "9085750" in t.replace(",", ""):
            parts.append(f"\n===== {name} PAGE {i+1} (amt) =====\n")
            parts.append(t)
            parts.append("\n")
out.write_text("".join(parts), encoding="utf-8")
print("wrote", out, "chars", out.stat().st_size)
