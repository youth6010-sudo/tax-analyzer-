"""국세청 사업자등록정보 진위확인 및 상태조회 (공공데이터포털 무료 Open API) 연동.

- 상태조회: 사업자번호로 휴업/폐업 여부, 과세유형, 폐업일자 조회
- 진위확인: 사업자번호+개업일자+대표자명이 국세청 자료와 일치하는지 확인

준비물:
  1) https://www.data.go.kr 에서 "국세청_사업자등록정보 진위확인 및 상태조회 서비스" 활용신청(무료)
  2) 발급받은 '일반 인증키(Decoding)'를 .env 파일에 NTS_API_KEY=... 형태로 저장

입력:
  - 사업자번호.txt (한 줄에 하나, '-' 있어도 자동 제거) 또는
  - 정리된_회계데이터.xlsx 에 '사업자번호' 컬럼이 있으면 그것을 사용
출력:
  - 사업자검증결과.xlsx
"""

import os
import re

import requests
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

# data.go.kr 에서 발급받은 '일반 인증키(Decoding)'
NTS_API_KEY = os.getenv("NTS_API_KEY")

STATUS_URL = "https://api.odcloud.kr/api/nts-businessman/v1/status"
VALIDATE_URL = "https://api.odcloud.kr/api/nts-businessman/v1/validate"

# 입출력 파일
BIZNO_TXT = "사업자번호.txt"
EXCEL_FILE = "정리된_회계데이터.xlsx"
RESULT_FILE = "사업자검증결과.xlsx"

# 1회 호출 최대 건수 (API 제한)
BATCH_SIZE = 100


def clean_bizno(value) -> str:
    """사업자번호에서 숫자만 남겨 10자리 문자열로 정리한다."""
    return re.sub(r"\D", "", str(value))


def is_valid_format(b_no: str) -> bool:
    """사업자번호 형식(숫자 10자리) 검증."""
    return len(b_no) == 10 and b_no.isdigit()


def check_status(b_no_list: list[str]) -> list[dict]:
    """사업자번호 리스트의 상태(휴업/폐업/과세유형 등)를 조회한다."""
    if not NTS_API_KEY:
        raise ValueError(
            ".env에 NTS_API_KEY가 없습니다. data.go.kr에서 무료 키를 발급받아 등록하세요."
        )

    results: list[dict] = []
    # API 제한(1회 100건)에 맞춰 나눠서 호출
    for i in range(0, len(b_no_list), BATCH_SIZE):
        batch = b_no_list[i:i + BATCH_SIZE]
        response = requests.post(
            STATUS_URL,
            params={"serviceKey": NTS_API_KEY, "returnType": "JSON"},
            json={"b_no": batch},
            headers={"Content-Type": "application/json"},
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        results.extend(data.get("data", []))
    return results


def validate_business(businesses: list[dict]) -> list[dict]:
    """사업자 진위확인. businesses 각 항목 예:
    {"b_no": "0000000000", "start_dt": "20200101", "p_nm": "홍길동"}
    """
    if not NTS_API_KEY:
        raise ValueError(
            ".env에 NTS_API_KEY가 없습니다. data.go.kr에서 무료 키를 발급받아 등록하세요."
        )

    response = requests.post(
        VALIDATE_URL,
        params={"serviceKey": NTS_API_KEY, "returnType": "JSON"},
        json={"businesses": businesses},
        headers={"Content-Type": "application/json"},
        timeout=15,
    )
    response.raise_for_status()
    return response.json().get("data", [])


def load_biznos() -> list[str]:
    """사업자번호 입력원에서 번호 목록을 읽어온다.

    우선순위: 사업자번호.txt -> 엑셀의 '사업자번호' 컬럼
    """
    biznos: list[str] = []

    if os.path.exists(BIZNO_TXT):
        with open(BIZNO_TXT, "r", encoding="utf-8") as f:
            biznos = [clean_bizno(line) for line in f if line.strip()]
    elif os.path.exists(EXCEL_FILE):
        df = pd.read_excel(EXCEL_FILE)
        if "사업자번호" in df.columns:
            biznos = [clean_bizno(v) for v in df["사업자번호"].dropna()]

    # 형식이 올바른 번호만 반환
    return [b for b in biznos if is_valid_format(b)]


def main() -> None:
    biznos = load_biznos()
    if not biznos:
        print("조회할 사업자번호가 없습니다.")
        print(f"- '{BIZNO_TXT}'에 한 줄에 하나씩 사업자번호를 적거나,")
        print(f"- '{EXCEL_FILE}'에 '사업자번호' 컬럼을 추가하세요.")
        return

    print(f"총 {len(biznos)}건의 사업자번호를 조회합니다...")
    results = check_status(biznos)

    # 결과를 보기 좋게 정리
    rows = []
    for r in results:
        rows.append({
            "사업자번호": r.get("b_no"),
            "납세상태": r.get("b_stt") or "(미등록)",
            "상태코드": r.get("b_stt_cd"),
            "과세유형": r.get("tax_type"),
            "폐업일자": r.get("end_dt"),
        })
    df = pd.DataFrame(rows)

    df.to_excel(RESULT_FILE, index=False)
    print("-" * 50)
    print(df.to_string(index=False))
    print("-" * 50)
    print(f"완료! 결과를 '{RESULT_FILE}'로 저장했습니다.")


if __name__ == "__main__":
    main()
