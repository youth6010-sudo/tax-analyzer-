import os
import re
import json
import time

import pandas as pd
import pyautogui
from PIL import Image  # pyautogui.screenshot()가 PIL Image 객체를 반환함
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted
from dotenv import load_dotenv

# 안전장치: 마우스를 화면 왼쪽 상단 모서리로 빠르게 옮기면 즉시 강제 종료됨
pyautogui.FAILSAFE = True

# ----- 환경설정 -----
load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise ValueError(".env 파일에서 GEMINI_API_KEY를 찾을 수 없습니다.")

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")

# 입력할 데이터가 담긴 엑셀 파일
EXCEL_FILE = "정리된_회계데이터.xlsx"

# 세무사랑 입력 방법을 정리한 지식베이스 파일
KNOWLEDGE_FILE = "세무사랑_가이드.md"

# 루프/대기 설정
MAX_STEPS = 60          # 무한 루프 방지를 위한 최대 행동 횟수
STEP_DELAY = 10         # 각 행동 후 대기(초) - 화면 갱신 + RPM 보호
QUOTA_WAIT = 60         # 429 발생 시 대기(초)
HISTORY_LIMIT = 15      # 프롬프트에 포함할 최근 행동 이력 개수
MAX_PARSE_FAILS = 3     # JSON 파싱 연속 실패 허용 횟수


def load_transactions(path: str) -> list[dict]:
    """엑셀 파일에서 입력할 거래 데이터 전체를 읽어 리스트(dict)로 반환한다."""
    df = pd.read_excel(path)
    columns = ["거래일자", "거래처명", "결제금액", "적요"]
    # 필요한 컬럼만 추려서 dict 리스트로 변환
    records = df[[c for c in columns if c in df.columns]].to_dict("records")
    return records


def load_knowledge(path: str) -> str:
    """세무사랑 입력 지식베이스 파일을 읽어 문자열로 반환한다. 없으면 빈 안내 문구."""
    if not os.path.exists(path):
        return "(세무사랑 지식베이스 파일이 없습니다. 화면을 보고 일반 상식으로 판단하세요.)"
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def build_task_text(transactions: list[dict]) -> str:
    """거래 데이터 리스트를 모델이 이해할 수 있는 작업 목록 문자열로 만든다."""
    lines = []
    for i, t in enumerate(transactions, start=1):
        parts = [f"{key}={t.get(key)}" for key in ("거래일자", "거래처명", "결제금액", "적요")]
        lines.append(f"{i}. " + ", ".join(parts))
    return "\n".join(lines)


# 모델에게 전달할 기본 지시사항(System Prompt) 템플릿
SYSTEM_PROMPT_TEMPLATE = """너는 10년 차 세무 대리인 AI 비서다. 첨부된 이미지는 네가 직접 조작해야 할 컴퓨터 화면(세무사랑 회계 프로그램)이다.

[너의 임무]
아래 거래 데이터를, 세무사랑 화면의 알맞은 입력칸에 회계 규칙에 맞게 입력하는 것이다.
어느 칸에 무엇을 넣을지, 어떤 계정과목/구분(차변·대변)으로 처리할지는 아래 [세무사랑 사용 지식]과 현재 화면을 근거로 네가 직접 판단해라.

[입력할 거래 데이터]
{task_text}

[세무사랑 사용 지식]
{knowledge_text}

[판단 지침]
- 위 지식의 입력 순서(월→일→구분→계정과목→거래처→적요→금액)를 따른다.
- 적요/원본 내용을 보고 적절한 계정과목을 추정한다. 코드를 모르면 계정과목명 앞 두 글자를 입력하고 F2(코드도움)로 검색해 선택하는 방식을 고려한다.
- 결제수단(법인카드→미지급금, 현금/현금영수증→현금/출금)에 맞춰 차변·대변을 구성한다.
- 금액란에서는 천원 단위 입력에 '+'키 활용을 고려할 수 있다.

[조작 규칙]
- 세무사랑은 다음 입력칸으로 이동할 때 Tab이 아니라 Enter를 사용한다.
- 입력칸을 클릭해 포커스를 준 뒤 값을 타이핑해라.
- 한 번에 단 하나의 행동만 결정해라.
- 이전에 네가 한 행동 이력을 보고, 다음에 해야 할 행동을 판단해라. 같은 행동을 불필요하게 반복하지 마라.
- 현재 화면이 세무사랑 전표입력 화면이 아니면, 먼저 해당 메뉴로 진입하는 행동을 한다.
- 모든 거래 데이터 입력이 끝났다고 판단되면 action을 "finish"로 반환해라.

[좌표 규칙]
- click 행동의 좌표는 이미지 기준 정규화 좌표 [y, x]로 반환해라. 좌상단이 [0, 0], 우하단이 [1000, 1000]이다.

[응답 형식]
반드시 아래 JSON 형식 하나만 반환해라. 다른 설명은 절대 붙이지 마라.
{{
  "thought": "현재 화면 분석 + 어떤 계정과목/구분으로 처리할지 판단 + 다음 행동",
  "action": "click | type | press | hotkey | finish",
  "point": [y, x],            // action이 click일 때만. 0~1000 정규화 좌표
  "text": "입력할 문자열",      // action이 type일 때만
  "press_enter": true,         // action이 type일 때, 입력 후 Enter를 누를지 (선택)
  "key": "enter",             // action이 press일 때. 예: enter, tab, esc, f2
  "keys": ["ctrl", "a"],      // action이 hotkey일 때. 조합키
  "reason": "완료 사유"         // action이 finish일 때
}}

[최근 행동 이력]
{history_text}
"""


