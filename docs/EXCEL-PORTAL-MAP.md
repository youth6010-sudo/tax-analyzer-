# 청년들 ID.xlsx ↔ 포털 매핑표

## 수임처관리 → `clients`

| Excel 컬럼 | DB `clients` | API `ClientRecord` | 비고 |
|------------|--------------|-------------------|------|
| 업체명 | `company_name` | `companyName` | merge key |
| (1행 담당자) | `manager` | `manager` | merge key, `users.name` 매칭 |
| 구분 | `business_entity_type` | `businessEntityType` | 법인→`corporate`, 개인→`individual` |
| 요약 | `fee_summary` | `feeSummary` | 기장료·수수료(숫자) |
| 프로그램 | `program` | `program` | 세무사랑 등 |
| 변환 / 콜베르 | `converted`, `colbert` | `converted`, `colbert` | boolean |
| — | `status` | `status` | import 시 `active` |
| — | `source` | `source` | `youth_excel` |

TP 보강(`import:contacts`): `phone`, `fax`, `tax_types` only.

---

## 유입관리 → `clients` (intake) + `intake_data`

| Excel | `intake_data` key | 포털 wizard |
|-------|-------------------|-------------|
| 문의일자 | `inquiryDate` | inquiry 단계 |
| 업체명 | `companyName` | inquiry |
| 전화번호 | `phone` | inquiry |
| 유입채널 | `channel` | inquiry |
| 초회상담자 | `consultant` | inquiry |
| 문의내용 | `inquiryNote` | inquiry |
| 제안금액 | `proposedFee` | inquiry |
| 업종 | `industry` | inquiry |
| 사업자번호 | `businessNo` | inquiry |
| 대표자 | `representative` | inquiry |
| 주소 | `address` | inquiry |
| 계약유무 | `contractStatus` | inquiry |

---

## 유입프로세스 → `intake_data.checklist`

| Excel 단계 | checklist key |
|------------|---------------|
| 계약서 작성 및 전달 | `contractSent` |
| 수임동의 | `consent` |
| CMS 등록 | `cms` |
| 담당자 배정 | `assignee` |
| 프로그램 거래처 생성 | `programClient` |
| TP 거래처 등록 | `tpClient` |
| 위멤버스 및 세모리포트 등록 | `semoReport` |
| 사업용계좌 등록 | `bizAccount` |
| 거래처 카톡방 생성 | `kakaoRoom` |

설정: [`public/data/intake-manual.json`](../public/data/intake-manual.json)

---

## 유출 → `churn_records` + `clients`

| Excel | DB | 포털 |
|-------|-----|------|
| 업체명 | `clients.company_name` | churn 폼 |
| 계약 종료일 | `churn_records.churned_at` | — |
| 기장료 | `churn_records.fee_amount` | — |
| 자료 정리 | `churn_records.data_cleanup` | — |
| 유형 | `churn_records.churn_type` | — |
| 전조증상 | `churn_records.early_sign` | — |
| 유출 사유 | `churn_records.reason` | churn 폼 |
| 담당 | `clients.manager` | — |

---

## 청년들ID → `staff_credentials` (admin)

| Excel 섹션 | `section_id` |
|------------|--------------|
| 01. 계좌 | `accounts` |
| 02. 법인폰/구글/MS | `google_ms` |
| 03. 홈택스 | `hometax` |
| 04. 네이버웍스 | `naverworks` |
| 05. 세무사랑 | `semusarang` |
| 06. SK전화 | `sk_phone` |
| 07. 위멤버스클럽 | `wemembers` |
| 08. TP | `tp` |
| 09. 와캠퍼스 | `wcampus` |
| 10. 플랫폼 세무사회 | `tax_accountant` |

행(A열): 실명 → `users.real_name` 또는 `owner_label`  
셀: ID/PW → AES-256-GCM 암호화 JSON `{ id, pw, note, aux }`

---

## 미연동 시트 (2차)

| 시트 | 용도 |
|------|------|
| 미팅 스케쥴 / 미팅스케쥴 관리 | 방문·보고 일정 |
| 리포트 발송 확인 | 세모리포트 발송 |
| 업무 체크리스트 | 월간/주간 O/X |
| 비품 주문 | 비품 이력 |
| 24년 가결산 | 타 지점 |
| 청년들 방문미팅 | 방문 노트 |
| 신규상담 | 상담 템플릿 |
