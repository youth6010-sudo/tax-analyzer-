import type { TaxTypeId } from '../../config/taxTypes';

/** 국세청 전자신고(NTS) 파일 형식 감지 */

export interface NtseFilingInfo {
  isEncrypted: boolean;
  formCode: string | null;
  formLabel: string | null;
  taxType: TaxTypeId | null;
  extension: string;
  fileName: string;
  sizeBytes: number;
}

/** 서식코드 → 세목 (국세청 전자신고 기준) */
const FORM_META: Record<string, { label: string; taxType: TaxTypeId }> = {
  C103900: { label: '원천징수이행상황신고서', taxType: 'withholding' },
  C103901: { label: '원천징수이행상황신고서 부속', taxType: 'withholding' },
  D100100: { label: '법인세 과세표준 및 세액신고서', taxType: 'corporate' },
  D100101: { label: '법인세 신고서 부속서류', taxType: 'corporate' },
  C110700: { label: '종합소득세 신고서', taxType: 'comprehensive' },
  C110701: { label: '종합소득세 신고서 부속', taxType: 'comprehensive' },
  I103200: { label: '부가가치세 신고서', taxType: 'vat' },
  I104100: { label: '부가가치세 신고서', taxType: 'vat' },
};

const TAX_TYPE_LABEL: Record<TaxTypeId, string> = {
  withholding: '원천세',
  vat: '부가세',
  corporate: '법인세',
  comprehensive: '종합소득세',
};

const TAX_TYPE_HREF: Record<TaxTypeId, string> = {
  withholding: '/tax/withholding',
  vat: '/tax/vat',
  corporate: '/tax/corporate',
  comprehensive: '/tax/comprehensive',
};

export function extractFormCode(filename: string): string | null {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const m = base.match(/(C\d{6}|D\d{6}|I\d{6})/i);
  return m ? m[1].toUpperCase() : null;
}

/** enc798850183620260610.101 — 사업자번호+일자 .101 부가세 전자신고 관행 */
function inferTaxTypeFromName(filename: string, formCode: string | null): TaxTypeId | null {
  if (formCode && FORM_META[formCode]) return FORM_META[formCode].taxType;

  const base = filename.split(/[/\\]/).pop() ?? filename;
  if (/^enc\d{10}\d{8}\.101$/i.test(base)) return 'vat';
  if (/^\d{8}(C|D|I)\d{6}\./i.test(base) && formCode && FORM_META[formCode]) {
    return FORM_META[formCode].taxType;
  }
  if (/\.101$/i.test(base) && !formCode) return 'vat';

  return null;
}

export function isEncryptedEfilingName(filename: string): boolean {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  return /^enc/i.test(base) || /\.enc$/i.test(base);
}

export function inspectNtseFiling(file: File, headerByte?: number): NtseFilingInfo {
  const fileName = file.name;
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  const formCode = extractFormCode(fileName);
  const meta = formCode ? FORM_META[formCode] : null;
  const isEncrypted =
    isEncryptedEfilingName(fileName) ||
    ext === 'enc' ||
    (headerByte === 0x01 && ['101', '01', 'enc'].includes(ext));

  return {
    isEncrypted,
    formCode,
    formLabel: meta?.label ?? (formCode ? `서식 ${formCode}` : null),
    taxType: inferTaxTypeFromName(fileName, formCode),
    extension: ext,
    fileName,
    sizeBytes: file.size,
  };
}

export function encryptedEfilingErrorMessage(
  info: NtseFilingInfo,
  expectedTaxType?: TaxTypeId,
): string {
  const form = info.formLabel ?? '전자신고';
  const detected = info.taxType ? TAX_TYPE_LABEL[info.taxType] : null;
  const lines: string[] = [
    `「${info.fileName}」은 홈택스 제출용 암호화된 ${form} 파일입니다.`,
    '',
    '국세청 NTS 암호화가 적용되어 웹에서 내용을 직접 읽을 수 없습니다.',
  ];

  if (info.taxType && expectedTaxType && info.taxType !== expectedTaxType) {
    lines.push(
      '',
      `이 파일은 ${detected} 신고 자료로 보입니다. 「${TAX_TYPE_LABEL[expectedTaxType]} 검증」 탭이 아니라 「${detected} 검증」(${TAX_TYPE_HREF[info.taxType]})에서 업로드해 주세요.`,
    );
  } else if (detected) {
    lines.push('', `감지된 세목: ${detected}${info.formCode ? ` (서식 ${info.formCode})` : ''}`);
  }

  lines.push(
    '',
    '검증에 쓸 수 있는 대안:',
    '• 세무사랑·회계 프로그램에서 해당 신고서 PDF 저장 후 업로드',
    '• 암호화 이전 파일(enc 없는 .101 / .01) — 프로그램 검토용',
    '• JSON·CSV·XML 변환 파일',
  );

  if (info.formCode) {
    const hint: Record<string, string> = {
      C103900: 'C103900 = 원천징수이행상황신고서',
      D100100: 'D100100 = 법인세 과세표준 및 세액신고서',
    };
    if (hint[info.formCode]) lines.push('', hint[info.formCode]);
  }

  return lines.join('\n');
}

export { TAX_TYPE_LABEL, TAX_TYPE_HREF };