def parse_json_response(raw_text: str) -> dict:
    """모델 응답에서 순수 JSON만 추출해 파이썬 딕셔너리로 파싱한다.

    ```json ... ``` 같은 마크다운 코드블록이 섞여 있어도 벗겨내서 파싱한다.
    """
    text = raw_text.strip()

    # 마크다운 코드블록(```json ... ``` 또는 ``` ... ```)이 있으면 내부 내용만 추출
    fence_match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()

    # 혹시 앞뒤에 다른 텍스트가 붙어있을 경우, 첫 '{' 부터 마지막 '}' 까지만 추출
    if not text.startswith("{"):
        brace_match = re.search(r"\{.*\}", text, re.DOTALL)
        if brace_match:
            text = brace_match.group(0)

    return json.loads(text)


def normalize_to_pixels(point: list, screen_w: int, screen_h: int) -> tuple[int, int]:
    """모델이 반환한 정규화 좌표 [y, x](0~1000)를 실제 화면 픽셀 좌표로 변환한다."""
    y_norm, x_norm = point[0], point[1]
    px = int(x_norm / 1000 * screen_w)
    py = int(y_norm / 1000 * screen_h)
    # 화면 밖으로 나가지 않도록 보정
    px = max(0, min(px, screen_w - 1))
    py = max(0, min(py, screen_h - 1))
    return px, py


def capture_and_analyze(task_text: str, knowledge_text: str, history: list[str]) -> dict:
    """현재 전체 화면을 캡처해 VLM에게 분석을 요청하고, 다음 행동(JSON)을 반환한다."""
    # 현재 컴퓨터 전체 화면 캡처 (PIL Image 객체로 반환됨)
    screenshot: Image.Image = pyautogui.screenshot()

    # 최근 행동 이력만 추려서 프롬프트에 포함 (없으면 안내 문구)
    recent = history[-HISTORY_LIMIT:]
    history_text = "\n".join(recent) if recent else "(아직 수행한 행동 없음 - 첫 번째 단계)"

    prompt = SYSTEM_PROMPT_TEMPLATE.format(
        task_text=task_text,
        knowledge_text=knowledge_text,
        history_text=history_text,
    )

    # 지시사항 + 스크린샷 이미지를 함께 모델에 전송 (JSON 텍스트만 반환하도록 설정)
    response = model.generate_content(
        [prompt, screenshot],
        generation_config={"response_mime_type": "application/json"},
    )

    return parse_json_response(response.text)


