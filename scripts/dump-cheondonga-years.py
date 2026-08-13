"""Search year PDFs for 천돈가; write UTF-8 dump."""
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader  # type: ignore

desk = Path(r"C:\Users\찰리\Desktop")
out = Path(__file__).with_name(".cheondonga-pdf-dump.txt")
files = [
    desk / "2025년 거래처 원장.pdf",
    desk / "2024년 거래처 원장.pdf",
    desk / "2026년 거래처원장.pdf",
]
needles = ("천돈가", "윤삼식", "양수도")
parts = []
for f in files:
    if not f.exists():
        parts.append(f"MISSING {f}\n")
        continue
    parts.append(f"\n######## {f.name} ########\n")
    reader = PdfReader(str(f))
    for i, page in enumerate(reader.pages):
        t = page.extract_text() or ""
        if not any(n in t for n in needles):
            continue
        parts.append(f"\n===== {f.name} PAGE {i+1} =====\n")
        parts.append(t)
        parts.append("\n")
out.write_text("".join(parts), encoding="utf-8")
print("wrote", out, "chars", sum(len(p) for p in parts))
