# 데이터 정본(Master) 정책

## 결정 (2026-06)

| 데이터 | 정본 | 보조 |
|--------|------|------|
| **active 수임처 목록** (상호·담당·구분·기장료·프로그램) | [`청년들 ID.xlsx`](.) `수임처관리` 시트 | — |
| **연락처·세목** (전화·팩스·부가세/법인/원천) | — | TP `담당찾기` export |
| **유입 문의 CRM** | Excel `유입관리` (향후 DB) | 포털 wizard |
| **온보딩 체크리스트** | Excel `유입프로세스` → [`intake-manual.json`](../public/data/intake-manual.json) | — |
| **유출 이력** | Excel `유출` + 포털 `/clients/churn` | — |
| **직원 시스템 ID/PW** | Excel `청년들ID` → 포털 **admin 자격증명** (암호화) | — |

설정 코드: [`app/config/dataSources.ts`](../app/config/dataSources.ts)

## Import 명령

```bash
# 1) 수임처 roster (정본) — 청년들 ID.xlsx
npm run import:youth-id -- "경로/청년들 ID.xlsx"

# 2) TP 연락처·세목 보강 (선택, 병행)
npm run import:contacts -- "경로/담당찾기.xls"
```

## 병합 규칙

1. **`import:youth-id`**: `company_name + manager` 키로 upsert, `source=youth_excel`, `status=active` 신규
2. **`import:contacts`**: 동일 키가 있으면 **phone/fax/tax_types만** 갱신 (roster 제거 안 함)
3. **`intake` / `churned`**: 어떤 import도 status·lifecycle 덮어쓰지 않음
4. Excel에 없고 TP에만 있는 수임처: DB에 **유지** (삭제하지 않음)

## 시트 ↔ 포털 매핑

상세 필드 매핑: [`docs/EXCEL-PORTAL-MAP.md`](./EXCEL-PORTAL-MAP.md)
