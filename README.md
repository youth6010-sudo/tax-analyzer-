# 종합소득세 신고서 분석 도구

## PC에서 쓰는 방법

1. **`시작.bat`** 또는 **`바로실행.bat`** 더블클릭 → 브라우저가 **http://localhost:3000** (또는 127.0.0.1:3000) 으로 열립니다.
2. 서버를 이미 켜 둔 경우 **`로컬에서열기.url`** / **`브라우저에서열기.url`** 만 더블클릭하면 됩니다.
3. **탭이 자꾸 끊기면** **`바로실행-안정.bat`** 또는 `npm run stable` (빌드 후 start).
4. **같은 사무실 다른 PC** → **[docs/사내공유.md](./docs/사내공유.md)**

**페이지가 안 열릴 때** → **[docs/사이트가안열릴때.md](./docs/사이트가안열릴때.md)**  
**GitHub + Vercel 배포** → **[docs/GITHUB-VERCEL-연결.md](./docs/GITHUB-VERCEL-연결.md)**  
**Vercel + 로컬 합치기** → **[docs/병합-배포-가이드.md](./docs/병합-배포-가이드.md)**

업종별 단순경비율과 실제 소득율을 비교 분석하는 웹 도구입니다.

## 주요 기능

| 기능 | 설명 |
|------|------|
| 업종코드 매칭 | 업종코드로 단순경비율 자동 조회 |
| 소득율 계산 | 수입금액, 필요경비, 소득금액, 소득율 자동 계산 |
| 비교 분석 | 단순경비율 대비 실제 소득율 차이 표시 |
| 거래처 검색 | 상단 검색창에서 업체·담당자 조회 |
| 작업 저장 | 입력·시뮬레이션 JSON 저장/불러오기 |

## 시작 방법

### 간편 실행

1. **`시작.bat`** / **`시작하기.bat`** — 개발 서버 + 브라우저 자동 열기  
2. **`시작-사무실.bat`** — 사무실 LAN 공유  
3. **`RUN-STABLE.cmd`** / **`바로실행-안정.bat`** — 빌드 후 안정 모드  

### 수동 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 접속

## 웹 배포

[docs/DEPLOY.md](./docs/DEPLOY.md) 참고.

- **Vercel**: https://tax-analyzer-seven.vercel.app
- **Docker**: `docker compose up --build`
- **Node**: `npm run build` → `npm run start`

## 데이터 파일

- `public/industry_rates.json` — 업종코드별 경비율
- `public/data/contacts.json` — 거래처 목록

## 주의사항

- **데이터 정확도**: 입력값은 브라우저 localStorage에 저장됩니다.
- **최종 판단**: 세무 결정은 반드시 세무사와 상담
