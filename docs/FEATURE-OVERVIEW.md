# 부산지점 수임처 포털 — 기능·성능 설명문

> 대상: 팀 내 기능 소개·운영 설명용  
> 최종 갱신: 2026-06-22

---

## 1. 이 시스템이 하는 일

**부산지점 수임처 포털(tax-analyzer)** 은 Excel·더존·TP에서 관리하던 수임처·유입·유출·수수료 정보를 **한곳에서 조회·수정**할 수 있게 만든 내부 웹 앱입니다.

- **배포 주소**: https://tax-analyzer-seven.vercel.app
- **기술 스택**: Next.js(App Router) + PostgreSQL + Vercel
- **사용자**: 직원 PIN 로그인 (4자리), 관리자(admin) 추가 권한

핵심 가치는 다음 세 가지입니다.

1. **업무 데이터 통합** — 수임처 목록, 유입 CRM, 유출 이력, 수수료를 DB에 모아 포털에서 처리
2. **담당자 중심 UI** — 내 담당 수임처를 빠르게 찾고, 목록에서 바로 수수료 입력
3. **체감 속도** — 첫 화면·검색·목록을 캐시·프리페치로 빠르게 표시

---

## 2. 기능별 설명

### 2.1 홈 대시보드 (`/`)

| 기능 | 설명 |
|------|------|
| 담당 수임처 통계 | 개인·법인·비사업자·미분류 건수 요약 |
| 할 일 패널 | 유입·프로세스·미처리 항목 등 대시보드 태스크 |
| 도구 바로가기 | 종합소득세 분석, 점심/가챠 등 부가 도구 |

로그인 직후 **한 번의 API 호출(bootstrap)** 로 홈에 필요한 데이터를 묶어 받아, 이후 페이지 이동 시 재요청을 줄입니다.

---

### 2.2 수임처 관리 (`/clients`) — 핵심 모듈

담당자별로 수임처를 **가로 스크롤 카드** 형태로 보여 주는 화면입니다.

#### 목록·필터

- **검색**: 업체명, 대표, 사업자·법인·주민번호, 전화, 담당자
- **필터**: 담당자 다중 선택, 「내 담당」, 폐업·해임 포함, 정렬(이름/코드)
- **대분류**: 개인·법인은 항상 표시, 신고대리 등은 필터에서 선택 시 패널 추가
- **그룹핑**: 담당자 → 개인 / 법인 / 기타 대분류 패널, 패널별 건수·수수료 합계

#### 행 펼침(인라인 상세)

업체명을 클릭하면 같은 행 아래에 펼쳐집니다.

- 대표, 사업자번호, 법인/주민번호, 연락처
- 기장료·조정료 breakdown (월 기장료×12 + 조정료)
- **수수료 변경 이력** (누가·언제·이전→이후 금액)
- 「상세보기」→ 수임처 상세 페이지 이동 (스크롤 위치 URL에 저장)

#### 수수료 입력

- 수수료 칸 클릭 → 모달에서 **월 기장료**, **조정료** 입력
- 합계 자동 계산: `기장료 × 12 + 조정료`
- 저장 시 DB 반영 + 변경 이력(`client_fee_changes`) 기록
- 저장한 사람 이름·시각이 이력에 남음

#### 접근 권한

- 일반 직원: **본인 담당** 수임처만 조회·수정
- 관리자: 전체 수임처

---

### 2.3 수임처 상세 (`/clients/[id]`)

- 업체 기본 정보 편집 (업체명, 담당, 세목, 연락처 등)
- **다중 연락처** 관리 (`client_contacts`)
- 더존 export 연동 메타 (해당 시)
- 관련 유입 문의·온보딩 프로세스·유출 기록 링크

---

### 2.4 유입 관리 (`/clients/intake`)

Excel 「유입관리」「유입프로세스」 시트와 연동된 CRM 화면입니다.

| 구분 | 내용 |
|------|------|
| 유입 문의 | 채널, 상담자, 문의 내용, 제안 수수료, 계약 상태 등 |
| 온보딩 프로세스 | 체크리스트, 수임료 시작일, 월 수수료 |
| 상담 등록 | 포털에서 신규 상담·draft 저장 |
| 신규 유입 wizard | `/clients/intake/new` — 수임처 생성·유입 단계 진행 |

데이터 정본은 Excel import이며, 포털에서 추가·수정한 내용은 DB에 저장됩니다.

---

### 2.5 유출 관리 (`/clients/churn`)

- 유출 등록 (사유, 유형, 데이터 정리, 조기 징후, 수수료 등)
- 유출 이력 테이블 조회
- **미기록 수임처**: status가 churned인데 유출 레코드가 없는 건 백필 안내

