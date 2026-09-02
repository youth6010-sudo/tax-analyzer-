#!/usr/bin/env python3
"""
거래처원장(총괄내용) PDF → JSON
Usage: python scripts/parse-ledger-detail-pdf.py "c:\\...\\A4-....pdf"
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pdf_page_text import iter_pdf_page_texts

try:
    from pypdf import PdfReader
except ImportError:
    from PyPDF2 import PdfReader  # type: ignore

HEADER_RE = re.compile(r"거래처명\s*:\s*\[(\d+)\]\s*(.+)")
DATE_RE = re.compile(r"^(\d{2})-(\d{2})$")
MONEY_RE = re.compile(r"^-?[\d,]+$")
SKIP_MARKERS = ("[월", "[누", "[전", "일자", "코드", "계정과목", "적", "차", "대", "거래처 원장", "회사명", "0108:외상")

CHARGE_KEYS = (
    "기장",
    "조정",
    "성실",
    "수수료",
    "컨설팅",
    "양수도",
    "기타",
    "매출",
    "세무",
    "기말",
    "중간",
    "결산",
)


def is_money(s: str) -> bool:
    return bool(MONEY_RE.match(s.replace(" ", "")))


def parse_money(s: str) -> int:
    return int(s.replace(",", "").replace(" ", "").strip() or "0")


def is_skip_line(s: str) -> bool:
    t = s.strip()
    if not t:
        return True
    for m in SKIP_MARKERS:
        if t.startswith(m) or m in t and t.startswith("["):
            return True
    if t in ("외상매출금", "0108"):
        return False
    return False


def is_charge_desc(desc: str) -> bool:
    """차변(청구) 적요 여부. 이름+기장료/부가세신고 등은 대변 입금."""
    d = desc.replace(" ", "")
    if not d:
        return False
    # 입금 적요: 이름+부가세/부가세신고 (이기균김유리부가세)
    # 「24년 7월 부가세신고」「1월 부가세신고」 같은 청구는 제외
    if not re.match(r"^(\d{1,2}월|\d{2}년|\d{2}\.|20\d{2}|기타|부가|법인|개인|성실|세무|컨설팅)", d):
        if d.endswith("부가세신고") and not d.startswith("부가세"):
            return False
        if d.endswith("부가세") and not d.startswith("부가세"):
            return False
        if re.search(r".+다산신고$", d):
            return False
        # 입금 적요: 송원미1월기장료 / 홍길동기장료 (표준「N월 기장수수료」와 구분)
        if re.search(r"\d{1,2}월기장", d) or re.search(r"(기장료|기장수수료)$", d):
            if re.match(r"^[가-힣A-Za-z(]", d):
                return False
    # 반환·환불 적요는 입금이 아니라 차변(AR 복구)인 경우가 많음
    if "반환" in d or "환불" in d:
        return True
    if any(k in d for k in CHARGE_KEYS):
        return True
    if d.startswith("부가세") or d in ("부가세신고", "신고수수료", "신고대리"):
        return True
    if "신고" in d:  # 사업장현황신고·수정신고 등 → 청구
        return True
    if "대리" in d and ("수수료" in d or "신고" in d):
        return True
    return False


def is_carry_header(ln: str) -> bool:
    c = ln.replace(" ", "")
    return "전기이월" in c or bool(re.search(r"\[전.*이월", ln))


def is_month_total_header(ln: str) -> bool:
    c = ln.replace(" ", "")
    return c.startswith("[월") and "계" in c


def is_cum_total_header(ln: str) -> bool:
    c = ln.replace(" ", "")
    return c.startswith("[누") and "계" in c


def named_prefer_debit(desc: str) -> bool:
    """삼양-김장현·이관·대체 등 → 차변 쪽 선호. 일반 입금적요(이름)는 대변."""
    d = desc.replace(" ", "")
    if not d or d in ("입금", "외상매출", "전기이월"):
        return False
    if "-" in d or "－" in d or "—" in d:
        return True
    if any(k in d for k in ("양수도", "대체", "이관", "이동", "잔액이관", "반환")):
        return True
    return False


def reconcile_month_kinds(
    month_txs: list[dict], debit_target: int, credit_target: int
) -> None:
    """월계(차변/대변)에 맞게 모호한 적요의 kind를 뒤집음."""
    if not month_txs:
        return

    def sums(items: list[dict]) -> tuple[int, int]:
        d = sum(t["amount"] for t in items if t["kind"] == "debit")
        c = sum(t["amount"] for t in items if t["kind"] == "credit")
        return d, c

    cur_d, cur_c = sums(month_txs)
    if cur_d == debit_target and cur_c == credit_target:
        return

    # 확정 청구(기장·조정 등)는 유지. 입금·이름적요만 후보
    candidates: list[int] = []
    for i, t in enumerate(month_txs):
        desc = str(t.get("description") or "")
        if t.get("kind") == "credit" and desc.endswith("(취소)"):
            continue
        if desc == "전기이월":
            continue
        if is_charge_desc(desc) and desc not in ("입금", "외상매출"):
            continue
        candidates.append(i)

    from itertools import combinations

    best: list[dict] | None = None
    best_score = -10**9
    n = len(candidates)
    if n > 14:
        return

    for k in range(0, n + 1):
        for combo in combinations(candidates, k):
            trial = [dict(t) for t in month_txs]
            for i in combo:
                trial[i]["kind"] = "credit" if trial[i]["kind"] == "debit" else "debit"
                d0 = str(trial[i].get("description") or "")
                if trial[i]["kind"] == "credit" and d0 in ("외상매출", ""):
                    trial[i]["description"] = "입금"
                elif trial[i]["kind"] == "debit" and d0 == "입금":
                    trial[i]["description"] = "외상매출"
            d, c = sums(trial)
            if d != debit_target or c != credit_target:
                continue
            score = 0
            for t in trial:
                desc = str(t.get("description") or "")
                if desc == "입금" and t["kind"] == "credit":
                    score += 5
                if desc == "외상매출" and t["kind"] == "debit":
                    score += 1
                if (
                    is_charge_desc(desc)
                    and desc != "외상매출"
                    and t["kind"] == "debit"
                ):
                    score += 5
                # 삼양-김장현 형 → 차변, 김영균·의사급여상담 형 → 대변
                if desc not in ("입금", "외상매출", "전기이월") and not (
                    is_charge_desc(desc) and desc != "외상매출"
                ):
                    if t["kind"] == "debit" and named_prefer_debit(desc):
                        score += 10
                    if t["kind"] == "credit" and not named_prefer_debit(desc):
                        score += 10
            score -= k
            if score > best_score:
                best_score = score
                best = trial

    if best is None:
        return
    for i, t in enumerate(best):
        month_txs[i]["kind"] = t["kind"]
        month_txs[i]["description"] = t["description"]


def parse_page_text(text: str, year: int = 2026) -> dict | None:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    code = ""
    company = ""
    for ln in lines:
        m = HEADER_RE.search(ln.replace(" ", ""))
        if not m:
            m = re.search(r"거래처명\s*:\s*\[(\d+)\]\s*(.+)", ln)
        if m:
            code = m.group(1).zfill(5) if len(m.group(1)) <= 5 else m.group(1)
            # normalize code to 5 digits when numeric
            raw = m.group(1)
            code = raw.zfill(5) if raw.isdigit() and len(raw) <= 5 else raw
            company = m.group(2).strip()
            break
    if not code:
        return None

    txs: list[dict] = []
    pending_month: list[dict] = []
    running_debit = 0
    running_credit = 0
    i = 0
    while i < len(lines):
        ln = lines[i]

        # [월 계] + 차변/대변 → 당월 pending kind 보정
        if is_month_total_header(ln):
            j = i + 1
            nums: list[int] = []
            while j < len(lines) and is_money(lines[j]) and len(nums) < 2:
                nums.append(abs(parse_money(lines[j])))
                j += 1

            # 누계 peek — 월계가 한 칸만 있을 때 차/대 판별(인화 8월 대변만 등)
            cum_d: int | None = None
            cum_c: int | None = None
            k = j
            if k < len(lines) and is_cum_total_header(lines[k]):
                k += 1
                cnums: list[int] = []
                while k < len(lines) and is_money(lines[k]) and len(cnums) < 2:
                    cnums.append(abs(parse_money(lines[k])))
                    k += 1
                if len(cnums) >= 2:
                    cum_d, cum_c = cnums[0], cnums[1]
                elif len(cnums) == 1:
                    cum_d, cum_c = cnums[0], running_credit

            if len(nums) >= 2:
                debit_t, credit_t = nums[0], nums[1]
            elif len(nums) == 1 and cum_d is not None and cum_c is not None:
                amt = nums[0]

                def month_sums(items: list[dict]) -> tuple[int, int]:
                    d = sum(t["amount"] for t in items if t["kind"] == "debit")
                    c = sum(t["amount"] for t in items if t["kind"] == "credit")
                    return d, c

                pick: tuple[int, int] | None = None
                for trial_d, trial_c in ((amt, 0), (0, amt)):
                    trial = [dict(t) for t in pending_month]
                    reconcile_month_kinds(trial, trial_d, trial_c)
                    md, mc = month_sums(trial)
                    if running_debit + md == cum_d and running_credit + mc == cum_c:
                        pick = (trial_d, trial_c)
                        break
                if pick is None:
                    # 휴리스틱 합이 이미 월계 한쪽에 맞으면 그쪽
                    md0, mc0 = month_sums(pending_month)
                    if md0 == amt and mc0 == 0:
                        pick = (amt, 0)
                    elif mc0 == amt and md0 == 0:
                        pick = (0, amt)
                    else:
                        pick = (amt, 0)  # 기본: 차변만(기존 동작)
                debit_t, credit_t = pick
            elif len(nums) == 1:
                debit_t, credit_t = nums[0], 0
            else:
                debit_t, credit_t = 0, 0

            reconcile_month_kinds(pending_month, debit_t, credit_t)
            running_debit += sum(
                t["amount"] for t in pending_month if t["kind"] == "debit"
            )
            running_credit += sum(
                t["amount"] for t in pending_month if t["kind"] == "credit"
            )
            pending_month = []
            i = j
            continue

        if is_cum_total_header(ln):
            # skip following money lines
            j = i + 1
            while j < len(lines) and is_money(lines[j]):
                j += 1
            i = j
            continue

        # [전 기 이 월] + 금액 → 차변 전기이월
        if is_carry_header(ln):
            j = i + 1
            if j < len(lines) and is_money(lines[j]):
                amt = parse_money(lines[j])
                if amt > 0:
                    row = {
                        "eventDate": f"{year}-01-01",
                        "description": "전기이월",
                        "amount": amt,
                        "kind": "debit",
                    }
                    txs.append(row)
                    pending_month.append(row)
                i = j + 1
                continue
            i += 1
            continue

        dm = DATE_RE.match(ln)
        if not dm:
            i += 1
            continue
        mm, dd = dm.group(1), dm.group(2)
        event_date = f"{year}-{mm}-{dd}"
        # expect 0108 / 외상매출금
        j = i + 1
        if j < len(lines) and lines[j] == "0108":
            j += 1
        if j < len(lines) and lines[j] == "외상매출금":
            j += 1
        if j >= len(lines):
            break

        desc = ""
        amount = 0
        if is_money(lines[j]):
            amount = parse_money(lines[j])
            j += 1
        else:
            # description then amount (maybe)
            if not lines[j].startswith("[") and not DATE_RE.match(lines[j]):
                desc = lines[j]
                j += 1
            if j < len(lines) and is_money(lines[j]):
                amount = parse_money(lines[j])
                j += 1
            else:
                i = j
                continue

        if amount == 0:
            i = j
            continue

        # 차변 음수(예: 법인조정료 -3,300,000) = 취소 → 대변
        signed = amount
        amount = abs(amount)

        if signed < 0:
            kind = "credit"
            if desc and "취소" not in desc:
                desc = f"{desc} (취소)"
            elif not desc:
                desc = "취소"
        elif is_charge_desc(desc):
            kind = "debit"
        elif not desc:
            # bare amount after 외상매출금 → 입금(대변)
            kind = "credit"
        else:
            # 상호명·입금적요 → 대변 (월계로 보정 가능)
            kind = "credit"

        row = {
            "eventDate": event_date,
            "description": desc or ("입금" if kind == "credit" else "외상매출"),
            "amount": amount,
            "kind": kind,
        }
        txs.append(row)
        pending_month.append(row)
        i = j

    return {
        "externalCode": code,
        "companyName": company,
        "txs": txs,
    }


def main() -> None:
    if len(sys.argv) < 2:
        print("{}", end="")
        sys.exit(1)
    path = Path(sys.argv[1])
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    if not path.exists():
        err = {"error": f"missing {path}"}
        text = json.dumps(err, ensure_ascii=False)
        if out_path:
            out_path.write_text(text, encoding="utf-8")
        else:
            print(text)
        sys.exit(1)

    page_texts = iter_pdf_page_texts(path)
    year_guess = 2026
    fm = re.search(r"(20\d{2})", path.name)
    if fm:
        year_guess = int(fm.group(1))
    by_code: dict[str, dict] = {}
    for text in page_texts:
        ym = re.search(r"(20\d{2})\.01\.01", text.replace(" ", ""))
        year = int(ym.group(1)) if ym else year_guess
        parsed = parse_page_text(text, year=year)
        if not parsed:
            continue
        code = parsed["externalCode"]
        if code not in by_code:
            by_code[code] = {
                "externalCode": code,
                "companyName": parsed["companyName"],
                "txs": [],
            }
        else:
            if len(parsed["companyName"]) > len(by_code[code]["companyName"]):
                by_code[code]["companyName"] = parsed["companyName"]
        by_code[code]["txs"].extend(parsed["txs"])

    companies = list(by_code.values())
    total_tx = sum(len(c["txs"]) for c in companies)
    out = {
        "companies": companies,
        "companyCount": len(companies),
        "txCount": total_tx,
        "debitCount": sum(1 for c in companies for t in c["txs"] if t["kind"] == "debit"),
        "creditCount": sum(1 for c in companies for t in c["txs"] if t["kind"] == "credit"),
    }
    text = json.dumps(out, ensure_ascii=False)
    if out_path:
        out_path.write_text(text, encoding="utf-8")
    else:
        # avoid Windows console encoding issues
        sys.stdout.buffer.write(text.encode("utf-8"))


if __name__ == "__main__":
    main()
