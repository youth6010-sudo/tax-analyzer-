"""PDF 페이지별 텍스트 추출 — PyMuPDF 우선(줄바꿈 유지), 없으면 pypdf."""
from __future__ import annotations

from pathlib import Path


def iter_pdf_page_texts(path: str | Path) -> list[str]:
    p = str(path)
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(p)
        texts = [doc[i].get_text() for i in range(doc.page_count)]
        doc.close()
        if any(t.strip() for t in texts):
            return texts
    except Exception:
        pass

    try:
        from pypdf import PdfReader
    except ImportError:
        from PyPDF2 import PdfReader  # type: ignore

    reader = PdfReader(p)
    return [page.extract_text() or "" for page in reader.pages]
