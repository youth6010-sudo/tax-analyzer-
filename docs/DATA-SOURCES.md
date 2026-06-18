# 데이터 정본(Master) 정책

## 결정 (2026-06, 갱신)

| 데이터 | 정본 | 보조 |
|--------|------|------|
| **active 수임처 roster** (상호·담당·대분류·구분·기장료·프로그램·폐업) | 더존 `수임처-*.xlsx` export | — |
| **연락처·세목** (전화·팩스·부가세/법인/원천) | — | TP `연락처` / `담당찾기` export, 더존 export 내 연락처 |
| **유입 문의 CRM** | Excel `유입관리` (향후 DB) | 포털 wizard |
| **온보딩 체크리스트** | Excel `유입프로세스` → [`intake-manual.json`](../public/data/intake-manual.json) | — |
| **유출 이력** | Excel `유출` + 포털 `/clients/churn` | — |
| **직원 시스템 ID/PW** | Excel `청년들ID` → 포털 **admin 자격증명** (암호화) | — |

청년들 ID `수임처관리` 시트는 **roster·기장료 정본이 아님**. `converted`/`colbert` 등 보조 플래그만 `--link-only`로 반영.

설정 코드: [`app/config/dataSources.ts`](../app/config/dataSources.ts)

## Import 명령

```bash
# 일괄 (권장)
npm run import:all

# 개별
npm run import:suimcheo -- --replace "경로/수임처-YYYYMMDD.xlsx"
npm run import:youth-workbook -- --link-only "경로/청년들 ID.xlsx"
npm run import:contacts -- "경로/연락처-*.xlsx"
node scripts/verify-client-import.mjs
```

## 병합 규칙

1. **`import:suimcheo --replace`**: 더존 export 기준으로 active/churned 수임처 전체 재적재 (`source=douzone_export`, `category`, `fee_summary`, `program`)
2. **`import:youth-workbook --link-only`**: 유입·프로세스·유출 시트만 upsert. 수임처 roster 필드(`fee_summary`, `business_entity_type`, `program`) **덮어쓰지 않음**
3. **`import:contacts`**: 동일 키가 있으면 **phone/fax/tax_types만** 갱신
4. **`intake` / `churned` lifecycle**: suimcheo replace 시 intake 레코드는 유지, churn 시트는 youth import로 갱신
5. Excel에 없고 TP에만 있는 수임처: DB에 **유지** (삭제하지 않음)

## 데이터 축 구분

| 축 | DB 필드 | 출처 |
|----|---------|------|
| 대분류 (UI 그룹) | `intake_data.category` | 더존 `대분류` |
| 과세 구분 | `business_entity_type` | 더존 `구분` |
| 세무 프로그램 | `program` | 더존 `프로그램` |
| 기장료 | `fee_summary` | 더존 `기장료` |

## 시트 ↔ 포털 매핑

상세 필드 매핑: [`docs/EXCEL-PORTAL-MAP.md`](./EXCEL-PORTAL-MAP.md)
