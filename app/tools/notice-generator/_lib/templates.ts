import { TAX_TYPES } from './taxTypes';
import { getWeekdayKo, formatDottedDate } from './dateUtils';
import type { DeadlineResult, TaxTypeKey } from './types';

const NAME: Record<TaxTypeKey, string> = {
  [TAX_TYPES.VAT]: '부가가치세',
  [TAX_TYPES.WITHHOLDING]: '원천세',
  [TAX_TYPES.CORPORATE]: '법인세',
  [TAX_TYPES.INCOME]: '종합소득세',
};

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 여러 줄 입력값을 HTML 줄바꿈으로 변환
function multilineHtml(str: string): string {
  return escapeHtml((str || '').trim()).replace(/\n/g, '<br>');
}

function adjustmentSentence(deadline: DeadlineResult | null): string {
  if (!deadline || !deadline.wasAdjusted) return '';
  const reasons = deadline.skipped.map(s => s.reason).join(', ');
  return `※ 법정 신고기한(${deadline.statutoryText})이 휴일(${reasons})에 해당하여, 다음 영업일인 ${deadline.finalText}까지 신고·납부하시면 됩니다.`;
}

// 사용자 서식(HTML) 안의 토큰을 계산 결과로 치환합니다.
// 서식(색상·이모지·글꼴 등)은 그대로 유지되고 토큰 값만 채워집니다.
export function renderTemplate({
  template,
  taxType,
  deadline,
  companyName,
  notes,
  materials,
}: {
  template: string;
  taxType: TaxTypeKey;
  deadline: DeadlineResult | null;
  companyName: string;
  notes: string;
  materials: string;
}): string {
  const map: [string, string][] = [
    // 더 구체적인 토큰을 먼저 치환 (부분 일치 방지)
    ['{마감일짧게}', deadline ? escapeHtml(formatDottedDate(deadline.final)) : ''],
    ['{법정마감일}', deadline ? escapeHtml(deadline.statutoryText) : ''],
    ['{마감일}', deadline ? escapeHtml(deadline.finalText) : ''],
    ['{업체명}', escapeHtml((companyName || '').trim())],
    ['{세목}', escapeHtml(NAME[taxType] || '')],
    ['{귀속}', deadline ? escapeHtml(deadline.periodLabel) : ''],
    ['{요일}', deadline ? escapeHtml(getWeekdayKo(deadline.final)) : ''],
    ['{필요자료}', multilineHtml(materials)],
    ['{특이사항}', multilineHtml(notes)],
    ['{휴일안내}', escapeHtml(adjustmentSentence(deadline))],
  ];

  let out = template || '';
  for (const [token, value] of map) {
    out = out.split(token).join(value);
  }
  return out;
}

// 미리보기 HTML → 일반 텍스트 (메신저 붙여넣기용)
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  let s = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '');
  // 엔티티 복원
  const txt = document.createElement('textarea');
  txt.innerHTML = s;
  s = txt.value;
  return s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
}