---

### 2.6 종합소득세 분석 (`/tax/comprehensive`)

세무 실무용 **독립 도구** (수임처 DB와 분리된 클라이언트 세션).

- 업종코드별 경비율·소득율 비교
- 복수 사업장 행 입력·상세 경비
- 시뮬레이션·차년도 계획
- PDF/JPG 캡처, JSON 작업 저장·불러오기
- 입력값은 **브라우저 localStorage**에 자동 저장 (서버 DB 미사용)

---

### 2.7 점심·가챠 (`/lunch`, `/gacha`)

| 메뉴 | 기능 |
|------|------|
| 점심 | 맛집 DB, 캡슐 뽑기, 방문 기록, 맛집 추가 요청 |
| 가챠 | 점심 탭 + 담당자 뽑기(3D 캡슐 UI, 풀 localStorage 저장) |

업무 보조용이며 수임처 데이터와 무관합니다.

---

### 2.8 관리자 기능

| 경로 | 기능 |
|------|------|
| `/admin/fee-link` | 0618id import 시 TP에 매칭되지 않은 **대기 수수료**를 수임처에 수동 연결 |
| `/admin/fee-link` (orphan) | client_id 없는 유입·프로세스·유출 레코드 연결 |
| `/admin/backup` | DB 백업 다운로드 |

관리자(`role: admin`)만 메뉴·API 접근 가능합니다.

---

## 3. 데이터 구조·정본 정책

### 3.1 어디서 데이터가 오는가

| 데이터 | 정본(마스터) | 비고 |
|--------|--------------|------|
| active 수임처 roster | 더존 `수임처-*.xlsx` | 상호·담당·대분류·프로그램 |
| 수임료 요약 | `0618id*.xlsx` 요약 열 | TP 기장료는 import 안 함 |
| 연락처·세목 | TP `연락처` export | 전화·팩스·부가/법인/원천 |
| 유입 CRM | `청년들 ID.xlsx` 유입관리 | |
| 온보딩 | 동일 파일 유입프로세스 | |
| 유출 | Excel + 포털 등록 | |

일괄 반영: `npm run import:all` (5단계 파이프라인)

### 3.2 주요 DB 테이블

- `clients` — 수임처 마스터, `fee_summary`, `intake_data`(JSON)
- `client_fee_changes` — 수수료 변경 이력
- `client_fee_import_pending` — 미매칭 수수료 대기
- `client_contacts` — 업체당 복수 연락처
- `intake_inquiries`, `intake_processes` — 유입 CRM
- `churn_records` — 유출 이력
- `users` — 로그인·PIN·역할

### 3.3 수수료 저장 구조

- **표시용 합계**: `clients.fee_summary` (정수, 원)
- **입력 breakdown**: `intake_data.bookkeepingFee`, `intake_data.adjustmentFee`
- **이력**: `client_fee_changes` (이전 합계, 새 합계, 변경자, 시각)

---

## 4. 성능 설계 — 왜 빠르게 느껴지는가

### 4.1 Portal Bootstrap (서버 집계)

`GET /api/portal/bootstrap` 한 번에 다음을 **병렬 조회**합니다.

- 대시보드 할 일
- active 수임처 목록
- 유입 문의·프로세스
- 유출 이력·미기록 목록

→ 홈·헤더·수임처 첫 진입 시 **왕복 HTTP 요청 수를 줄임**.

### 4.2 클라이언트 캐시 (`portalStore`)

| 항목 | 방식 |
|------|------|
| 저장소 | localStorage + sessionStorage (`portalBootstrap:v5`) |
| TTL | bootstrap 90초, 검색 인덱스 300초 |
| 구독 | `useSyncExternalStore` — React와 동기화 |
| 패치 | 수수료·유출 저장 시 `patchPortalClient` / `patchPortalChurn`으로 캐시 즉시 갱신 |

**효과**: 앱 재방문·탭 이동 시 **서버 응답 전에 캐시 목록을 먼저 표시** (stale-while-revalidate 패턴).

### 4.3 수임처 목록 이중 로드

`/clients` 페이지 동작:

1. 캐시(`usePortalClients`)로 **즉시 렌더**
2. 백그라운드에서 `GET /api/clients`로 최신화
3. 수수료를 방금 저장한 경우, 서버 응답이 늦게 와도 **로컬에서 수정한 수수료는 덮어쓰지 않음** (merge 로직)

### 4.4 검색 하이브리드

- **로컬 인덱스**: 헤더 검색 시 즉시 결과 (`prefetchSearchIndex`)
- **서버 검색**: 연락처·번호 등 깊은 매칭은 API 보완
- 마우스 오버·포커스 시 인덱스 **프리페치**

