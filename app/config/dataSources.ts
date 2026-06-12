/**
 * 부산지점 데이터 정본(master) 정책
 * @see docs/DATA-SOURCES.md
 */

/** active 수임처 roster·연락처·세목·기장료 (더존 export) */
export const MASTER_ACTIVE_CLIENTS = 'douzone_export' as const;

/** 청년들 ID.xlsx 유입·유출·온보딩 */
export const SUPPLEMENT_YOUTH_EXCEL = 'youth_excel' as const;

/** legacy TP 담당찾기 */
export const SUPPLEMENT_CONTACTS = 'tp_import' as const;

export type ClientMasterSource = typeof MASTER_ACTIVE_CLIENTS;

export const DATA_SOURCE_LABELS: Record<string, string> = {
  douzone_export: '더존 수임처 export',
  youth_excel: '청년들 ID.xlsx · 유입/유출',
  tp_import: 'TP 담당찾기 export',
  manual_intake: '포털 신규상담',
};

/** Excel 담당자 닉네임 → 한국 실명 (청년들ID 시트) */
export const STAFF_REAL_NAMES: Record<string, string> = {
  블루: '구진혜',
  다야: '홍다예',
  리아: '박혜림',
  윈터: '안혜빈',
  페리: '김평진',
  인디: '신상협',
  찰리: '이희만',
};

/** import 병합 규칙 요약 */
export const MERGE_POLICY = {
  rosterMaster: MASTER_ACTIVE_CLIENTS,
  youthExcelForIntake: SUPPLEMENT_YOUTH_EXCEL,
  tpEnrichesOnly: true,
  protectLifecycle: true,
} as const;
