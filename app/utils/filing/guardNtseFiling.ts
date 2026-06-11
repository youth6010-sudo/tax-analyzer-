import type { TaxTypeId } from '../../config/taxTypes';
import {
  encryptedEfilingErrorMessage,
  inspectNtseFiling,
  type NtseFilingInfo,
} from './detectNtseFiling';

async function readHeaderByte(file: File): Promise<number | undefined> {
  const buf = await file.slice(0, 1).arrayBuffer();
  return buf.byteLength ? new Uint8Array(buf)[0] : undefined;
}

function isParseableTextFormat(file: File): boolean {
  const name = file.name.toLowerCase();
  if (/\.(json|xml|csv|pdf)$/i.test(name)) return true;
  if (file.type === 'application/pdf' || file.type === 'application/json') return true;
  const trimmed = name;
  if (trimmed.endsWith('.json') || trimmed.endsWith('.xml') || trimmed.endsWith('.csv')) return true;
  return false;
}

function isLikelyNtseBinary(file: File, headerByte?: number): boolean {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (['101', '01', 'enc'].includes(ext)) return true;
  if (/(C|D|I)\d{6}/i.test(file.name)) return true;
  return headerByte === 0x01 && file.size > 100;
}

/** 암호화 전자신고 파일이면 세목별 안내와 함께 throw */
export async function guardNtseFiling(
  file: File,
  expectedTaxType: TaxTypeId,
): Promise<NtseFilingInfo | null> {
  if (isParseableTextFormat(file)) return null;

  const headerByte = await readHeaderByte(file);
  const info = inspectNtseFiling(file, headerByte);

  if (info.isEncrypted || isLikelyNtseBinary(file, headerByte)) {
    throw new Error(encryptedEfilingErrorMessage(info, expectedTaxType));
  }

  return info;
}