### 4.5 UI·렌더링 최적화

| 기법 | 적용 위치 |
|------|-----------|
| `useMemo` | 클라이언트 필터·담당자 그룹·통계 |
| 가로 snap 스크롤 | 담당자 컬럼 — 한 화면에 한 담당자 집중 |
| 패널 내부 세로 스크롤 | 개인/법인 목록 — 전체 페이지 스크롤과 분리 |
| `router.prefetch` | 수임처명 hover 시 상세 페이지 미리 로드 |
| 목록용 slim JSON | `clientToListRecord` — intakeData에서 목록에 필요한 키만 전송 |
| URL 상태 | 필터·스크롤 위치 공유·복귀 (`clientsListState`) |

### 4.6 서버 측

- PostgreSQL connection pool (`max: 10`)
- Drizzle ORM — 타입 안전 쿼리
- API `Cache-Control: private, no-cache` — 개인별 데이터 캐시 오염 방지
- Vercel 리전 `icn1` (서울) — 국내 접속 지연 최소화

### 4.7 의도적으로 하지 않은 것

- 수임처 전체 목록 **서버 페이징 없음** — 담당자 필터 전제로 메모리 필터 (규모: 수백~수천 건 수준)
- 종합소득세 분석 — 서버 저장 없음 (개인 작업 파일)

---

## 5. 보안·접근 제어

| 항목 | 구현 |
|------|------|
| 인증 | 4자리 PIN + bcrypt, iron-session 쿠키 (14일) |
| 미들웨어 | 비로그인 → `/login`, API 401 |
| Rate limit | 로그인 시도 제한 |
| 수임처 ACL | admin 전체 / staff는 담당자명·배정 ID 일치 시만 |
| Admin API | `requireAdmin` — fee-link, backup, orphan, 일부 삭제 |

---

## 6. API 구조 요약

```
/api/auth/*          로그인·세션·PIN
/api/portal/*        bootstrap, search-index
/api/clients/*       목록·검색·상세·수수료·연락처·유입
/api/clients/[id]/fee-changes   수수료 이력
/api/intake/*        유입 문의·프로세스
/api/churn/*         유출
/api/consultation/*  상담 draft
/api/admin/*         fee-pending, orphan, backup
/api/dashboard/tasks 할 일
/api/lunch/requests  맛집 요청 (admin)
```

공통: `requireUser()` → `assertCanAccessClient()` → Drizzle → JSON 응답

---

## 7. 최근 구현·개선 사항 (수임처·수수료)

1. **담당자 roster 그리드** — 가로 스크롤·개인/법인 패널·합계
2. **인라인 수수료 편집** — 기장료/조정료 모달, 합계 자동 계산
3. **수수료 변경 이력** — 저장 시 DB 이력 + 펼침 패널에서 조회
4. **캐시 동기화** — 저장 실패·덮어쓰기 방지, portalStore 패치
5. **Admin fee-link** — import 미매칭 수수료·orphan 레코드 연결
6. **DB 마이그레이션** — `client_fee_changes` 테이블 (프로덕션 반영 완료)

---

## 8. 설명 시 강조 포인트 (요약 스크립트)

> 「Excel 여러 파일에 흩어져 있던 수임처·유입·유출·수수료를 DB에 모아, 담당자별로 한 화면에서 보고 수수료까지 입력할 수 있습니다.  
> 첫 로딩은 캐시로 빠르게 보여 주고, 수수료는 저장하면 이력까지 남습니다.  
> 데이터 정본은 여전히 Excel import이고, 포털은 조회·일상 수정·유출 등록용입니다.  
> 종합소득세 분석·점심 가챠는 별도 도구로, 수임처 DB와 분리되어 있습니다.」

---

## 9. 운영·유지보수

| 작업 | 명령/경로 |
|------|-----------|
| Excel 전체 반영 | `npm run import:all` |
| DB 스키마 반영 | `npm run db:push` (또는 `scripts/ensure-fee-changes-table.mjs`) |
| 프로덕션 배포 | `npm run vercel:deploy` |
| 데이터 정본 문서 | `docs/DATA-SOURCES.md` |
| Excel 필드 매핑 | `docs/EXCEL-PORTAL-MAP.md` |

---

## 10. 알려진 제약

- 수임처 목록은 **전체 로드 후 클라이언트 필터** — 수만 건 규모로 늘면 페이징 검토 필요
- bootstrap 캐시 TTL(90초) 동안 다른 사용자 변경은 자동 반영 안 됨 → 새로고침·재진입 시 갱신
- `drizzle-kit push`는 대화형 프롬프트가 있어 CI에서 막힐 수 있음 → 필요 테이블은 SQL 스크립트로 보완
