export const TAX_TYPES = [
  { id: 'comprehensive', label: '종합소득세', href: '/tax/comprehensive' },
  { id: 'withholding', label: '원천세', href: '/tax/withholding' },
  { id: 'vat', label: '부가세', href: '/tax/vat' },
  { id: 'corporate', label: '법인세', href: '/tax/corporate' },
] as const;

export type TaxTypeId = (typeof TAX_TYPES)[number]['id'];

export const TAX_MENU = [
  {
    id: 'home',
    label: '홈',
    items: [
      { label: '대시보드', href: '/' },
      { label: '안내문 생성기', href: '/tools/notice-generator' },
      { label: '가챠머신', href: '/gacha' },
      { label: '담당자 뽑기', href: '/gacha?tab=manager' },
    ],
  },
  {
    id: 'clients',
    label: '수임처',
    items: [
      { label: '수임처 관리', href: '/clients' },
      { label: '유입', href: '/clients/intake' },
      { label: '유출 관리', href: '/clients/churn' },
    ],
  },
  {
    id: 'admin',
    label: '관리',
    adminOnly: true,
    items: [
      { label: '데이터 백업', href: '/admin/backup' },
      { label: '수임료·연결', href: '/admin/fee-link' },
    ],
  },
  {
    id: 'comprehensive',
    label: '종소세',
    items: [{ label: '종합소득세 분석', href: '/tax/comprehensive' }],
  },
] as const;

export type TaxMenuGroup = (typeof TAX_MENU)[number];
