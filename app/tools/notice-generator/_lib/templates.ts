import { TAX_TYPES } from './taxTypes';
import { getWeekdayKo, formatDottedDate, addDays } from './dateUtils';
import type { DeadlineResult, MaterialDeadline, TaxTypeKey } from './types';

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
  return `※ 법정 신고기한이 휴일(${reasons})에 해당하여, 다음 영업일인 ${deadline.finalText}까지 신고·납부하시면 됩니다.`;
}

// 사용자 서식(HTML) 안의 토큰을 계산 결과로 치환합니다.
// 서식(색상·이모지·글꼴 등)은 그대로 유지되고 토큰 값만 채워집니다.
// 자료 제출 마감 줄 전체를 "자료 제출 마감: 2026. 06. 25 (금) 13:00" 형태로 표기.
// 토글이 꺼져 있거나 날짜가 비어 있으면 빈 문자열 반환(해당 줄 자동 제거).
export function formatMaterialDeadlineLine(md: MaterialDeadline | null | undefined): string {
  if (!md || !md.enabled || !md.date) return '';
  const [y, m, d] = md.date.split('-').map(Number);
  if (!y || !m || !d) return '';
  const date = new Date(y, m - 1, d);
  const hh = String(md.hour).padStart(2, '0');
  const mm = String(md.minute).padStart(2, '0');
  return `자료 제출 마감: ${formatDottedDate(date)} ${hh}:${mm}`;
}

// 하단 안내 멘트. 제출 마감 2일 전 날짜를 자동 계산해 표기.
// 토글이 꺼져 있거나 날짜가 없으면 빈 문자열(해당 줄 자동 제거).
export function formatMaterialDeadlineNote(md: MaterialDeadline | null | undefined): string {
  if (!md || !md.enabled || !md.date) return '';
  const [y, m, d] = md.date.split('-').map(Number);
  if (!y || !m || !d) return '';
  const twoDaysBefore = addDays(new Date(y, m - 1, d), -2);
  return `※ 원활한 신고 업무를 위해 기한 준수를 부탁드리며, 일정 조정이 필요하시면 ${formatDottedDate(twoDaysBefore)}까지 말씀해 주시기 바랍니다.`;
}

// 대상기간(과세/귀속 기간)을 "2026. 01. 01 ~ 2026. 03. 31" 형태로 표기
function coverageRangeText(deadline: DeadlineResult | null): string {
  if (!deadline) return '';
  const start = formatDottedDate(deadline.coverageStart, { withWeekday: false });
  const end = formatDottedDate(deadline.coverageEnd, { withWeekday: false });
  return `${start} ~ ${end}`;
}

export function renderTemplate({
  template,
  taxType,
  deadline,
  companyName,
  notes,
  materials,
  materialDeadline = '',
  materialDeadlineNote = '',
}: {
  template: string;
  taxType: TaxTypeKey;
  deadline: DeadlineResult | null;
  companyName: string;
  notes: string;
  materials: string;
  // 자료 제출 마감 줄 전체 (예: "자료 제출 마감: 2026. 06. 25 (금) 13:00"), 미사용 시 빈 문자열
  materialDeadline?: string;
  // 하단 안내 멘트 (제출 마감 2일 전 안내), 미사용 시 빈 문자열
  materialDeadlineNote?: string;
}): string {
  const map: [string, string][] = [
    // 더 구체적인 토큰을 먼저 치환 (부분 일치 방지)
    ['{마감일짧게}', deadline ? escapeHtml(formatDottedDate(deadline.final)) : ''],
    ['{법정마감일}', deadline ? escapeHtml(deadline.statutoryText) : ''],
    ['{마감일}', deadline ? escapeHtml(deadline.finalText) : ''],
    ['{대상기간}', escapeHtml(coverageRangeText(deadline))],
    ['{세금납부기한}', deadline ? escapeHtml(formatDottedDate(deadline.final)) : ''],
    ['{자료제출마감}', escapeHtml(materialDeadline)],
    ['{자료제출안내}', escapeHtml(materialDeadlineNote)],
    ['{업체명}', escapeHtml((companyName || '').trim())],
    ['{세목}', escapeHtml(NAME[taxType] || '')],
    ['{귀속}', deadline ? escapeHtml(deadline.periodLabel) : ''],
    ['{요일}', deadline ? escapeHtml(getWeekdayKo(deadline.final)) : ''],
    ['{필요자료}', multilineHtml(materials)],
    ['{특이사항}', multilineHtml(notes)],
    ['{휴일안내}', escapeHtml(adjustmentSentence(deadline))],
  ];

  // 저장된 옛 서식에 새 토큰이 없을 수 있으므로, 누락 시 하단에 직접 덧붙이기 위해 확인
  const tpl = template || '';
  const hasNoteToken = tpl.includes('{자료제출안내}');

  let out = tpl;
  for (const [token, value] of map) {
    out = out.split(token).join(value);
  }
  // 레거시 기본 서식의 청록색(세금 납부 기한 강조) 제거 — 저장된 옛 서식 마이그레이션
  out = out.replace(/color\s*:\s*#13a89e\s*;?/gi, '');
  // 토큰이 비어 내용이 사라진 블록(<div>/<p>) 제거 — <br>만 있는 빈 줄은 유지
  out = out.replace(/<(div|p)\b[^>]*>\s*<\/\1>/gi, '');
  // 옛 서식에 {자료제출안내} 토큰이 없으면 하단에 안내 멘트를 직접 추가 (토글 ON일 때만 값 존재)
  if (materialDeadlineNote && !hasNoteToken) {
    out += `<div><br></div><div>${escapeHtml(materialDeadlineNote)}</div>`;
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
