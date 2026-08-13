"""Extract raw PDF text around 천돈가 / 양수도."""
from pathlib import Path
import sys

try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader  # type: ignore

pdf = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if not pdf or not pdf.exists():
    # try common desktop paths
    cands = list(Path(r"C:\Users\찰리\Desktop").glob("*거래처*원장*.pdf"))
    cands += list(Path(r"C:\Users\찰리\Desktop").glob("*2026*.pdf"))
    print("candidates:", [str(c) for c in cands])
    pdf = next((c for c in cands if "2026" in c.name), cands[0] if cands else None)
print("PDF:", pdf)
reader = PdfReader(str(pdf))
keys = ("천돈가", "양수도", "윤삼식")
for i, page in enumerate(reader.pages):
    t = page.extract_text() or ""
    if any(k in t for k in keys):
        print(f"\n===== PAGE {i+1} =====")
        print(t)
