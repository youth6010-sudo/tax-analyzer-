import time

import pandas as pd
import pyautogui
import pyperclip

# 엑셀 파일 경로와 동작 사이 대기 시간 설정
EXCEL_FILE = "정리된_회계데이터.xlsx"
DELAY = 0.5  # 각 동작(붙여넣기, Tab 등) 사이의 대기 시간(초)


def paste_text(text: str) -> None:
    """텍스트를 클립보드에 복사한 뒤 Ctrl+V로 붙여넣는다."""
    # pyperclip으로 클립보드에 값 복사
    pyperclip.copy(str(text))
    time.sleep(DELAY)
    # Ctrl+V로 붙여넣기
    pyautogui.hotkey("ctrl", "v")
    time.sleep(DELAY)


def main() -> None:
    # 1) 엑셀 파일을 판다스 데이터프레임으로 읽어오기
    df = pd.read_excel(EXCEL_FILE)
    print(f"총 {len(df)}건의 데이터를 읽었습니다.")

    # 2) 사용자가 입력 칸을 클릭할 수 있도록 5초 카운트다운 대기
    print("5초 안에 입력을 시작할 칸(세무사랑 또는 메모장)을 클릭하세요!")
    for remaining in range(5, 0, -1):
        print(f"  {remaining}초 후 시작합니다...")
        time.sleep(1)
    print("입력을 시작합니다!\n" + "-" * 40)

    # 3) 각 행을 순회하며 데이터 입력
    for idx, row in df.iterrows():
        print(f"{idx + 1}번째 행 입력 중...")

        # 거래일자 → 붙여넣기 → Enter
        paste_text(row["거래일자"])
        pyautogui.press("enter")
        time.sleep(DELAY)

        # 거래처명 → 붙여넣기 → Enter
        paste_text(row["거래처명"])
        pyautogui.press("enter")
        time.sleep(DELAY)

        # 결제금액 → 붙여넣기 → Enter
        paste_text(row["결제금액"])
        pyautogui.press("enter")
        time.sleep(DELAY)

        # 적요 → 붙여넣기 → Enter (다음 줄로 이동)
        paste_text(row["적요"])
        pyautogui.press("enter")
        time.sleep(DELAY)

    print("-" * 40)
    print("모든 데이터 입력이 완료되었습니다!")


if __name__ == "__main__":
    # 마우스를 화면 왼쪽 상단 모서리로 옮기면 비상 정지(failsafe)
    pyautogui.FAILSAFE = True
    main()
