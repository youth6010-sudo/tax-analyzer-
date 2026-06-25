import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';
import { BUSINESS_ENTITY_LABEL, type BusinessEntityType } from '@/app/types/contact';
import { TAX_TYPES } from '@/app/config/taxTypes';

export type RegistrationPackageInput = {
  companyName: string;
  businessNo?: string;
  representative?: string;
  phone?: string;
  monthlyFee?: number | null;
  manager?: string;
  channel?: string;
  businessEntityType?: BusinessEntityType | string;
  taxTypes?: string[];
  industry?: string;
  address?: string;
};

const TAX_LABEL: Record<string, string> = Object.fromEntries(
  TAX_TYPES.map(t => [t.id, t.label]),
);

export function buildRegistrationPackage(input: RegistrationPackageInput): string {
  const lines: string[] = [];
  lines.push(`[상호] ${input.companyName.trim() || '(미입력)'}`);
  if (input.businessNo?.trim()) lines.push(`[사업자] ${input.businessNo.trim()}`);
  if (input.representative?.trim()) lines.push(`[대표] ${input.representative.trim()}`);
  if (input.phone?.trim()) lines.push(`[연락처] ${input.phone.trim()}`);
  if (input.monthlyFee != null) {
    lines.push(`[${CLIENT_FIELD_LABELS.fee}] ${input.monthlyFee.toLocaleString('ko-KR')}원`);
  }
  if (input.manager?.trim()) lines.push(`[담당] ${input.manager.trim()}`);
  if (input.channel?.trim()) lines.push(`[유입] ${input.channel.trim()}`);
  if (input.businessEntityType) {
    const label = BUSINESS_ENTITY_LABEL[input.businessEntityType as BusinessEntityType]
      ?? input.businessEntityType;
    lines.push(`[구분] ${label}`);
  }
  if (input.taxTypes?.length) {
    lines.push(`[세목] ${input.taxTypes.map(t => TAX_LABEL[t] ?? t).join(', ')}`);
  }
  if (input.industry?.trim()) lines.push(`[업종] ${input.industry.trim()}`);
  if (input.address?.trim()) lines.push(`[주소] ${input.address.trim()}`);
  return lines.join('\n');
}

export function registrationPackageFromInquiry(inquiry: {
  companyName: string;
  phone?: string;
  businessNo?: string;
  representative?: string;
  proposedFee?: number | null;
  channel?: string;
  consultant?: string;
  industry?: string;
  address?: string;
}): string {
  return buildRegistrationPackage({
    companyName: inquiry.companyName,
    phone: inquiry.phone,
    businessNo: inquiry.businessNo,
    representative: inquiry.representative,
    monthlyFee: inquiry.proposedFee,
    channel: inquiry.channel,
    manager: inquiry.consultant,
    industry: inquiry.industry,
    address: inquiry.address,
  });
}
