import os
import json
import time
from datetime import date

import pandas as pd
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise ValueError(".env 파일에서 GEMINI_API_KEY를 찾을 수 없습니다.")

genai.configure(api_key=API_KEY)

model = genai.GenerativeModel("gemini-2.5-flash")


def extract_transaction(text: str) -> dict:
    """결제 관련 텍스트를 Gemini로 분석해 거래 정보를 딕셔너리로 반환한다.

    추출 항목: 거래일자, 거래처명, 결제금액, 적요
    """
    prompt = f"""
다음 텍스트는 결제/영수증 관련 메모입니다. 내용을 분석해서 아래 항목을 추출하세요.
오늘 날짜는 {date.today().isoformat()} 입니다.

- 거래일자: YYYY-MM-DD 형식. 연도 정보가 없으면 오늘 날짜 기준으로 추정.
- 거래처명: 결제한 가게나 상호명.
- 결제금액: 숫자만 (쉼표나 '원' 제외, 정수).
- 적요: 결제 목적이나 용도를 간단히 요약.

값을 알 수 없으면 null로 표시하세요.
반드시 아래 JSON 형식으로만 응답하고, 다른 설명은 절대 붙이지 마세요.

{{
  "거래일자": "YYYY-MM-DD",
  "거래처명": "문자열",
  "결제금액": 정수,
  "적요": "문자열"
}}

분석할 텍스트:
\"\"\"{text}\"\"\"
"""

    response = model.generate_content(
        prompt,
        generation_config={"response_mime_type": "application/json"},
    )

    return json.loads(response.text)


def process_file(input_path: str, output_path: str) -> pd.DataFrame:
    """텍스트 파일을 줄 단위로 읽어 거래 정보를 추출하고 엑셀로 저장한다."""
    with open(input_path, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]

    total = len(lines)
    print(f"총 {total}건의 데이터를 읽었습니다.\n" + "-" * 50)

    records = []
    for idx, line in enumerate(lines, start=1):
        print(f"{idx}/{total} 번째 데이터 처리 중... : {line[:30]}...")
        try:
            record = extract_transaction(line)
            record["원본텍스트"] = line
            records.append(record)
        except Exception as e:
            print(f"  -> {idx}번째 처리 실패: {e}")
            records.append({"원본텍스트": line, "오류": str(e)})

        # 무료 등급 분당 요청 한도(5회)를 피하기 위한 대기
        if idx < total:
            time.sleep(15)

    df = pd.DataFrame(records)

    column_order = ["거래일자", "거래처명", "결제금액", "적요", "원본텍스트"]
    df = df.reindex(columns=[c for c in column_order if c in df.columns] +
                    [c for c in df.columns if c not in column_order])

    df.to_excel(output_path, index=False)
    print("-" * 50)
    print(f"완료! 결과를 '{output_path}' 파일로 저장했습니다.")
    return df


if __name__ == "__main__":
    INPUT_FILE = "receipts.txt"
    OUTPUT_FILE = "정리된_회계데이터.xlsx"

    result_df = process_file(INPUT_FILE, OUTPUT_FILE)

    print("\n[최종 데이터프레임]")
    print(result_df.to_string(index=False))
