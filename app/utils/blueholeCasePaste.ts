import { buildRegistrationPackage } from '@/app/utils/registrationPackage';
import type { InquiryRow, ProcessRow } from '@/app/components/intake/intakeUtils';
import {
  inquiryAdmin,
  inquiryAdminPhone,
  inquiryEmail,
  inquiryFormFields,
  inquiryNote,
  inquiryRepPhone,
} from '@/app/components/intake/intakeUtils';

const FORM_LABELS: Record<string, string> = {
  businessEntityType: '사업자 구분',
  taxTypes: '세목',
  revenue: '매출',
  prevTaxOffice: '이전 세무사',
  prevFee: '이전 기장료',
  meetingDate: '대면 일정',
  consultationMemo: '상담 메모',
  employeeCount: '직원 수',
  payroll: '급여',
  vatType: '부가세 유형',
  withholdingType: '원천 유형',
  specialNotes: '특이사항',
};

function line(label: string, value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return `[${label}] ${s}`;
}

function formatFormValue(key: string, value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value == null) return '';
  return String(value).trim();
}

/** 블루홀 케이스(/case/info)에 붙여넣을 본문 텍스트 */
export function buildBlueholeCasePasteTemplate(
  inquiry: InquiryRow,
  process?: ProcessRow | null,
): string {
  const extra = inquiry.extra;
  const form = inquiryFormFields(extra);
  const monthlyFee = process?.monthlyFee ?? inquiry.proposedFee;
  const channel = process?.channel || inquiry.channel;

  const lines: string[] = [];
  lines.push('=== 유입 상담 정보 ===');
  lines.push('');

  const base = buildRegistrationPackage({
    companyName: inquiry.companyName,
    businessNo: inquiry.businessNo,
    representative: inquiry.representative,
    phone: inquiry.phone,
    monthlyFee,
    manager: inquiry.consultant,
    channel,
    industry: inquiry.industry,
    address: inquiry.address,
    businessEntityType: form?.businessEntityType as string | undefined,
    taxTypes: Array.isArray(form?.taxTypes) ? (form.taxTypes as string[]) : undefined,
  });
  lines.push(base);

  const extras = [
    line('문의일', inquiry.inquiryDate),
    line('계약상태', inquiry.contractStatus),
    process?.feeStartDate ? line('수수료 시작일', process.feeStartDate) : null,
    line('대표 연락', inquiryRepPhone(extra)),
    line('관리자', inquiryAdmin(extra)),
    line('관리자 연락', inquiryAdminPhone(extra)),
    line('이메일', inquiryEmail(extra)),
    line('특이사항', inquiryNote(extra)),
  ].filter((l): l is string => Boolean(l));

  if (extras.length) {
    lines.push('');
    lines.push('--- 연락·메모 ---');
    lines.push(...extras);
  }

  if (inquiry.inquiryContent.trim()) {
    lines.push('');
    lines.push('--- 문의·상담 내용 ---');
    lines.push(inquiry.inquiryContent.trim());
  }

  if (form) {
    const formLines: string[] = [];
    for (const [key, label] of Object.entries(FORM_LABELS)) {
      const val = formatFormValue(key, form[key]);
      if (val) formLines.push(`[${label}] ${val}`);
    }
    for (const [key, val] of Object.entries(form)) {
      if (FORM_LABELS[key]) continue;
      const formatted = formatFormValue(key, val);
      if (!formatted || key.startsWith('_')) continue;
      formLines.push(`[${key}] ${formatted}`);
    }
    if (formLines.length) {
      lines.push('');
      lines.push('--- 신규상담 상세 ---');
      lines.push(...formLines);
    }
  }

  return lines.join('\n');
}
