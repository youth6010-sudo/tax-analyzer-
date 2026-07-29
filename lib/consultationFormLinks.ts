/** 전화 상담에서만 입력·다른 열에는 연동 요약으로 표시 */
export const PHONE_SOURCE_KEYS = [
  'consultTypes',
  'phone',
  'companyName',
  'representative',
  'openDate',
  'location',
  'industry',
  'revenue',
  'consultDate',
  'consultAmPm',
  'consultContactType',
  'channel',
  'channelDetail',
  'payrollFullTime',
  'payrollDaily',
  'payrollOther',
  'businessEntityType',
  'vatTaxStatus',
  'hasPrevAccountant',
  'prevTerminated',
  'prevDocsReturned',
  'prevUnpaidIssues',
  'prevComplaints',
  'clientNeeds',
  'taxStatusSummary',
  'potentialTaxIssues',
  'proposedServiceScope',
  'feeDirection',
  'consultRemarks',
] as const;

export type PhoneSourceKey = (typeof PHONE_SOURCE_KEYS)[number];

const PHONE_SOURCE_SET = new Set<string>(PHONE_SOURCE_KEYS);

/** JSON에서 제거했지만 저장·상세 표시용으로 자동 채움 */
const DERIVED_KEYS = ['recordMeetingAt', 'coreNeeds', 'prepCallReview'] as const;

export function isPhoneSourceField(key: string): boolean {
  return PHONE_SOURCE_SET.has(key);
}

function payrollSummary(form: Record<string, string>): string {
  const parts: string[] = [];
  const ft = form.payrollFullTime?.trim();
  const daily = form.payrollDaily?.trim();
  const other = form.payrollOther?.trim();
  if (ft && ft !== '0') parts.push(`상용직 ${ft}명`);
  if (daily && daily !== '0') parts.push(`일용직 ${daily}명`);
  if (other && other !== '0') parts.push(`사업/기타 ${other}명`);
  return parts.join(', ');
}

export function applyConsultationLinks(form: Record<string, string>): Record<string, string> {
  const next = { ...form };

  const meeting = form.meetingDate?.trim();
  if (meeting) next.recordMeetingAt = meeting;

  if (form.clientNeeds?.trim()) next.needPain = form.clientNeeds.trim();
  if (form.taxStatusSummary?.trim()) next.recordSummary = form.taxStatusSummary.trim();
  if (form.potentialTaxIssues?.trim()) next.diagTaxRisks = form.potentialTaxIssues.trim();
  if (form.proposedServiceScope?.trim()) {
    next.agreedServiceScope = form.proposedServiceScope.trim();
    if (!form.serviceExtra?.trim()) next.serviceExtra = form.proposedServiceScope.trim();
  }
  if (form.feeDirection?.trim()) next.feeGuidanceNote = form.feeDirection.trim();
  if (form.consultRemarks?.trim()) next.followUpNotes = form.consultRemarks.trim();

  const payroll = payrollSummary(form);
  if (payroll) next.payrollStatus = payroll;

  const needs = [
    form.clientNeeds?.trim() || form.needPain?.trim(),
    form.needExpectation?.trim() ? `기대 역할: ${form.needExpectation.trim()}` : '',
    form.needExpectationDetail?.trim(),
  ].filter(Boolean);
  if (needs.length) next.coreNeeds = needs.join('\n');

  const phoneLines: string[] = [];
  const push = (label: string, val?: string) => {
    if (val?.trim()) phoneLines.push(`${label}: ${val.trim()}`);
  };
  push('연락처', form.phone);
  push('상호', form.companyName);
  push('성함', form.representative);
  push('개업일', form.openDate);
  push('사업장', form.location);
  push('업종', form.industry);
  push('매출', form.revenue);
  push('유입', form.channel);
  if (form.channelDetail?.trim()) phoneLines.push(form.channelDetail.trim());
  if (payroll) phoneLines.push(`인건비 신고: ${payroll}`);
  push('사업자 유형', form.businessEntityType);
  push('과·면세', form.vatTaxStatus);
  if (form.hasPrevAccountant === '있음') {
    push('이전 세무사', '있음');
    push('해지', form.prevTerminated);
    push('자료 반환', form.prevDocsReturned);
    if (form.prevComplaints?.trim()) phoneLines.push(`불만: ${form.prevComplaints.trim()}`);
    if (form.prevUnpaidIssues?.trim()) phoneLines.push(`미수·분쟁: ${form.prevUnpaidIssues.trim()}`);
  }
  if (phoneLines.length) next.prepCallReview = phoneLines.join('\n');

  return next;
}

export function allFormKeys(config: { steps: { fields: { key: string }[] }[] }): string[] {
  const keys = new Set<string>();
  for (const step of config.steps) {
    for (const f of step.fields) keys.add(f.key);
  }
  for (const k of DERIVED_KEYS) keys.add(k);
  return [...keys];
}