def execute_action(action_data: dict, screen_w: int, screen_h: int) -> tuple[str, bool]:
    """행동(JSON)을 실제 마우스/키보드 조작으로 실행한다.

    반환값: (행동 요약 문자열, 작업 완료 여부)
    """
    action = action_data.get("action")

    if action == "click":
        point = action_data.get("point")
        if not point or len(point) < 2:
            return "click 좌표(point) 누락, 건너뜀", False
        x, y = normalize_to_pixels(point, screen_w, screen_h)
        # 0.5초에 걸쳐 부드럽게 이동 후 클릭
        pyautogui.moveTo(x, y, duration=0.5)
        pyautogui.click()
        return f"클릭 ({x}, {y})", False

    if action == "type":
        text = str(action_data.get("text", ""))
        # 한 글자당 0.1초 간격으로 타이핑
        pyautogui.write(text, interval=0.1)
        summary = f"타이핑 '{text}'"
        # press_enter가 True면 Enter 키 입력 (세무사랑은 Enter로 다음 칸 이동)
        if action_data.get("press_enter"):
            time.sleep(0.3)
            pyautogui.press("enter")
            summary += " + Enter"
        return summary, False

    if action == "press":
        key = action_data.get("key", "")
        if key:
            pyautogui.press(key)
            return f"키 입력 '{key}'", False
        return "press 키 누락, 건너뜀", False

    if action == "hotkey":
        keys = action_data.get("keys", [])
        if keys:
            pyautogui.hotkey(*keys)
            return f"조합키 {'+'.join(keys)}", False
        return "hotkey 키 누락, 건너뜀", False

    if action == "finish":
        return f"작업 완료: {action_data.get('reason', '')}", True

    return f"알 수 없는 action '{action}', 건너뜀", False


def main() -> None:
    # 1) 입력할 거래 데이터 + 세무사랑 지식베이스 로드
    transactions = load_transactions(EXCEL_FILE)
    task_text = build_task_text(transactions)
    knowledge_text = load_knowledge(KNOWLEDGE_FILE)
    print(f"총 {len(transactions)}건의 거래 데이터를 불러왔습니다.")
    print(task_text)
    print(f"세무사랑 지식베이스 로드: {len(knowledge_text)}자")
    print("=" * 50)

    # 2) 현재 화면 해상도(논리 좌표 기준) 확인
    screen_w, screen_h = pyautogui.size()
    print(f"화면 해상도: {screen_w} x {screen_h}")

    # 3) 사용자가 입력 대상 창(세무사랑 등)을 포커스할 수 있도록 5초 카운트다운
    print("5초 안에 입력을 시작할 프로그램(세무사랑/메모장) 창을 클릭해 활성화하세요!")
    for remaining in range(5, 0, -1):
        print(f"  {remaining}초 후 시작합니다...")
        time.sleep(1)
    print("에이전트를 시작합니다!\n" + "-" * 50)

    history: list[str] = []   # 지금까지 수행한 행동 이력(기억)
    parse_fails = 0           # JSON 파싱 연속 실패 횟수
    step = 0

    # 4) 에이전틱 루프 (최대 스텝 제한으로 런어웨이 방지)
    while step < MAX_STEPS:
        step += 1
        print(f"[{step}번째 행동 수행 중...]")

        # 화면 캡처 + AI 분석 (예외 처리 세분화)
        try:
            action_data = capture_and_analyze(task_text, knowledge_text, history)
            parse_fails = 0  # 성공 시 실패 카운터 초기화
        except ResourceExhausted:
            # 429 할당량 초과일 때만 대기 후 재시도
            print(f"API 할당량 초과! {QUOTA_WAIT}초 대기합니다...")
            time.sleep(QUOTA_WAIT)
            step -= 1  # 이번 스텝은 카운트하지 않고 재시도
            continue
        except json.JSONDecodeError as e:
            # JSON 파싱 실패는 일시적일 수 있으니 한도까지 재시도
            parse_fails += 1
            print(f"  -> 응답 JSON 파싱 실패({parse_fails}/{MAX_PARSE_FAILS}): {e}")
            if parse_fails >= MAX_PARSE_FAILS:
                print("파싱 실패가 반복되어 프로그램을 종료합니다.")
                break
            time.sleep(3)
            continue
        except Exception as e:
            # 그 외 치명적 오류(404 등)는 상세 원인 출력 후 즉시 종료
            print(f"치명적 오류 발생, 프로그램을 종료합니다: {e}")
            break

        thought = action_data.get("thought", "")
        print(f"  생각: {thought}")

        # 실제 마우스/키보드 제어 수행
        summary, done = execute_action(action_data, screen_w, screen_h)
        print(f"  행동: {summary}")

        # 행동 이력(기억)에 기록
        history.append(f"{step}. {summary} | 판단: {thought}")

        # 작업 완료(finish) 시 루프 종료
        if done:
            print("-" * 50)
            print("모든 데이터 입력이 완료되었습니다!")
            return

        # 화면 갱신 + RPM 보호를 위한 대기
        time.sleep(STEP_DELAY)

    print("-" * 50)
    print(f"최대 스텝({MAX_STEPS})에 도달하여 종료합니다.")


if __name__ == "__main__":
    main()
