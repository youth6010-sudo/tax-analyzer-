# 데이터 정본(Master) 정책



## 결정 (2026-06, 갱신)



| 데이터 | 정본 | 보조 |

|--------|------|------|

| **active 수임처 roster** (상호·담당·대분류·구분·프로그램·폐업) | 더존 `수임처-*.xlsx` export | — |

| **수임료(기장료)** | `0618id*.xlsx` 수임처관리 **요약** 열 | TP `기장료`는 import 시 저장하지 않음 |

| **연락처·세목** (전화·팩스·부가세/법인/원천) | — | TP `연락처` export |

| **유입 문의 CRM** | Excel `유입관리` (전체 `청년들 ID.xlsx`) | 포털 wizard |

| **온보딩 체크리스트** | Excel `유입프로세스` | — |

| **유출 이력** | Excel `유출` + 포털 `/clients/churn` | — |

| **직원 시스템 ID/PW** | Excel `청년들ID` → 포털 **admin 자격증명** | — |



0618id TP 미매칭 수임료 → `client_fee_import_pending` → admin `/admin/fee-link`에서 연결.



설정 코드: [`app/config/dataSources.ts`](../app/config/dataSources.ts)



## Import 명령



```bash

# 일괄 (권장) — 5단계

npm run import:all



# 명시 경로

node scripts/import-all.mjs \

  "C:/Users/찰리/Desktop/수임처-20260618153548.xlsx" \

  "C:/Users/찰리/Desktop/0618id.1.xlsx" \

  "C:/Users/찰리/Desktop/연락처-20260618153559.xlsx" \

  "C:/Users/찰리/Desktop/청년들 ID.xlsx"



# 개별

npm run import:suimcheo -- --replace "경로/수임처-YYYYMMDD.xlsx"

node scripts/import-youth-workbook.mjs --fees-only "경로/0618id.1.xlsx"

npm run import:douzone-contacts -- "경로/연락처-*.xlsx"

node scripts/import-youth-workbook.mjs --operational-only "경로/청년들 ID.xlsx"

node scripts/verify-client-import.mjs

```



## 병합 규칙



1. **`import:suimcheo --replace`**: TP export 기준 roster 교체. `fee_summary`는 **저장하지 않음** (0618id가 설정)

2. **`import:youth-workbook --fees-only`**: 0618id 수임료·converted/colbert만. 미매칭 → `client_fee_import_pending`

3. **`import:douzone-contacts`**: TP 연락처 → `client_contacts`

4. **`import:youth-workbook --operational-only`**: 유입·프로세스·유출 upsert + `client_id` 자동 연결

5. Excel에 없고 TP에만 있는 수임처: DB **유지**



## 데이터 축 구분



| 축 | DB 필드 | 출처 |

|----|---------|------|

| 대분류 (UI 그룹) | `intake_data.category` | TP `대분류` (legacy는 구분 fallback) |

| 과세 구분 | `business_entity_type` | TP `구분` |

| 세무 프로그램 | `program` | TP `프로그램` |

| 수수료 | `fee_summary` | **0618id 요약** |



## 시트 ↔ 포털 매핑



상세 필드 매핑: [`docs/EXCEL-PORTAL-MAP.md`](./EXCEL-PORTAL-MAP.md)

