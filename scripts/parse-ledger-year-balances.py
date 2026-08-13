#!/usr/bin/env python3
"""
연도별 거래처원장 PDF → 코드별 전기이월·기말잔액 JSON
Usage:
  python scripts/parse-ledger-year-balances.py out.json path1.pdf [path2.pdf ...]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader  # type: ignore

HEADER_RE = re.compile(r"거래처명\s*:\s*\[(\d+)\]\s*(.+)")
YEAR_RANGE_RE = re.compile(r"(20\d{2})\.01\.01\s*~\s*(20\d{2})\.12\.31")
MONEY_RE = re.compile(r"^[\d,]+$")
CARRY_RE = re.compile(r"\[전\s*기\s*이\s*월\]")
CUM_RE = re.compile(r"\[누\s*계\]")


def parse_money(s: str) -> int:
    return int(s.replace(",", "").replace(" ", "").strip() or "0")


def is_money(s: str) -> bool:
    return bool(MONEY_RE.match(s.replace(" ", "")))


def extract_year(text: str, fallback: int | None = None) -> int | None:
    m = YEAR_RANGE_RE.search(text.replace(" ", ""))
    if m:
        return int(m.group(1))
    return fallback


def parse_pdf(path: Path) -> dict:
    reader = PdfReader(str(path))
    # code -> {companyName, year, openingCarry, endingDebit, endingCredit, endingBalance}
    by_code: dict[str, dict] = {}
    year_guess: int | None = None
    # infer year from filename
    fm = re.search(r"(20\d{2})", path.name)
    if fm:
        year_guess = int(fm.group(1))

    current: dict | None = None

    for page in reader.pages:
        text = page.extract_text() or ""
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        y = extract_year(text, year_guess)
        if y:
            year_guess = y

        i = 0
        while i < len(lines):
            ln = lines[i]
            hm = HEADER_RE.search(ln.replace(" ", "")) or re.search(
                r"거래처명\s*:\s*\[(\d+)\]\s*(.+)", ln
            )
            if hm:
                raw = hm.group(1)
                code = raw.zfill(5) if raw.isdigit() and len(raw) <= 5 else raw
                company = hm.group(2).strip()
                current = by_code.get(code)
                if not current:
                    current = {
                        "externalCode": code,
                        "companyName": company,
                        "year": year_guess,
                        "openingCarry": None,
                        "endingDebit": None,
                        "endingCredit": None,
                        "endingBalance": None,
                    }
                    by_code[code] = current
                else:
                    if len(company) > len(current["companyName"]):
                        current["companyName"] = company
                    current["year"] = year_guess
                i += 1
                continue

            if current is None:
                i += 1
                continue

            if CARRY_RE.search(ln.replace(" ", "")) or "[전기이월]" in ln.replace(" ", ""):
                # next money line(s) — opening carry is debit-side
                j = i + 1
                while j < len(lines) and not is_money(lines[j]):
                    if HEADER_RE.search(lines[j].replace(" ", "")):
                        break
                    j += 1
                if j < len(lines) and is_money(lines[j]):
                    current["openingCarry"] = parse_money(lines[j])
                    i = j + 1
                    continue

            if CUM_RE.search(ln.replace(" ", "")) or "[누계]" in ln.replace(" ", ""):
                # following 1–2 money lines: debit cum, credit cum (balance ≈ debit-credit when both)
                nums: list[int] = []
                j = i + 1
                while j < len(lines) and is_money(lines[j]) and len(nums) < 2:
                    nums.append(parse_money(lines[j]))
                    j += 1
                if nums:
                    current["endingDebit"] = nums[0]
                    if len(nums) >= 2:
                        current["endingCredit"] = nums[1]
                        current["endingBalance"] = nums[0] - nums[1]
                    else:
                        # only one number — treat as running AR balance (common when credit blank)
                        current["endingCredit"] = current.get("endingCredit")
                        current["endingBalance"] = nums[0]
                    i = j
                    continue

            i += 1

    return {
        "path": str(path),
        "fileName": path.name,
        "year": year_guess,
        "companies": list(by_code.values()),
        "companyCount": len(by_code),
    }


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: parse-ledger-year-balances.py out.json pdf...", file=sys.stderr)
        sys.exit(1)
    out = Path(sys.argv[1])
    files = [Path(p) for p in sys.argv[2:]]
    years = []
    for f in files:
        if not f.exists():
            years.append({"path": str(f), "error": "missing"})
            continue
        years.append(parse_pdf(f))
    payload = {"years": years}
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(out), "years": [y.get("year") for y in years]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
