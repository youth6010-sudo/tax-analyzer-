# 배포 가이드 (웹 공개)

이 프로젝트는 **Next.js 16 App Router** + **Neon Postgres** 기반 **부산지점 수임처 포털**입니다.

## 1) Vercel (권장)

1. [Vercel](https://vercel.com)에 가입 후 **GitHub 저장소**를 연결합니다.
2. **Root Directory**: 저장소 구조에 맞게 `tax-analyzer` 또는 비워 둡니다.
3. Framework Preset: **Next.js**
4. **Node 버전**: 20.x 이상

### 필수 환경 변수

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | **Supabase Postgres** 연결 문자열 (서울 리전, 트랜잭션 풀러 `:6543` 권장). 로컬 `.env.local`과 Vercel Production이 **동일 URL**이어야 데이터가 같습니다. |
| `SESSION_SECRET` | 32자 이상 랜덤 문자열 (iron-session 쿠키 서명) |

Vercel 프로젝트 → **Settings → Environment Variables**에 Production/Preview 모두 설정합니다.

### DB 초기 설정 (최초 1회)

로컬에서 `.env.local`에 `DATABASE_URL`을 넣은 뒤:

```bash
npm run db:push          # 스키마 반영
npm run db:seed          # 직원 계정 (data/seed-users.json)
npm run db:migrate-contacts   # contacts.json → DB (선택)
```

`data/seed-users.json` 예:

```json
[
  { "loginId": "admin", "name": "관리자", "pin": "1234", "role": "admin" },
  { "loginId": "hong", "name": "홍길동", "pin": "0000" }
]
```

배포 후 `/login`에서 ID + 4자리 PIN으로 로그인합니다.

로컬 DB를 Vercel에 맞추려면 (Supabase URL 기준):

```bash
npm run vercel:sync-db    # .env.local DATABASE_URL → Vercel production/preview/development
npm run vercel:deploy     # 환경변수 반영 재배포
npm run db:compare-env    # .env.local vs .env.vercel.production 호스트 비교
```

---

## 2) TP Excel import (담당찾기)

```bash
# 수임처 roster (정본) — 청년들 ID.xlsx
npm run import:youth-id -- "경로/청년들 ID.xlsx"
# 또는
npm run import:contacts -- "경로/청년들 ID.xlsx"

# TP 연락처·세목 보강
npm run import:contacts -- "경로/담당찾기.xls"
```

정본·병합 정책: [`docs/DATA-SOURCES.md`](./DATA-SOURCES.md) · 필드 매핑: [`docs/EXCEL-PORTAL-MAP.md`](./EXCEL-PORTAL-MAP.md)

---

## 3) Docker (자체 서버)

`next.config.ts`에 `output: "standalone"`이 설정되어 있습니다.

```bash
docker compose up --build
```

Postgres를 함께 쓰려면 `DATABASE_URL`, `SESSION_SECRET`을 compose 환경 변수로 전달합니다.

---

## 4) Node만 설치된 서버

```bash
npm ci
npm run build
DATABASE_URL=... SESSION_SECRET=... npm run start
```

---

## 참고

- **로고**: `public/logo.png`가 없으면 헤더·인쇄용 이미지는 404일 수 있습니다.
- **유입 wizard**: `public/data/intake-manual.json` 수정만으로 단계 변경 가능 (재배포 불필요).
- **민감 정보**: PIN은 bcrypt 해시로 DB 저장. 세션은 httpOnly 쿠키.
