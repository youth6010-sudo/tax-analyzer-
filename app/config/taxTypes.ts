export const TAX_TYPES = [
  { id: 'comprehensive', label: '종합소득세', href: '/tax/comprehensive' },
  { id: 'withholding', label: '원천세', href: '/tax/withholding' },
  { id: 'vat', label: '부가세', href: '/tax/vat' },
  { id: 'corporate', label: '법인세', href: '/tax/corporate' },
] as const;

export type TaxTypeId = (typeof TAX_TYPES)[number]['id'];

export const TAX_MENU = [
  {
    id: 'tools',
    label: '도구',
    items: [
      { label: '캘린더', href: '/calendar' },
      { label: '휴가관리', href: '/leave' },
      { label: '청년들 ID', href: '/youth-ids' },
      { label: '우편물 대장', href: '/mail-ledger' },
      { label: '검토표', href: '/clients/review-sheet' },
    ],
  },
  {
    id: 'clients',
    label: '수임처',
    items: [
      { label: '수임처 관리', href: '/clients' },
      { label: '수임처 목록', href: '/clients/directory' },
      { label: '유입', href: '/clients/intake' },
      { label: '유출', href: '/clients/churn' },
      { label: '폐업·휴업 점검', href: '/clients/nts-monitor' },
    ],
  },
  {
    id: 'bluehole',
    label: '블루홀',
    href: '/bluehole',
    adminOnly: true,
  },
  {
    id: 'filing-help',
    label: '신고도움',
    items: [
      { label: '신고검토', href: '/clients/filing-check' },
      { label: '안내문 생성기', href: '/tools/notice-generator' },
    ],
  },
  {
    id: 'misc',
    label: '기타',
    items: [{ label: '종합소득세 분석', href: '/tax/comprehensive' }],
  },
  {
    id: 'fun',
    label: '뽑기',
    items: [
      { label: '가챠머신', href: '/gacha' },
      { label: '담당자 뽑기', href: '/gacha?tab=manager' },
    ],
  },
  {
    id: 'admin',
    label: '관리',
    adminOnly: true,
    items: [
      { label: '데이터 백업', href: '/admin/backup' },
      { label: '블루홀 미연결', href: '/admin/bluehole-unlinked' },
      /** charlieOnly: 개발자(찰리·리아 관리자) — 인디·일반 담당 미표시 */
      { label: '검토표 연결', href: '/admin/review-client-links', charlieOnly: true },
      { label: '유입·유출 업로드', href: '/admin/data-import' },
      { label: '수임처 데이터 초기화', href: '/admin/data-reset' },
    ],
  },
] as const;

export type TaxMenuGroup = (typeof TAX_MENU)[number];
