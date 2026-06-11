export const TAX_TYPES = [
  { id: 'comprehensive', label: '종합소득세', href: '/tax/comprehensive' },
  { id: 'withholding', label: '원천세', href: '/tax/withholding' },
  { id: 'vat', label: '부가세', href: '/tax/vat' },
  { id: 'corporate', label: '법인세', href: '/tax/corporate' },
] as const;

export type TaxTypeId = (typeof TAX_TYPES)[number]['id'];

export const TAX_MENU = [
  {
    id: 'comprehensive',
    label: '종소세',
    items: [{ label: '종합소득세 분석', href: '/tax/comprehensive' }],
  },
  { id: 'withholding', label: '원천세', items: [] },
  { id: 'vat', label: '부가세', items: [] },
  { id: 'corporate', label: '법인세', items: [] },
] as const;

export type TaxMenuGroup = (typeof TAX_MENU)[number];
