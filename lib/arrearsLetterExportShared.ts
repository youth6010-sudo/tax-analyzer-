/** 클라이언트·서버 공용 — Node fs 없음 */

export const ARREARS_LETTER_ORG = 'Youth tax Management Corporation';
export const ARREARS_LETTER_BANK = '부산은행 113-2016-5229-07 세무법인 청년들';
export const ARREARS_LETTER_ADDR = '부산광역시 해운대구 센텀중앙로 90, 큐비E센텀 1501호';
export const ARREARS_LETTER_TEL = 'TEL : 051-783-6007 / FAX : 051-784-6007';

/** 공문 수신처 표기: (주) → ㈜ */
export function letterCompanyDisplayName(name: string): string {
  return String(name || '')
    .replace(/\(주\)/g, '㈜')
    .replace(/㈜\s+/g, '㈜')
    .trim();
}

/**
 * 파일명: 미수수수료_{담당}-YY.MM.DD.xlsx
 * 날짜는 저장(내려받기) 당일(한국시간). 인디만 `미수수수료-인디-…`
 */
export function arrearsLetterExportFilename(
  managerName: string,
  _letterDate = '',
  ext: 'xlsx' | 'xls' = 'xlsx',
): string {
  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 10);
  const [y, mo, d] = today.split('-');
  const stamp = `${(y || '').slice(2)}.${mo}.${d}`;
  const mgr = (managerName || '전체').replace(/[\\/:*?"<>|]/g, '').trim() || '전체';
  const sep = mgr === '인디' ? '-' : '_';
  const realExt = 'xlsx';
  void ext;
  return `미수수수료${sep}${mgr}-${stamp}.${realExt}`;
}
