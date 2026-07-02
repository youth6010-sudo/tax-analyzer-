/** 더존 export intake_data 필드 라벨 */
export const DOUZONE_FIELD_LABELS: Record<string, string> = {
  douzoneCode: '코드',
  category: '대분류',
  team: '팀',
  mainOffice: '주사업장',
  address: '주소',
  industry: '업태',
  item: '종목',
  industryCode: '업종코드',
  openAge: '개업당시만나이',
  gender: '성별',
  openDate: '개업일',
  closedDate: '폐업일',
  taxKind: '과세유형',
  convertedDate: '변환일',
  taxInvoice: '세금계산서',
  invoiceAvailableDate: '발행가능일',
  filingType: '신고유형',
  report: '보고서',
  email: '메일주소',
  emailTax: '메일(세금계산서)',
  callNote: '통화유의',
  posVendor: '포스사',
  taxOfficeContact: '세무서담당',
  taxOfficePhone: '세무서담당연락처',
  clientContact: '수임처담당',
  relatedCompanies: '관계회사명',
  statusLabel: '상태',
};

export const DOUZONE_NOTE_LABELS: Record<string, string> = {
  payroll: '급여대장 특이사항',
  withholding: '원천세 특이사항',
  dataEntry: '자료입력 특이사항',
  payrollHistory: '근로내역 특이사항',
  vat: '부가세 특이사항',
  comprehensive: '종소세 특이사항',
  corporate: '법인세 특이사항',
  other: '기타 특이사항',
};

export const DOUZONE_TAX_FLAG_LABELS: Record<string, string> = {
  employed: '상용',
  daily: '일용',
  retirement: '퇴직',
  bizIncome: '사업',
  interestDividend: '이자배당',
  otherTax: '기타',
  laborContentReport: '근로내용확인신고',
  proxyPay: '대납',
};

export function douzoneExtraEntries(intakeData: Record<string, unknown>): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const skip = new Set(['taxFlags', 'notes', 'mobilePhone']);

  for (const [key, value] of Object.entries(intakeData)) {
    if (skip.has(key)) continue;
    if (value == null) continue;
    if (typeof value === 'object') continue;
    const text = String(value).trim();
    if (!text) continue;
    out.push({ label: DOUZONE_FIELD_LABELS[key] ?? key, value: text });
  }

  const notes = intakeData.notes;
  if (notes && typeof notes === 'object' && !Array.isArray(notes)) {
    for (const [key, value] of Object.entries(notes as Record<string, unknown>)) {
      if (value == null || String(value).trim() === '') continue;
      out.push({ label: DOUZONE_NOTE_LABELS[key] ?? key, value: String(value) });
    }
  }

  const flags = intakeData.taxFlags;
  if (flags && typeof flags === 'object' && !Array.isArray(flags)) {
    const active = Object.entries(flags as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => DOUZONE_TAX_FLAG_LABELS[k] ?? k);
    if (active.length) {
      out.push({ label: '신고 대상', value: active.join(', ') });
    }
  }

  return out;
}
