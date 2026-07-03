/** 기장상담.xlsx(청년들 신규기장 상담지) 붙여넣기용 */

export type BookkeepingConsultSource = {
  consultDate?: string;
  consultAmPm?: string;
  consultContactType?: string;
  channel?: string;
  channelDetail?: string;
  requestDetails?: string;
  representative?: string;
  industry?: string;
  companyName?: string;
  revenue?: string;
  phone?: string;
  email?: string;
  payrollFullTime?: string;
  payrollDaily?: string;
  payrollOther?: string;
  businessEntityType?: string;
  vatTaxStatus?: string;
  clientNeeds?: string;
  taxStatusSummary?: string;
  potentialTaxIssues?: string;
  proposedServiceScope?: string;
  feeDirection?: string;
  consultRemarks?: string;
  /** 유입관리 등에서 보조 */
  inquiryContent?: string;
  note?: string;
};

function cell(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function formatConsultDateShort(raw: string): string {
  const m = raw.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return raw.trim();
  return `${m[1].slice(-2)}.${Number(m[2])}.${Number(m[3])}`;
}

function consultDatetimeLine(src: BookkeepingConsultSource): string {
  const date = formatConsultDateShort(cell(src.consultDate));
  const parts = [date, cell(src.consultAmPm), cell(src.consultContactType)].filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  if (date && (src.consultAmPm || src.consultContactType)) {
    const tail = [cell(src.consultAmPm), cell(src.consultContactType)].filter(Boolean).join(', ');
    return `${date} (${tail})`;
  }
  return parts.join(' ');
}

function channelLine(src: BookkeepingConsultSource): string {
  const base = cell(src.channel);
  const detail = cell(src.channelDetail);
  if (base && detail) return `${base} · ${detail}`;
  return base || detail;
}

function payrollCount(v: unknown): string {
  const s = cell(v);
  if (!s || s === '0') return '';
  return s;
}

function sectionLine(label: string, value: string): string[] {
  const v = cell(value);
  if (!v) return [`${label}`, ''];
  return [`${label}`, v, ''];
}

export function buildBookkeepingConsultSheetText(src: BookkeepingConsultSource): string {
  const lines: string[] = ['청년들 신규기장 상담지', ''];

  const when = consultDatetimeLine(src);
  const channel = channelLine(src);
  lines.push(`상담일시\t${when}\t\t유입경로\t${channel}`);
  lines.push('\t(날짜, 시간(오전·오후), 유선OR대면)\t\t(소개, 검색경로: 블로그, AI, 홍보앱, SNS)', '');
  lines.push(`요청사항\t${cell(src.requestDetails)}`, '');

  lines.push(`성 함\t${cell(src.representative)}\t\t업 종\t${cell(src.industry)}`);
  lines.push(`상호명\t${cell(src.companyName)}\t\t매출 규모\t${cell(src.revenue)}`);
  lines.push(`연락처\t${cell(src.phone)}\t\t이메일\t${cell(src.email)}`, '');

  const ft = payrollCount(src.payrollFullTime);
  const daily = payrollCount(src.payrollDaily);
  const other = payrollCount(src.payrollOther);
  lines.push('인건비 신고여부(사대보험 등)\t상용직\t일용직\t사업/기타');
  lines.push(`\t${ft}\t${daily}\t${other}`);
  lines.push(
    `사업자 유형\t${cell(src.businessEntityType)}\t\t과·면세 여부\t${cell(src.vatTaxStatus)}`,
    '',
  );

  lines.push('상담내용');
  lines.push(...sectionLine('1) 고객의 니즈, 주요 요구사항', cell(src.clientNeeds) || cell(src.inquiryContent)));
  lines.push(...sectionLine('2) 세무현황요약 (매출, 비용, 인건비, 신고상태)', cell(src.taxStatusSummary)));
  lines.push(...sectionLine('3) 잠재적 세무 이슈', cell(src.potentialTaxIssues)));
  lines.push(...sectionLine('4) 제시 서비스 범위', cell(src.proposedServiceScope)));
  lines.push(...sectionLine('5) 수임료 방향', cell(src.feeDirection)));
  lines.push(...sectionLine('6) 비고·특이사항', cell(src.consultRemarks) || cell(src.note)));

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function formRecordToBookkeepingSource(
  form: Record<string, unknown>,
  extras?: Partial<BookkeepingConsultSource>,
): BookkeepingConsultSource {
  const pick = (key: string) => cell(form[key]);
  return {
    consultDate: pick('consultDate') || pick('meetingDate') || pick('recordMeetingAt'),
    consultAmPm: pick('consultAmPm'),
    consultContactType: pick('consultContactType'),
    channel: pick('channel'),
    channelDetail: pick('channelDetail'),
    requestDetails: pick('requestDetails'),
    representative: pick('representative'),
    industry: pick('industry'),
    companyName: pick('companyName'),
    revenue: pick('revenue'),
    phone: pick('phone'),
    email: pick('email'),
    payrollFullTime: pick('payrollFullTime'),
    payrollDaily: pick('payrollDaily'),
    payrollOther: pick('payrollOther'),
    businessEntityType: pick('businessEntityType'),
    vatTaxStatus: pick('vatTaxStatus'),
    clientNeeds: pick('clientNeeds') || pick('needPain'),
    taxStatusSummary: pick('taxStatusSummary') || pick('recordSummary'),
    potentialTaxIssues: pick('potentialTaxIssues') || pick('diagTaxRisks'),
    proposedServiceScope: pick('proposedServiceScope') || pick('agreedServiceScope'),
    feeDirection: pick('feeDirection') || pick('feeGuidanceNote'),
    consultRemarks: pick('consultRemarks') || pick('followUpNotes'),
    ...extras,
  };
}
