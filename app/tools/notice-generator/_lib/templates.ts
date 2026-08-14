import { TAX_TYPES } from './taxTypes';
import { DEFAULT_PAYMENT_NOTICE_TEMPLATE, DEFAULT_VAT_REPORT_TEMPLATE } from './template';
import {
  getWeekdayKo,
  formatDottedDate,
  addDays,
  lastDayOfMonth,
  isNonBusinessDay,
  adjustToNextBusinessDay,
} from './dateUtils';
import type {
  DeadlineResult,
  MaterialDeadline,
  PaymentNotice,
  TaxTypeKey,
  VatReport,
} from './types';
import {
  ensureWithholdingItems,
  usesWithholdingBreakdown,
  WITHHOLDING_ITEM_LABELS,
} from './withholdingItems';

const NAME: Record<TaxTypeKey, string> = {
  [TAX_TYPES.VAT]: '부가가치세',
  [TAX_TYPES.WITHHOLDING]: '원천세',
  [TAX_TYPES.CORPORATE]: '법인세',
  [TAX_TYPES.INCOME]: '종합소득세',
};

function displayTaxName(taxType: TaxTypeKey, _deadline: DeadlineResult | null): string {
  return NAME[taxType] || '';
}

function isCorpInterimNotice(deadline: DeadlineResult | null): boolean {
  return Boolean(deadline?.periodLabel.includes('중간예납'));
}

function coverageMonthRange(deadline: DeadlineResult | null): string {
  if (!deadline) return '';
  const a = deadline.coverageStart.getMonth() + 1;
  const b = deadline.coverageEnd.getMonth() + 1;
  if (!a || !b) return '';
  return a === b ? `${a}월` : `${a}~${b}월`;
}

/** 예정고지·중간예납 — 쉬운 설명 + 이번 납부 안내 */
function specialPaymentIntro(
  vatNoticeOnly: boolean,
  corpInterim: boolean,
  deadline: DeadlineResult | null,
): string {
  const line = noticeLine;
  const months = coverageMonthRange(deadline);
  if (vatNoticeOnly) return '';
  if (corpInterim) {
    const period = months ? `(${months}) ` : '';
    return (
      line('안녕하세요. 법인세 중간예납 납부를 안내드립니다.') +
      line(
        `중간예납은 사업연도 전반기 ${period}실적에 대해 세액을 미리 납부하실 차례입니다. 아래 금액을 확인하신 뒤 기한 안에 납부해 주시면 됩니다.`,
      )
    );
  }
  return '';
}

function formatNoticeDateKo(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일(${getWeekdayKo(date)})`;
}

function formatNoticeDateShort(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}(${getWeekdayKo(date)})`;
}

/** 부가세 예정고지 분납 기한 — 1기: 납부일·6/1·6/30, 2기: 납부일·12/1·12/31 (휴일 보정) */
export function vatNoticeInstallmentDates(due: Date, secondHalf: boolean): Date[] {
  const y = due.getFullYear();
  const second = secondHalf ? new Date(y, 11, 1) : new Date(y, 5, 1);
  const third = secondHalf ? new Date(y, 11, 31) : new Date(y, 5, 30);
  return [
    due,
    adjustToNextBusinessDay(second).adjusted,
    adjustToNextBusinessDay(third).adjusted,
  ];
}

export const DEFAULT_CORP_INTERIM_FILING_NOTE =
  "상반기 가결산 결과 결손이 발생하였습니다. 해당 결과로 신고 시 수반되는 세무적 리스크를 고려하여, '직전 사업연도 기준'으로 신고를 마쳤습니다.";

export const DEFAULT_CORP_INTERIM_AMOUNT_NOTE = '직전 사업연도 법인세의 50%';

function buildCorpInterimNoticeBody(
  deadline: DeadlineResult | null,
  payment: PaymentNotice,
): string {
  const line = noticeLine;
  const blank = noticeBlank;
  const yearMatch = deadline?.periodLabel.match(/^(\d{4})/);
  const year = yearMatch ? Number(yearMatch[1]) : deadline?.final.getFullYear();
  const month = deadline?.final ? deadline.final.getMonth() + 1 : '';
  const due = deadline?.final;
  const dueText = due ? `${formatNoticeDateKo(due)}까지` : '';
  const amount = truncateWonUnit(payment.amount || 0);
  const amountText = `${Math.abs(amount).toLocaleString('ko-KR')}원`;
  const amountNote =
    payment.corpInterimAmountNote === ''
      ? ''
      : (payment.corpInterimAmountNote?.trim() || DEFAULT_CORP_INTERIM_AMOUNT_NOTE);
  const amountLine = amountNote ? `${amountText} (${amountNote})` : amountText;
  const filingNote = (payment.corpInterimFilingNote || '').trim() || DEFAULT_CORP_INTERIM_FILING_NOTE;
  const followup = Boolean(payment.corpInterimBankFollowup);
  const replyIso = (payment.corpInterimReplyDate || '').trim();
  let replyText = `${year}년 ${month}월 OO일까지`;
  if (replyIso) {
    const [y, m, d] = replyIso.split('-').map(Number);
    if (y && m && d) replyText = `${y}년 ${m}월 ${d}일까지`;
  }

  const parts: string[] = [
    line(`📋${year}년 법인세 중간예납 납부 안내`),
    blank(),
    line(
      `${month}월 법인세 중간예납 신고·납부 기간을 맞아 관련 내용을 다음과 같이 안내해 드립니다.`,
    ),
    blank(),
    line('1. 법인세 중간예납 납부 안내'),
    line(`납부 기한: ${escapeHtml(dueText)}`),
    line(`납부 세액: ${escapeHtml(amountLine)}`),
    line(`신고 방식: ${escapeHtml(filingNote)}`),
    line('조치 사항: 첨부된 납부서를 확인하시어 기한 내에 납부해 주시기 바랍니다.'),
  ];

  if (followup) {
    parts.push(
      blank(),
      line('2. 통장 내역 추가 확인 요청'),
      line(
        '보내주신 통장 내역을 검토한 결과, 정확한 처리를 위해 추가로 확인이 필요한 사항이 있어 별첨으로 정리해 드립니다.',
      ),
      line(`회신 기한: ${escapeHtml(replyText)}`),
      line("회신 방법: 첨부 파일의 '비고/답변란'을 작성하여 증빙과 함께 회신 부탁드립니다."),
    );
  }

  parts.push(blank(), blank(), line('첨부 파일:'), line('법인세 중간예납 납부서 1부'));
  if (followup) {
    parts.push(line(`${year}년 상반기 추가 확인 요청 리스트 1부`));
  }
  return parts.join('');
}

function buildVatPreliminaryNoticeBody(
  deadline: DeadlineResult | null,
  payment: PaymentNotice,
): string {
  const line = noticeLine;
  const blank = noticeBlank;
  const amount = truncateWonUnit(payment.amount || 0);
  const amountText = `${Math.abs(amount).toLocaleString('ko-KR')}원`;
  const year = deadline?.coverageStart.getFullYear() || deadline?.final.getFullYear();
  const secondHalf = (deadline?.periodLabel ?? '').includes('2기');
  const half = secondHalf ? '2기' : '1기';
  const due = deadline?.final;
  const dueText = due ? formatNoticeDateKo(due) : '';
  const inst = due ? vatNoticeInstallmentDates(due, secondHalf) : [];

  const parts: string[] = [
    line('안녕하세요 세무법인청년들 부산지점입니다.'),
    blank(),
    line(`${year}년 ${half} 부가가치세 예정고지 납부 안내드립니다.`),
    blank(),
    line('국세청 우편 고지서 수령이 늦어지거나 분실될 경우를 대비하여 납부서 먼저 송부드립니다.'),
    blank(),
    line(`납부금액 : ${escapeHtml(amountText)}`),
    line(`납부기한: ${escapeHtml(dueText)}`),
    line('가상계좌 납부는 당일 밤 11시 마감됩니다.'),
    line('미납 시 가산세가 발생하므로 기한 내 납부 부탁드립니다.'),
    blank(),
    line('[분납 안내 (최대 3회)]'),
    line('일시 납부가 어려우실 경우 아래 일정으로 나누어 납부 가능합니다.'),
  ];
  inst.forEach((d, i) => {
    parts.push(line(`-${i + 1}차: ${escapeHtml(formatNoticeDateShort(d))}`));
  });
  parts.push(
    blank(),
    line('분납을 원하실 경우, 희망하시는 [횟수와 금액]을 회신해 주시기 바랍니다.'),
    blank(),
    line('감사합니다.'),
  );
  return parts.join('');
}

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

/** 특이사항·필요자료 등이 실질적으로 비었는지 (HTML 빈 태그·nbsp 무시) */
export function isNoticeFieldEmpty(str: string | null | undefined): boolean {
  if (!str?.trim()) return true;
  const text = str
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return !text;
}

/** 수임처 정보 입력란 — 평문은 br 변환, HTML은 서식 정리·평탄화 후 삽입 */
export function noticeFieldToHtml(str: string): string {
  if (isNoticeFieldEmpty(str)) return '';
  let html = /<[a-z][\s\S]*>/i.test(str) ? sanitizeNoticeHtml(str) : multilineHtml(str);
  // 여러 줄이면 끝 줄바꿈 유지, 한 줄이면 서식의 다음 토큰과 붙지 않게 br 추가
  if (html && !/(?:<br\s*\/?>)\s*$/i.test(html)) html += '<br>';
  return html;
}

/** 한글/워드 붙여넣기 시 줄이 늘어나지 않도록 단일 래퍼 + &lt;br&gt; 줄 구조 */
function noticeLine(text: string): string {
  return `${text}<br>`;
}

function noticeBlank(): string {
  return '<br>';
}

function noticeDash(text: string): string {
  return `&nbsp;- ${text}<br>`;
}

const NOTICE_TEXT_COLOR = '#334155';

const INLINE_UNWRAP_TAGS = new Set([
  'span',
  'a',
  'cite',
  's',
  'strike',
  'del',
  'ins',
  'sub',
  'sup',
  'font',
  'mark',
]);

function wrapNoticeHtml(body: string): string {
  return `<div style="margin:0;padding:0;line-height:1.55;color:${NOTICE_TEXT_COLOR};font-size:14px;text-align:left;">${body}</div>`;
}

/** 빈 문단 — 글자 없고 br도 없을 때만 진짜 빈 칸 */
function isBlankBlock(el: HTMLElement): boolean {
  const text = (el.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  if (text) return false;
  const html = el.innerHTML
    .replace(/\u00a0/g, '')
    .replace(/&nbsp;/gi, '')
    .replace(/\s/g, '')
    .toLowerCase();
  // <br>만 있으면 의도된 빈 줄 — 삭제로 취급하지 않음
  if (/^(?:<br\/?>)+$/.test(html)) return false;
  return html === '';
}

/** 빈 줄 전용 블록(<div><br></div>) → <br> 로 치환해 서식 간격 유지 */
function normalizeSpacerBlocks(root: HTMLElement) {
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    root.querySelectorAll('p,div').forEach(node => {
      const el = node as HTMLElement;
      if (el === root) return;
      if (el.querySelector('p,div,table,ul,ol')) return;
      const text = (el.textContent ?? '').replace(/\u00a0/g, ' ').trim();
      if (text) return;
      const html = el.innerHTML
        .replace(/\u00a0/g, '')
        .replace(/&nbsp;/gi, '')
        .replace(/\s/g, '')
        .toLowerCase();
      if (!/^(?:<br\/?>)+$/.test(html)) return;
      const brCount = (html.match(/<br\/?>/g) || []).length;
      const frag = document.createDocumentFragment();
      for (let i = 0; i < brCount; i++) frag.appendChild(document.createElement('br'));
      el.replaceWith(frag);
      changed = true;
    });
    if (!changed) break;
  }
}

/** DOM에서 완전 빈 p/div 제거 (br 스페이서는 normalizeSpacerBlocks에서 처리) */
function removeBlankBlocks(root: HTMLElement) {
  normalizeSpacerBlocks(root);
  for (let pass = 0; pass < 8; pass++) {
    let removed = false;
    root.querySelectorAll('p,div').forEach(node => {
      const el = node as HTMLElement;
      if (el === root) return;
      if (!isBlankBlock(el)) return;
      if (el.querySelector('p,div,table,ul,ol')) return;
      el.remove();
      removed = true;
    });
    if (!removed) break;
  }
}

function isBoldLike(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'b' || tag === 'strong' || /^h[1-6]$/.test(tag)) return true;
  const fontWeight = (el.style.fontWeight || '').trim().toLowerCase();
  if (fontWeight === 'bold' || fontWeight === 'bolder') return true;
  const numeric = Number.parseInt(fontWeight, 10);
  return Number.isFinite(numeric) && numeric >= 600;
}

function isItalicLike(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'i' || tag === 'em') return true;
  const fontStyle = (el.style.fontStyle || '').trim().toLowerCase();
  return fontStyle === 'italic' || fontStyle === 'oblique';
}

function isUnderlineLike(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'u') return true;
  const deco = `${el.style.textDecorationLine} ${el.style.textDecoration}`.toLowerCase();
  return deco.includes('underline');
}

function spanToSemanticInline(el: HTMLElement): HTMLElement | null {
  const bold = isBoldLike(el);
  const italic = isItalicLike(el);
  const underline = isUnderlineLike(el);
  if (!bold && !italic && !underline) return null;

  let wrapped: HTMLElement = document.createElement('span');
  while (el.firstChild) wrapped.appendChild(el.firstChild);
  if (underline) {
    const u = document.createElement('u');
    u.appendChild(wrapped);
    wrapped = u;
  }
  if (italic) {
    const em = document.createElement('em');
    em.appendChild(wrapped);
    wrapped = em;
  }
  if (bold) {
    const strong = document.createElement('strong');
    strong.appendChild(wrapped);
    wrapped = strong;
  }
  return wrapped;
}

function clearForeignPresentation(el: HTMLElement) {
  el.style.removeProperty('background');
  el.style.removeProperty('background-color');
  el.style.removeProperty('background-image');
  el.style.removeProperty('color');
  el.style.removeProperty('text-decoration');
  el.style.removeProperty('text-decoration-line');
  el.style.removeProperty('text-decoration-color');
  el.style.removeProperty('font-style');
  el.style.removeProperty('font-size');
  el.style.removeProperty('font-family');
  el.style.removeProperty('letter-spacing');
  el.style.removeProperty('vertical-align');
}

function sanitizeNodeStyles(el: HTMLElement) {
  const tag = el.tagName.toLowerCase();
  const isTable = tag === 'table';
  const isCell = tag === 'td' || tag === 'th';
  const isTableRow = tag === 'tr';
  const isTableSection = tag === 'thead' || tag === 'tbody' || tag === 'tfoot' || tag === 'colgroup' || tag === 'col';
  const isBold = isBoldLike(el) || tag === 'th';

  const prevAlign = el.style.textAlign;
  const prevWidth = el.style.width;
  const prevColSpan = el.getAttribute('colspan');
  const prevRowSpan = el.getAttribute('rowspan');
  // 부가세 요약표 등 — 편집 후에도 구분 색·글자색 유지
  const prevBg =
    (el.style.backgroundColor || el.style.background || '').trim() ||
    (el.getAttribute('bgcolor') || '').trim();
  const prevColor = (el.style.color || '').trim();
  const prevFontWeight = (el.style.fontWeight || '').trim();
  const prevWhiteSpace = (el.style.whiteSpace || '').trim();
  const prevVerticalAlign = (el.style.verticalAlign || '').trim();
  const prevPadding = (el.style.padding || '').trim();
  const prevFontSize = (el.style.fontSize || '').trim();
  const cellIndex =
    isCell && typeof (el as HTMLTableCellElement).cellIndex === 'number'
      ? (el as HTMLTableCellElement).cellIndex
      : -1;

  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'colspan' || attr.name === 'rowspan') continue;
    el.removeAttribute(attr.name);
  }
  if (prevColSpan) el.setAttribute('colspan', prevColSpan);
  if (prevRowSpan) el.setAttribute('rowspan', prevRowSpan);

  el.removeAttribute('style');
  clearForeignPresentation(el);

  if (isTable) {
    el.style.borderCollapse = 'collapse';
    el.style.tableLayout = 'fixed';
    if (prevWidth) el.style.width = prevWidth;
    // align/float 쓰면 한글·워드에서 다음 글이 표 옆으로 붙음
    el.removeAttribute('align');
    el.style.display = 'table';
    el.style.float = 'none';
    el.style.clear = 'both';
    el.style.margin = '6px 0';
    el.style.marginLeft = '0';
    el.style.marginRight = '0';
    el.style.fontSize = '13px';
    el.style.lineHeight = '1.7';
    el.style.color = NOTICE_TEXT_COLOR;
    el.style.backgroundColor = 'transparent';
    return;
  }

  if (isTableSection || isTableRow) {
    el.style.backgroundColor = 'transparent';
    return;
  }

  if (isCell) {
    el.style.border = '1px solid #cbd5e1';
    el.style.padding = prevPadding || '7px 10px';
    el.style.fontSize = prevFontSize || '12px';
    el.style.lineHeight = '1.45';
    el.style.verticalAlign = prevVerticalAlign || 'middle';
    el.style.whiteSpace = prevWhiteSpace || 'nowrap';

    // 배경·글자색 유지 (투명/본문색으로 덮어쓰지 않음)
    const bgNorm = prevBg.replace(/\s/g, '').toLowerCase();
    const keepBg =
      prevBg &&
      bgNorm !== 'transparent' &&
      bgNorm !== 'rgba(0,0,0,0)' &&
      bgNorm !== 'inherit';
    if (keepBg) {
      el.style.background = prevBg;
      el.style.backgroundColor = prevBg;
    } else {
      el.style.background = '#ffffff';
      el.style.backgroundColor = '#ffffff';
    }

    const colorNorm = prevColor.replace(/\s/g, '').toLowerCase();
    const lightColor =
      !prevColor ||
      colorNorm === '#fff' ||
      colorNorm === '#ffffff' ||
      colorNorm === 'white' ||
      colorNorm === 'rgb(255,255,255)' ||
      colorNorm === '#f8fafc' ||
      colorNorm === '#f1f5f9';
    el.style.color = lightColor ? NOTICE_TEXT_COLOR : prevColor;

    if (isBold || prevFontWeight === 'bold' || prevFontWeight === '700') {
      el.style.fontWeight = '700';
    } else if (prevFontWeight) {
      el.style.fontWeight = prevFontWeight;
    }

    // 열 정렬 통일 — 1열(구분) 왼쪽, 2·3열(공급가·세액) 오른쪽 / 제목행은 가운데
    if (tag === 'th') {
      el.style.textAlign = 'center';
    } else if (cellIndex > 0) {
      el.style.textAlign = 'right';
    } else if (prevAlign === 'right' || prevAlign === 'center') {
      el.style.textAlign = prevAlign;
    } else {
      el.style.textAlign = 'left';
    }
    return;
  }

  el.style.color = NOTICE_TEXT_COLOR;
  el.style.backgroundColor = 'transparent';
  if (tag === 'div' || tag === 'p' || tag === 'li') {
    el.style.margin = '0';
  }
  if (isBold) {
    el.style.fontWeight = '700';
  } else {
    el.style.fontWeight = '';
  }
}

function replaceHeadingWithStrong(root: HTMLElement) {
  root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
    const strong = document.createElement('strong');
    while (h.firstChild) strong.appendChild(h.firstChild);
    h.replaceWith(strong);
  });
}

function normalizeInlineNoticeMarkup(root: HTMLElement) {
  replaceHeadingWithStrong(root);

  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    const nodes = Array.from(root.querySelectorAll(Array.from(INLINE_UNWRAP_TAGS).join(',')));
    for (const el of nodes) {
      const htmlEl = el as HTMLElement;
      if (htmlEl.classList?.contains('num-badge')) continue;
      const parent = htmlEl.parentNode;
      if (!parent) continue;
      const semantic = spanToSemanticInline(htmlEl);
      if (semantic) {
        parent.replaceChild(semantic, htmlEl);
        sanitizeNodeStyles(semantic);
      } else {
        while (htmlEl.firstChild) parent.insertBefore(htmlEl.firstChild, htmlEl);
        parent.removeChild(htmlEl);
      }
      changed = true;
    }
    if (!changed) break;
  }

  root.querySelectorAll('b,strong,i,em,u').forEach(el => sanitizeNodeStyles(el as HTMLElement));
}

/** 연속 줄바꿈 — 빈 줄 1칸(br×2)까지 허용, 그 이상은 정리 */
function collapseNoticeBreaks(html: string): string {
  return html
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .replace(/^(<br\s*\/?>\s*)+/gi, '')
    .replace(/(<br\s*\/?>\s*)+$/gi, '');
}

/**
 * "※ … 참고하시되, 변동사항…" 문장 중간 강제 줄바꿈/개행 복구.
 * - 하드 <br> 제거
 * - 쉼표 뒤 일반 공백 → &nbsp; 로 바꿔 미리보기 폭이 좁아도 여기서 줄바꿈되지 않게 함
 */
function joinBrokenSentenceBreaks(html: string): string {
  let out = html;

  // 이 문구는 항상 한 줄로 (사용자가 서식에 br을 넣었거나 에디터가 가른 경우)
  out = out.replace(
    /참고하시되\s*,(?:\s|&nbsp;|\u00a0)*(?:<\/?(?:span|font|mark|b|strong|em|u)[^>]*>)*\s*(?:<br\s*\/?>\s*)+/gi,
    '참고하시되,&nbsp;',
  );
  // 이미 한 줄이어도 쉼표 뒤 일반 스페이스면 좁은 미리보기에서 여기서 개행됨 → nbsp
  out = out.replace(/참고하시되\s*,(?:\s|\u00a0)+(?!&nbsp;)/gi, '참고하시되,&nbsp;');
  out = out.replace(/참고하시되\s*,(?=[^\s&<])/gi, '참고하시되,&nbsp;');

  // 그 외: 쉼표 뒤 한 줄 br + 이어지는 본문 (새 섹션 제외)
  const sectionStart = '(?:▶|📢|📁|📂|📋|✅|📌|✔|※)';
  out = out.replace(
    new RegExp(
      `([,，])(?:\\s|&nbsp;|\\u00a0)*(?:</?(?:span|font|mark|b|strong|em|u)[^>]*>)*\\s*<br\\s*/?>\\s*(?!<br\\s*/?>|${sectionStart})`,
      'gi',
    ),
    '$1&nbsp;',
  );

  return out;
}

/**
 * 안내문 줄바꿈 정리 — 서식에 있는 빈 줄(br×2)은 유지.
 * br×3 이상만 줄이고, 제목 뒤 간격을 강제로 합치지 않음.
 */
export function tidyNoticeBreaks(html: string): string {
  let out = html
    // 이모지 단독 줄 + 다음 줄 <b>제목 → 한 줄로
    .replace(/(📢|📁|📂|📋|✅)\s*(?:<br\s*\/?>\s*)+(<b\b[^>]*>)/gi, '$1 $2')
    // 완전 빈 문단만 제거 (&nbsp;만, br 없는 것)
    .replace(/<(p|div)\b[^>]*>\s*(?:&nbsp;|\u00a0|\s)*\s*<\/\1>/gi, '')
    .replace(/(<br\s*\/?>)\s*(?:&nbsp;|\u00a0)+\s*(<br\s*\/?>)/gi, '$1$2');

  // 문장 중간(쉼표 뒤) 강제 줄바꿈 제거
  out = joinBrokenSentenceBreaks(out);

  // 연속 br — 서식의 섹션 간격(br×2) 유지, 그 이상만 정리
  out = out.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
  out = out.replace(/^(?:<br\s*\/?>\s*)+/gi, '');
  out = out.replace(/(?:<br\s*\/?>\s*)+$/gi, '');
  return out;
}

/** 본문만 추출 — 중첩 단일 div 래퍼를 벗겨 <br> 기반 본문만 남김 */
function unwrapNoticeBody(html: string): string {
  if (typeof document === 'undefined') {
    let out = html.trim();
    for (let i = 0; i < 6; i++) {
      const m = out.match(/^<div\b[^>]*>([\s\S]*)<\/div>\s*$/i);
      if (!m) break;
      out = m[1].trim();
    }
    return out;
  }
  const root = document.createElement('div');
  root.innerHTML = html.trim();
  removeBlankBlocks(root);

  // 최상위가 단일 div면 계속 풀어 중첩 래퍼 제거
  while (
    root.children.length === 1 &&
    root.firstElementChild &&
    root.firstElementChild.tagName.toLowerCase() === 'div' &&
    !root.firstElementChild.querySelector('table,ul,ol')
  ) {
    const inner = root.firstElementChild as HTMLElement;
    removeBlankBlocks(inner);
    root.innerHTML = inner.innerHTML;
  }
  removeBlankBlocks(root);
  return root.innerHTML.trim();
}

/** 미리보기·서식 복사에 쓰는 최종 HTML (동일 결과 보장, 멱등) */
export function finalizeNoticeHtml(html: string): string {
  if (!html?.trim()) return '';

  if (typeof document !== 'undefined') {
    const root = document.createElement('div');
    root.innerHTML = html.trim();
    removeBlankBlocks(root);
    // 항상 평탄화 — 표는 유지, 중첩 div는 <br> 구조로 (한글 붙여넣기 여분 줄 방지)
    let body = flattenNoticeHtmlRoot(root);
    body = body.replace(/<(div|p)\b[^>]*>\s*(?:&nbsp;|\u00a0|\s)*\s*<\/\1>/gi, '');
    body = tidyNoticeBreaks(body);
    // 표: align/float 제거 — 한글에서 다음 줄이 표 옆으로 붙는 원인
    body = body.replace(/<table\b([^>]*)>/gi, (_m, attrs: string) => {
      let a = String(attrs || '')
        .replace(/\s*align\s*=\s*["']?[^"'\s>]+["']?/gi, '')
        .replace(/\s*align\s*=\s*[^\s>]+/gi, '');
      if (/\bstyle="/i.test(a)) {
        a = a.replace(/\bstyle="([^"]*)"/i, (_s, style: string) => {
          let st = style
            .replace(/float\s*:[^;]+;?/gi, '')
            .replace(/clear\s*:[^;]+;?/gi, '')
            .replace(/margin\s*:[^;]+;?/gi, '')
            .replace(/margin-left\s*:[^;]+;?/gi, '')
            .replace(/margin-right\s*:[^;]+;?/gi, '')
            .replace(/display\s*:[^;]+;?/gi, '');
          st = `display:table;float:none;clear:both;margin:6px 0;${st}`.replace(/;;+/g, ';');
          return `style="${st}"`;
        });
      } else {
        a += ' style="display:table;float:none;clear:both;margin:6px 0;"';
      }
      return `<table${a}>`;
    });
    // 표는 이미 블록 — 뒤 <br>를 붙이면 미리보기·한글에서 빈 줄로 보임
    body = body.replace(/<\/table>\s*(?:<br\s*\/?>\s*)*/gi, '</table>');
    return wrapNoticeHtml(body);
  }

  let out = unwrapNoticeBody(html);
  out = out.replace(/<(div|p)\b[^>]*>\s*(?:&nbsp;|\u00a0|\s)*\s*<\/\1>/gi, '');
  out = tidyNoticeBreaks(out);
  return wrapNoticeHtml(out);
}

/**
 * 한글·워드 붙여넣기용 — 굵게/기울임/밑줄만 유지, 배경·글자색·크기 등 제거.
 * <br> 줄은 margin:0 문단으로 바꿔 여분 줄바꿈 방지.
 */
export function normalizeHtmlForClipboard(html: string): string {
  const finalized = finalizeNoticeHtml(html);
  if (!finalized?.trim() || typeof document === 'undefined') return finalized;

  const root = document.createElement('div');
  root.innerHTML = finalized;
  let target: HTMLElement = root;
  if (
    root.children.length === 1 &&
    root.firstElementChild?.tagName.toLowerCase() === 'div'
  ) {
    target = root.firstElementChild as HTMLElement;
  }

  /** 인라인은 b/i/u 만 — style·배경·색 전부 제거 */
  const semanticInline = (el: HTMLElement): string => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') return '<br>';

    let inner = '';
    el.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        inner += child.textContent ?? '';
        return;
      }
      if (child.nodeType === Node.ELEMENT_NODE) {
        inner += semanticInline(child as HTMLElement);
      }
    });
    if (!inner) return '';

    const bold = tag === 'b' || tag === 'strong' || isBoldLike(el);
    const italic = tag === 'i' || tag === 'em' || isItalicLike(el);
    const underline = tag === 'u' || isUnderlineLike(el);

    // span/font/mark 등은 서식만 걷어내고 자식만 유지
    if (!['b', 'strong', 'i', 'em', 'u'].includes(tag) && !bold && !italic && !underline) {
      return inner;
    }

    let out = inner;
    if (underline) out = `<u>${out}</u>`;
    if (italic) out = `<em>${out}</em>`;
    if (bold) out = `<strong>${out}</strong>`;
    return out;
  };

  const parts: string[] = [];
  let lineBuf = '';

  const flushLine = (asBlank: boolean) => {
    if (asBlank) {
      const last = parts[parts.length - 1] || '';
      if (last.includes('>&nbsp;</p>')) return;
      parts.push('<p style="margin:0;padding:0;line-height:1.55;">&nbsp;</p>');
      return;
    }
    const t = lineBuf.trim();
    if (!t) {
      flushLine(true);
      lineBuf = '';
      return;
    }
    parts.push(`<p style="margin:0;padding:0;line-height:1.55;">${lineBuf}</p>`);
    lineBuf = '';
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      lineBuf += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      if (lineBuf.trim() || lineBuf.includes('<')) flushLine(false);
      else flushLine(true);
      return;
    }
    if (tag === 'table') {
      if (lineBuf.trim() || lineBuf.includes('<')) flushLine(false);
      // 표는 유지하되 셀 인라인 배경/하이라이트는 제거하지 않음(구분 색)
      const clone = el.cloneNode(true) as HTMLElement;
      clone.removeAttribute('align');
      clone.querySelectorAll('[style]').forEach(node => {
        const cell = node as HTMLElement;
        const t = cell.tagName.toLowerCase();
        if (t === 'td' || t === 'th') {
          // 흰·밝은 글씨 → 본문색으로 (바깥 wrapper color에 덮이거나 검게 보이는 문제 방지)
          const raw = (cell.style.color || '').replace(/\s/g, '').toLowerCase();
          if (
            !raw ||
            raw === '#fff' ||
            raw === '#ffffff' ||
            raw === 'white' ||
            raw === 'rgb(255,255,255)' ||
            raw === '#f8fafc' ||
            raw === '#f1f5f9'
          ) {
            cell.style.color = NOTICE_TEXT_COLOR;
          }
          // 제목행이 어두운 배경이면 연한 회색+진한 글자로 교정 (붙여넣기 안정)
          if (t === 'th') {
            const bg = (cell.style.backgroundColor || cell.style.background || '')
              .replace(/\s/g, '')
              .toLowerCase();
            if (
              bg.includes('334155') ||
              bg.includes('1e293b') ||
              bg.includes('0f172a') ||
              bg.includes('002d62') ||
              bg === 'rgb(51,65,85)' ||
              bg === 'rgb(15,23,42)'
            ) {
              cell.style.background = '#e2e8f0';
              cell.style.backgroundColor = '#e2e8f0';
              cell.style.color = NOTICE_TEXT_COLOR;
            }
            cell.style.textAlign = 'center';
          } else {
            const idx =
              typeof (cell as HTMLTableCellElement).cellIndex === 'number'
                ? (cell as HTMLTableCellElement).cellIndex
                : -1;
            // 공급가·부가세 열 우측 정렬 고정
            if (idx > 0) cell.style.textAlign = 'right';
            else if (!cell.style.textAlign) cell.style.textAlign = 'left';
          }
          return;
        }
        cell.style.removeProperty('background');
        cell.style.removeProperty('background-color');
        cell.style.removeProperty('background-image');
        // 인라인 텍스트 하이라이트만 제거
        if (!['table', 'tr', 'thead', 'tbody', 'tfoot', 'colgroup', 'col'].includes(t)) {
          cell.style.removeProperty('color');
        }
      });
      parts.push(
        `<div style="clear:both;display:block;text-align:left;margin:6px 0;">${clone.outerHTML}</div>`,
      );
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      if (lineBuf.trim() || lineBuf.includes('<')) flushLine(false);
      const clone = el.cloneNode(true) as HTMLElement;
      // 리스트: 배경·색·크기 속성 제거, span/font/mark는 서식만 남기고 언랩
      const stripAttrs = (node: HTMLElement) => {
        node.removeAttribute('style');
        node.removeAttribute('bgcolor');
        node.removeAttribute('color');
        node.removeAttribute('face');
        node.removeAttribute('size');
        node.removeAttribute('class');
      };
      Array.from(clone.querySelectorAll('*')).forEach(n => stripAttrs(n as HTMLElement));
      stripAttrs(clone);
      // span/font/mark → 굵게/기울임/밑줄만 semantic 태그로
      for (let pass = 0; pass < 8; pass++) {
        const inlines = Array.from(clone.querySelectorAll('span,font,mark'));
        if (!inlines.length) break;
        for (const node of inlines) {
          const inline = node as HTMLElement;
          const parent = inline.parentNode;
          if (!parent) continue;
          const rebuilt = document.createElement('span');
          rebuilt.innerHTML = semanticInline(inline);
          while (rebuilt.firstChild) parent.insertBefore(rebuilt.firstChild, inline);
          parent.removeChild(inline);
        }
      }
      // b/i/u 등도 style 없이 순수 태그만
      clone.querySelectorAll('b,strong,i,em,u').forEach(n => stripAttrs(n as HTMLElement));
      parts.push(clone.outerHTML);
      return;
    }
    if (['b', 'strong', 'i', 'em', 'u', 'span', 'a', 'font', 'mark'].includes(tag)) {
      lineBuf += semanticInline(el);
      return;
    }
    Array.from(el.childNodes).forEach(walk);
  };

  Array.from(target.childNodes).forEach(walk);
  if (lineBuf.trim() || lineBuf.includes('<')) flushLine(false);

  let body = parts.join('');
  // 표 셀 배경은 유지 — 본문 인라인 mark/font만 제거
  body = body.replace(/<\/?mark\b[^>]*>/gi, '').replace(/<\/?font\b[^>]*>/gi, '');
  body = body.replace(
    /(?:<p style="margin:0;padding:0;line-height:1\.55;">&nbsp;<\/p>\s*){2,}/gi,
    '<p style="margin:0;padding:0;line-height:1.55;">&nbsp;</p>',
  );

  return (
    `<div style="margin:0;padding:0;line-height:1.55;color:${NOTICE_TEXT_COLOR};font-size:14px;text-align:left;">` +
    `${body}</div>`
  );
}

function normalizePlainPasteText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

function unwrapLegacyInlineTags(root: HTMLElement) {
  root.querySelectorAll('font').forEach(el => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
  });
  root.querySelectorAll('mark').forEach(el => {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
  });
}

function flattenNoticeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === 'table') return (el as HTMLElement).outerHTML;
  if (tag === 'br') return '<br>';
  if (tag === 'ol' || tag === 'ul') return (el as HTMLElement).outerHTML;

  if (tag === 'div' || tag === 'p') {
    const block = el as HTMLElement;
    const text = (block.textContent ?? '').replace(/\u00a0/g, ' ').trim();
    const raw = block.innerHTML
      .replace(/\u00a0/g, '')
      .replace(/&nbsp;/gi, '')
      .replace(/\s/g, '')
      .toLowerCase();
    // 빈 줄 전용 블록은 <br>로 보존 (삭제하지 않음)
    if (!text && /^(?:<br\/?>)+$/.test(raw)) {
      return '<br>'.repeat((raw.match(/<br\/?>/g) || []).length);
    }
    if (isBlankBlock(block)) return '';

    const blockChild = block.querySelector(':scope > div, :scope > p, :scope > table, :scope > ol, :scope > ul');
    if (blockChild) {
      return flattenChildNodes(Array.from(block.childNodes));
    }

    const inner = block.innerHTML.trim();
    if (!inner) return '';
    if (inner.endsWith('<br>') || inner.endsWith('<br/>')) return inner;
    return `${inner}<br>`;
  }

  return (el as HTMLElement).outerHTML;
}

/**
 * 인접 텍스트·인라인은 한 줄로 이어붙인다.
 * 이모지 패널 삽입 시 브라우저가 텍스트 노드를 쪼개도 노드마다 <br>를 붙이지 않음.
 */
function isEmojiOnlyText(text: string): boolean {
  const t = text.replace(/\s/g, '');
  if (!t) return false;
  const without = t
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\p{Emoji_Component}/gu, '')
    .replace(/[\uFE0F\u200D]/g, '');
  return without.length === 0;
}

function flattenChildNodes(nodes: Node[]): string {
  const parts: string[] = [];
  let inline = '';

  const flushInline = (withBr: boolean) => {
    if (!inline) return;
    // 양끝 공백만 정리 — 중간 공백·이모지 주변 간격은 유지
    const line = inline.replace(/^\s+|\s+$/g, '');
    inline = '';
    if (!line) return;
    parts.push(withBr ? `${line}<br>` : line);
  };

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').replace(/\u00a0/g, ' ');
      if (!t) continue;
      if (!t.trim() && !inline) continue;
      inline += escapeHtml(t);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      flushInline(false);
      parts.push('<br>');
      continue;
    }

    if (tag === 'div' || tag === 'p') {
      const blockText = (el.textContent ?? '').replace(/\u00a0/g, ' ').trim();
      // 이모지만 단독 블록으로 들어온 경우 다음 줄과 합침 (제목 앞 📢 등)
      if (
        blockText &&
        isEmojiOnlyText(blockText) &&
        !el.querySelector('div, p, table, ol, ul, br')
      ) {
        const piece = (el as HTMLElement).innerHTML.trim().replace(/(?:<br\s*\/?>\s*)+$/i, '');
        inline += `${piece} `;
        continue;
      }
      flushInline(true);
      const flat = flattenNoticeElement(el);
      if (flat) parts.push(flat);
      continue;
    }

    if (tag === 'table' || tag === 'ol' || tag === 'ul') {
      flushInline(true);
      const flat = flattenNoticeElement(el);
      if (flat) parts.push(flat);
      continue;
    }

    // b/strong/em/u/span 등 인라인 — 같은 줄에 유지
    inline += flattenNoticeElement(el);
  }

  flushInline(true);
  return parts.join('');
}

function flattenNoticeHtmlRoot(root: HTMLElement): string {
  let target: Element = root;
  if (
    root.children.length === 1 &&
    root.firstElementChild &&
    (root.firstElementChild.tagName.toLowerCase() === 'div' ||
      root.firstElementChild.tagName.toLowerCase() === 'p')
  ) {
    target = root.firstElementChild;
  }

  return flattenChildNodes(Array.from(target.childNodes));
}

function sanitizeNoticeHtmlRoot(root: HTMLElement) {
  root.querySelectorAll('script,style,meta,link,title').forEach(el => el.remove());
  unwrapLegacyInlineTags(root);
  normalizeInlineNoticeMarkup(root);
  root.querySelectorAll('*').forEach(node => sanitizeNodeStyles(node as HTMLElement));
  removeBlankBlocks(root);
}

/** 공문 편집 영역 — 붙여넣기 배경만 제거하고 굵게·색·글자크기는 유지 */
export function scrubOfficialLetterBackgroundOnly(root: HTMLElement) {
  if (typeof document === 'undefined') return;
  root.querySelectorAll('[style]').forEach(node => {
    const el = node as HTMLElement;
    if (el.classList?.contains('num-badge')) return;
    el.style.removeProperty('background');
    el.style.removeProperty('background-color');
    el.style.removeProperty('background-image');
  });
}

/** @deprecated 서식 유지용 — scrubOfficialLetterBackgroundOnly 사용 */
export function scrubOfficialLetterInlineMarkup(root: HTMLElement) {
  scrubOfficialLetterBackgroundOnly(root);
}

/** 붙여넣기·드래그용 — 배경 제거, 줄바꿈은 tidy로 미리보기와 동일 규칙 */
export function prepareNoticePasteContent(
  html: string,
  plainText: string,
  opts?: { flattenBlocks?: boolean; wrap?: boolean },
): string {
  const flattenBlocks = opts?.flattenBlocks ?? true;
  const wrap = opts?.wrap ?? false;

  if (typeof document === 'undefined') {
    const t = normalizePlainPasteText(plainText || html);
    const body = tidyNoticeBreaks(escapeHtml(t).replace(/\n/g, '<br>'));
    return wrap ? wrapNoticeHtml(body) : body;
  }

  const root = document.createElement('div');
  const trimmedHtml = html?.trim().replace(/<!--[\s\S]*?-->/g, '');
  if (trimmedHtml) {
    root.innerHTML = trimmedHtml;
  } else {
    const t = normalizePlainPasteText(plainText);
    root.innerHTML = escapeHtml(t).replace(/\n/g, '<br>');
  }

  sanitizeNoticeHtmlRoot(root);

  let body = flattenBlocks ? flattenNoticeHtmlRoot(root) : root.innerHTML.trim();
  body = tidyNoticeBreaks(body.replace(/<(div|p)\b[^>]*>\s*<\/\1>/gi, ''));
  return wrap ? wrapNoticeHtml(body) : body;
}

/** 외부 HTML을 안내문 용도로 정리: 색상은 일반/볼드만 유지, 배경색 제거, br 평탄화 */
export function sanitizeNoticeHtml(html: string): string {
  if (!html?.trim() || typeof document === 'undefined') return html;

  const root = document.createElement('div');
  root.innerHTML = html;

  sanitizeNoticeHtmlRoot(root);

  // div 줄 단위를 br로 평탄화 — 문장 중간 Enter/소프트브레이크가 두 블록으로 남는 것 방지
  const body = flattenNoticeHtmlRoot(root).replace(/<(div|p)\b[^>]*>\s*<\/\1>/gi, '');
  return tidyNoticeBreaks(body);
}

function adjustmentSentence(deadline: DeadlineResult | null): string {
  if (!deadline || !deadline.wasAdjusted) return '';
  const reasons = deadline.skipped.map(s => s.reason).join(', ');
  return `※ 법정 신고기한이 휴일(${reasons})에 해당하여, 다음 영업일인 ${deadline.finalText}까지 신고·납부하시면 됩니다.`;
}

// 사용자 서식(HTML) 안의 토큰을 계산 결과로 치환합니다.
// 서식(색상·이모지·글꼴 등)은 그대로 유지되고 토큰 값만 채워집니다.
// 자료 제출 마감 줄 전체를 "자료 제출 마감: 2026.07.27 (월) 13:00" 형태로 표기(요일 포함).
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
  return `※ 원활한 신고를 위해 기한을 지켜 주시고, 일정 조정이 필요하시면 ${formatDottedDate(twoDaysBefore, { withWeekday: false })}까지 알려 주세요.`;
}

// 대상기간(과세/귀속 기간)을 "2026. 01. 01 ~ 2026. 03. 31" 형태로 표기
function coverageRangeText(deadline: DeadlineResult | null): string {
  if (!deadline) return '';
  const start = formatDottedDate(deadline.coverageStart, { withWeekday: false });
  const end = formatDottedDate(deadline.coverageEnd, { withWeekday: false });
  return `${start} ~ ${end}`;
}

// 원단위 절사 (10원 미만 버림). 음수(환급)도 절댓값 기준 절사 후 부호 유지.
export function truncateWonUnit(n: number): number {
  const x = Math.round(Number(n) || 0);
  return Math.trunc(x / 10) * 10;
}

// 원(₩) 금액을 천 단위 콤마 + "원"으로 표기 (원단위 절사·절댓값)
function formatWon(n: number): string {
  return `${Math.abs(truncateWonUnit(n)).toLocaleString('ko-KR')} 원`;
}

// 부가세·법인세 중간예납은 지방소득세 없음. 원천·종소·법인세 확정만 지방세 별도.
export function hasLocalIncomeTax(
  taxType: TaxTypeKey,
  deadline?: DeadlineResult | null,
): boolean {
  if (taxType === TAX_TYPES.VAT) return false;
  if (taxType === TAX_TYPES.CORPORATE && isCorpInterimNotice(deadline ?? null)) return false;
  return true;
}

// 지방세 있는 세목은 납부서 기본 2장, 그 외 1장
export function defaultPaymentSlips(
  taxType: TaxTypeKey,
  deadline?: DeadlineResult | null,
): number {
  return hasLocalIncomeTax(taxType, deadline) ? 2 : 1;
}

type PayItem = { name: string; amount: number };

// 환급 시점 안내 문구. 원천세는 환급 신청 여부에 따라 분기.
function refundTimingLine(taxType: TaxTypeKey, refundClaimed: boolean): string {
  if (taxType === TAX_TYPES.WITHHOLDING && !refundClaimed) {
    return '※ 환급 신청 대신 다음 원천세(급여) 신고 시 차감될 예정입니다.';
  }
  return '환급 예정: 신고 마감일 이후 1개월 이내';
}

const OVERDUE_NOTE = '※ 기한 내 미납부 시 납부지연가산세가 부과될 수 있으니 유의하시기 바랍니다.';

// "YYYY-MM-DD" → 점 표기 날짜(요일 포함). 비었으면 빈 문자열.
function isoToDottedDate(iso: string): string {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  return formatDottedDate(new Date(y, m - 1, d));
}

function formatAttachText(payment: PaymentNotice): string {
  const slips = Math.max(0, Math.round(payment.slips || 0));
  const note = (payment.attachNote ?? '').trim();
  const slipPart = slips > 0 ? `납부서 ${slips}장` : '';
  if (note && slipPart) return `${note}, ${slipPart}`;
  if (note) return note;
  return slipPart;
}

function formatAttachLine(payment: PaymentNotice): string {
  const text = formatAttachText(payment);
  if (!text) return '';
  return noticeLine(`첨부 서류: ${escapeHtml(text)}`);
}

// 부가세 분납 안내문구 — 납부서(회차)별 날짜·금액 나열 (본문만)
function buildVatInstallmentBody({
  belong,
  name,
  payment,
}: {
  belong: string;
  name: string;
  payment: PaymentNotice;
  dueDate?: string;
}): string {
  const line = noticeLine;
  const blank = noticeBlank;
  const dash = noticeDash;
  const installments = payment.installments;
  const attachText = formatAttachText(payment);
  const total = installments.reduce(
    (s, it) => s + Math.max(0, truncateWonUnit(it.amount || 0)),
    0,
  );

  const parts: string[] = [];
  parts.push(
    line(
      `${belong} ${escapeHtml(name)} 신고가 완료되어 납부서를 첨부하오니, 아래 내용을 확인하시어 기한 내 납부 부탁드립니다.`,
    ),
  );
  parts.push(line('분할 납부 일정은 아래와 같습니다.'));
  parts.push(blank());
  if (attachText) parts.push(line(`첨부 서류: ${escapeHtml(attachText)}`));
  parts.push(line(`최종 납부 세액: 총 ${escapeHtml(formatWon(total))}`));
  installments.forEach((it, i) => {
    const dateText = isoToDottedDate(it.date) || '(일자 미입력)';
    parts.push(dash(`${i + 1}차: ${escapeHtml(dateText)} · ${escapeHtml(formatWon(it.amount))}`));
  });
  // 분납 일정에 차수별 기한이 있으므로 공통 「납부 기한」 줄은 넣지 않음
  parts.push(line(OVERDUE_NOTE));
  return parts.join('');
}

function buildVatInstallmentHtml(params: {
  belong: string;
  name: string;
  payment: PaymentNotice;
  dueDate: string;
}): string {
  return wrapNoticeHtml(buildVatInstallmentBody(params));
}

export type PaymentNoticeTokens = Record<string, string>;

/** 신고 결과 안내 문구 치환용 토큰 값 생성 */
export function buildPaymentNoticeTokens({
  taxType,
  deadline,
  payment,
  vatNoticeOnly = false,
}: {
  taxType: TaxTypeKey;
  deadline: DeadlineResult | null;
  payment: PaymentNotice;
  vatNoticeOnly?: boolean;
}): PaymentNoticeTokens {
  const name = displayTaxName(taxType, deadline);
  const belong = deadline ? escapeHtml(deadline.periodLabel) : '';
  const dueDate = deadline ? escapeHtml(formatDottedDate(deadline.final)) : '';
  const slips = Math.max(0, Math.round(payment.slips || 0));
  const hasLocal = hasLocalIncomeTax(taxType, deadline);
  const main = truncateWonUnit(payment.amount || 0);
  const local = hasLocal ? truncateWonUnit(payment.localAmount || 0) : 0;

  const empty = {
    '{귀속}': belong,
    '{세목}': escapeHtml(name),
    '{납부기한}': dueDate,
    '{납부서장수}': String(slips),
    '{최종납부세액}': '',
    '{최종환급세액}': '',
    '{서두}': '',
    '{납부요약}': '',
    '{납부내역}': '',
    '{첨부안내}': '',
    '{첨부서류상세}': '',
    '{납부기한줄}': '',
    '{환급요약}': '',
    '{환급내역}': '',
    '{환급시점}': '',
    '{분납회차목록}': '',
    '{연체안내}': '',
    '{안내본문}': '',
  };

  if (vatNoticeOnly) {
    const body = buildVatPreliminaryNoticeBody(deadline, payment);
    const due = deadline?.final;
    return {
      ...empty,
      '{최종납부세액}': escapeHtml(`${Math.abs(truncateWonUnit(payment.amount || 0)).toLocaleString('ko-KR')}원`),
      '{납부기한}': due ? escapeHtml(formatNoticeDateKo(due)) : dueDate,
      '{서두}': body,
      '{안내본문}': body,
    };
  }

  if (isCorpInterimNotice(deadline)) {
    const body = buildCorpInterimNoticeBody(deadline, payment);
    const due = deadline?.final;
    return {
      ...empty,
      '{최종납부세액}': escapeHtml(`${Math.abs(truncateWonUnit(payment.amount || 0)).toLocaleString('ko-KR')}원`),
      '{납부기한}': due ? escapeHtml(`${formatNoticeDateKo(due)}까지`) : dueDate,
      '{서두}': body,
      '{안내본문}': body,
    };
  }

  if (taxType === TAX_TYPES.VAT && slips >= 2 && payment.installments.length >= 2) {
    const attachText = formatAttachText(payment);
    const body = buildVatInstallmentBody({ belong, name, payment, dueDate });
    const total = payment.installments.reduce(
      (s, it) => s + Math.max(0, truncateWonUnit(it.amount || 0)),
      0,
    );
    const 회차 = payment.installments
      .map((it, i) => {
        const dateText = isoToDottedDate(it.date) || '(일자 미입력)';
        return noticeDash(`${i + 1}차: ${escapeHtml(dateText)} · ${escapeHtml(formatWon(it.amount))}`);
      })
      .join('');
    return {
      ...empty,
      '{최종납부세액}': escapeHtml(formatWon(total)),
      '{서두}':
        noticeLine(
          `${belong} ${escapeHtml(name)} 신고가 완료되어 납부서를 첨부하오니, 아래 내용을 확인하시어 기한 내 납부 부탁드립니다.`,
        ) + noticeLine('분할 납부 일정은 아래와 같습니다.'),
      '{납부요약}': noticeLine(`최종 납부 세액: 총 ${escapeHtml(formatWon(total))}`),
      '{분납회차목록}': 회차,
      '{첨부안내}': attachText ? noticeLine(`첨부 서류: ${escapeHtml(attachText)}`) : '',
      '{첨부서류상세}': attachText ? escapeHtml(attachText) : '',
      // 분납 일정에 차수별 기한이 있으므로 공통 「납부 기한」 줄은 비움
      '{납부기한줄}': '',
      '{연체안내}': noticeLine(OVERDUE_NOTE),
      '{안내본문}': body,
    };
  }

  const items: PayItem[] = (() => {
    if (taxType === TAX_TYPES.WITHHOLDING && usesWithholdingBreakdown(slips)) {
      const whItems = ensureWithholdingItems(payment.withholdingItems)
        .filter(i => i.enabled)
        .map(i => ({
          name: WITHHOLDING_ITEM_LABELS[i.key],
          amount: truncateWonUnit(i.amount || 0),
        }));
      whItems.push({ name: '지방소득세', amount: local });
      return whItems;
    }
    if (hasLocal) {
      return [
        { name, amount: main },
        { name: '지방소득세', amount: local },
      ];
    }
    return [{ name, amount: main }];
  })();

  const payItems = items.filter(i => i.amount > 0);
  const refundItems = items.filter(i => i.amount < 0);
  const payTotal = payItems.reduce((s, i) => s + i.amount, 0);
  const refundTotal = refundItems.reduce((s, i) => s + Math.abs(i.amount), 0);
  const dash = noticeDash;
  const breakdown = (list: PayItem[]) =>
    hasLocal ? list.map(i => dash(`${escapeHtml(i.name)} ${escapeHtml(formatWon(i.amount))}`)).join('') : '';
  const refundTiming = noticeLine(refundTimingLine(taxType, payment.refundClaimed));
  const overdue = noticeLine(OVERDUE_NOTE);
  const attachText = formatAttachText(payment);
  const attach = formatAttachLine(payment);
  const dueLine = noticeLine(`납부 기한: ${dueDate}`);

  const anyPay = payItems.length > 0;
  const anyRefund = refundItems.length > 0;
  const parts: string[] = [];
  const line = noticeLine;
  const blank = noticeBlank;
  const corpInterim = isCorpInterimNotice(deadline);
  const specialIntro = specialPaymentIntro(vatNoticeOnly, corpInterim, deadline);

  let 서두 = '';
  let 납부요약 = '';
  let 납부내역 = '';
  let 환급요약 = '';
  let 환급내역 = '';

  if (anyRefund && !anyPay) {
    서두 = specialIntro || line(`${belong} ${escapeHtml(name)} 신고 결과 환급 세액이 발생하여 별도로 납부하실 금액은 없습니다.`);
    환급요약 = line(`최종 환급 세액: 총 ${escapeHtml(formatWon(refundTotal))}`);
    환급내역 = breakdown(refundItems);
    parts.push(서두, blank(), 환급요약, 환급내역, refundTiming);
  } else if (anyPay && anyRefund) {
    서두 = specialIntro || line(`${belong} ${escapeHtml(name)} 신고가 완료되었습니다. 납부·환급 내역을 함께 안내드립니다.`);
    납부요약 = line(`[납부] 최종 납부 세액: 총 ${escapeHtml(formatWon(payTotal))}`);
    납부내역 = breakdown(payItems);
    환급요약 = line(`[환급] 최종 환급 세액: 총 ${escapeHtml(formatWon(refundTotal))}`);
    환급내역 = breakdown(refundItems);
    parts.push(
      서두,
      blank(),
      attach,
      납부요약,
      납부내역,
      dueLine,
      overdue,
      blank(),
      환급요약,
      환급내역,
      refundTiming,
    );
  } else {
    const listForBreakdown = payItems.length > 0 ? payItems : items;
    서두 =
      specialIntro ||
      line(
        `${belong} ${escapeHtml(name)} 신고가 완료되어 납부서를 첨부하오니, 아래 내용을 확인하시어 기한 내 납부 부탁드립니다.`,
      );
    납부요약 = line(`최종 납부 세액: 총 ${escapeHtml(formatWon(payTotal))}`);
    납부내역 = breakdown(listForBreakdown);
    parts.push(서두, blank(), attach, 납부요약, 납부내역, dueLine, overdue);
  }

  return {
    ...empty,
    '{최종납부세액}': anyPay ? escapeHtml(formatWon(payTotal)) : '',
    '{최종환급세액}': anyRefund ? escapeHtml(formatWon(refundTotal)) : '',
    '{서두}': 서두,
    '{납부요약}': 납부요약,
    '{납부내역}': 납부내역,
    '{첨부안내}': anyPay ? attach : '',
    '{첨부서류상세}': anyPay && attachText ? escapeHtml(attachText) : '',
    '{납부기한줄}': anyPay ? dueLine : '',
    '{환급요약}': 환급요약,
    '{환급내역}': 환급내역,
    '{환급시점}': anyRefund ? refundTiming : '',
    '{연체안내}': anyPay && !anyRefund ? overdue : anyPay && anyRefund ? overdue : '',
    '{안내본문}': parts.join(''),
  };
}

/** 신고 결과 안내 — 서식 빈 줄(br×2) 유지, 과도한 연속만 정리 */
function cleanupPaymentTemplate(html: string): string {
  return tidyNoticeBreaks(
    html
      .replace(/<div[^>]*>\s*<br\s*\/?>\s*<\/div>/gi, '<br>')
      .replace(/<(div|p)\b[^>]*>\s*<\/\1>/gi, ''),
  );
}

/** 사용자 서식(토큰)으로 신고 결과 안내 문구 생성 */
export function renderPaymentNoticeTemplate(template: string, tokens: PaymentNoticeTokens): string {
  let out = (template || DEFAULT_PAYMENT_NOTICE_TEMPLATE).trim();

  // 빈 토큰 제거 — 토큰과 바로 뒤 줄바꿈 1개만 (서두 뒤 빈 줄은 유지)
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [token, value] of Object.entries(tokens)) {
    if (value) continue;
    if (token === '{안내본문}') continue;
    const t = escapeRe(token);
    out = out
      .replace(new RegExp(`<div[^>]*>\\s*${t}\\s*</div>(?:\\s*<br\\s*/?>)?`, 'gi'), '')
      .replace(new RegExp(`${t}(?:\\s*<br\\s*/?>)?`, 'gi'), '');
  }

  const entries = Object.entries(tokens).sort((a, b) => b[0].length - a[0].length);
  for (const [token, value] of entries) {
    out = out.split(token).join(value);
  }
  return finalizeNoticeHtml(cleanupPaymentTemplate(out));
}

// 신고 결과 안내문구(HTML) 생성. 금액이 음수면 환급으로 처리하며,
// 납부·환급이 섞인 경우 필요한 내용만 취합한다.
export function buildPaymentNoticeHtml({
  taxType,
  deadline,
  payment,
  template,
  vatNoticeOnly = false,
}: {
  taxType: TaxTypeKey;
  deadline: DeadlineResult | null;
  payment: PaymentNotice;
  template?: string;
  vatNoticeOnly?: boolean;
}): string {
  const tokens = buildPaymentNoticeTokens({ taxType, deadline, payment, vatNoticeOnly });
  return renderPaymentNoticeTemplate(template?.trim() || DEFAULT_PAYMENT_NOTICE_TEMPLATE, tokens);
}

// 부가세 매입 3종 공급가/부가세 합계 + 최종세액 계산
export function calcVatReport(report: VatReport) {
  const salesSupply = Math.round(report.salesSupply || 0);
  const salesVat = Math.round(report.salesVat || 0);
  const buySupply = Math.round(
    (report.taxInvoiceSupply || 0) + (report.fixedAssetSupply || 0) + (report.cardCashSupply || 0),
  );
  const buyVat = Math.round(
    (report.taxInvoiceVat || 0) + (report.fixedAssetVat || 0) + (report.cardCashVat || 0),
  );
  const nonDeductibleVat = Math.round(
    (report.nonDeductibleItems ?? [])
      .filter(it => Math.round(it.vat || 0) !== 0)
      .reduce((s, it) => s + Math.round(it.vat || 0), 0),
  );
  const deductibleBuyVat = buyVat - nonDeductibleVat;
  const reductionItems = report.reductionItems?.length
    ? report.reductionItems
    : (report.reductionAmount || report.reductionLabel)
      ? [{ label: report.reductionLabel || '', amount: report.reductionAmount || 0 }]
      : [];
  const reduction = Math.round(
    reductionItems
      .filter(it => Math.round(it.amount || 0) !== 0)
      .reduce((s, it) => s + Math.round(it.amount || 0), 0),
  );
  const preliminaryNotice = Math.round(report.preliminaryNoticeAmount || 0);
  const penalty = Math.round(report.penaltyAmount || 0);
  // 납부세액 = 매출세액 − 공제매입세액 − 경감세액 − 예정고지 + 가산세액 (원단위 절사)
  const finalTax = truncateWonUnit(
    salesVat - deductibleBuyVat - reduction - preliminaryNotice + penalty,
  );

  return {
    salesSupply,
    salesVat,
    buySupply,
    buyVat,
    nonDeductibleVat,
    deductibleBuyVat,
    reduction,
    reductionItems,
    preliminaryNotice,
    penalty,
    finalTax,
  };
}

// 입력값을 그대로 보여주는 신고 결과 요약 표(HTML).
// 0은 '-'로 표기. 색은 연한 배경+진한 글자만 사용 (흰 글씨 금지 — 서식 복사 시 상속색에 덮임).
function vatSummaryTable(
  report: VatReport,
  calc: ReturnType<typeof calcVatReport>,
  taxLabel: string,
): string {
  const num = (n: number) => (n ? Math.round(n).toLocaleString('ko-KR') : '-');
  const numZero = (n: number) => Math.round(n || 0).toLocaleString('ko-KR');
  const border = '1px solid #cbd5e1';
  const text = '#1e293b';
  const muted = '#334155';
  const cellBase =
    'border:' +
    border +
    ';padding:7px 10px;font-size:12px;line-height:1.45;vertical-align:middle;';

  type RowOpts = { bg?: string; color?: string; bold?: boolean; indent?: boolean };
  const row = (label: string, supply: string, vat: string, opts: RowOpts = {}) => {
    const { bg = '#ffffff', color = muted, bold = false, indent = false } = opts;
    // background + background-color 둘 다 — 한글·워드 붙여넣기 호환
    const style =
      `${cellBase}background:${bg};background-color:${bg};color:${color};` +
      `${bold ? 'font-weight:bold;' : ''}`;
    const pad = indent ? 'padding-left:18px;' : '';
    const nowrap = 'white-space:nowrap;';
    // 금액열은 항상 우측 정렬(숫자·'-' 동일) — 편집/복사 후에도 열이 맞게
    const amount =
      'text-align:right;font-variant-numeric:tabular-nums;-moz-font-feature-settings:"tnum";font-feature-settings:"tnum";';
    return (
      `<tr>` +
      `<td style="${style}${pad}${nowrap}text-align:left;">${escapeHtml(label)}</td>` +
      `<td style="${style}${amount}${nowrap}">${supply}</td>` +
      `<td style="${style}${amount}${nowrap}">${vat}</td>` +
      `</tr>`
    );
  };

  // 제목행: 연한 회색 배경 + 진한 글자 (흰 글씨면 서식 복사 때 본문색으로 검게 덮임)
  const th = (label: string) =>
    `<th style="${cellBase}background:#e2e8f0;background-color:#e2e8f0;color:${text};font-weight:bold;text-align:center;white-space:nowrap;">${escapeHtml(label)}</th>`;

  const finalBg = calc.finalTax >= 0 ? '#fef2f2' : '#ecfdf5';
  const finalColor = calc.finalTax >= 0 ? '#9f1239' : '#065f46';

  const buySubRows = (
    [
      { label: '└ 세금계산서', s: report.taxInvoiceSupply, v: report.taxInvoiceVat },
      { label: '└ 고정자산 취득', s: report.fixedAssetSupply, v: report.fixedAssetVat },
      { label: '└ 카드/현금영수증', s: report.cardCashSupply, v: report.cardCashVat },
    ] as const
  )
    .filter(x => Math.round(x.s || 0) !== 0 || Math.round(x.v || 0) !== 0)
    .map(x => row(x.label, num(x.s), num(x.v), { bg: '#f8fafc', color: muted, indent: true }))
    .join('');

  const reductionRows = (calc.reductionItems ?? [])
    .filter(it => Math.round(it.amount || 0) !== 0)
    .map(it => {
      const name = (it.label || '').trim();
      return row(name || '-', '-', num(it.amount), { bg: '#f8fafc', color: muted });
    })
    .join('');

  const preliminaryRow =
    calc.preliminaryNotice !== 0
      ? row('예정고지', '-', num(calc.preliminaryNotice), { bg: '#f8fafc', color: muted })
      : '';

  const nonDeductibleRows = (report.nonDeductibleItems ?? [])
    .filter(it => Math.round(it.vat || 0) !== 0)
    .map(it => {
      const reason = (it.reason || '').trim();
      return row(reason || '-', '-', num(it.vat), { bg: '#f8fafc', color: muted, indent: true });
    })
    .join('');

  const deductibleBuyRow =
    calc.nonDeductibleVat > 0
      ? row('공제 매입세액 합계', '-', numZero(calc.deductibleBuyVat), {
          bg: '#fff7ed',
          color: text,
          bold: true,
          indent: true,
        })
      : '';

  const penaltyName = (report.penaltyLabel || '').trim();
  const penaltyRow =
    Math.round(report.penaltyAmount || 0) !== 0
      ? row(penaltyName || '-', '-', num(report.penaltyAmount), {
          bg: '#f8fafc',
          color: muted,
        })
      : '';

  const customRows = (report.customSummaryRows ?? [])
    .filter(
      it =>
        (it.label || '').trim() ||
        Math.round(it.supply || 0) !== 0 ||
        Math.round(it.vat || 0) !== 0,
    )
    .map(it => {
      const label = (it.label || '').trim();
      return row(label || '-', num(it.supply), num(it.vat), { bg: '#ffffff', color: muted });
    })
    .join('');

  return (
    `<table style="border-collapse:collapse;table-layout:fixed;width:100%;max-width:500px;display:table;float:none;clear:both;margin:6px 0;font-size:12px;color:${muted};">` +
    `<colgroup><col style="width:40%;"><col style="width:30%;"><col style="width:30%;"></colgroup>` +
    `<thead><tr>${th('구분')}${th('공급가')}${th('부가세(세액)')}</tr></thead>` +
    `<tbody>` +
    row('매출 합계', num(report.salesSupply), num(report.salesVat), {
      bg: '#eff6ff',
      color: text,
      bold: true,
    }) +
    row('매입 합계', numZero(calc.buySupply), numZero(calc.buyVat), {
      bg: '#fff7ed',
      color: text,
      bold: true,
    }) +
    buySubRows +
    nonDeductibleRows +
    deductibleBuyRow +
    reductionRows +
    preliminaryRow +
    penaltyRow +
    customRows +
    row(`최종 세액 (${taxLabel})`, '-', Math.abs(calc.finalTax).toLocaleString('ko-KR'), {
      bg: finalBg,
      color: finalColor,
      bold: true,
    }) +
    `</tbody></table>`
  );
}

// 분납 권장 일정 계산.
// 1차: 신고·납부일(deadline.final), 2차: +1개월 말일, 3차: +2개월 말일.
// 말일이 휴일이면 그다음 달 초일(영업일 보정)로 이동.
export function installmentSchedule(final: Date): Date[] {
  const baseMonth = final.getMonth() + 1; // 1~12
  const monthEnd = (offset: number): Date => {
    const end = lastDayOfMonth(final.getFullYear(), baseMonth + offset);
    if (isNonBusinessDay(end)) {
      const firstNext = new Date(end.getFullYear(), end.getMonth() + 1, 1);
      return adjustToNextBusinessDay(firstNext).adjusted;
    }
    return end;
  };
  return [final, monthEnd(1), monthEnd(2)];
}

function buildVatInstallmentBlock(
  deadline: DeadlineResult | null,
  isPay: boolean,
  finalTax: number,
  installmentConfirm: boolean,
): string {
  if (!installmentConfirm || !isPay || finalTax <= 0) return '';
  const parts: string[] = [];
  parts.push(noticeLine('💳 분할 납부 안내'));
  parts.push(
    noticeLine('분할 납부를 원하시면 희망 납부일·금액을 댓글로 알려 주시면 신청을 도와드리겠습니다.'),
  );
  parts.push(
    noticeLine('다음 신고기한과 겹치지 않도록 아래 일정 내 최대 3회(약 3개월) 분납을 권장합니다.'),
  );
  if (deadline) {
    const labels = ['1차 (신고·납부일)', '2차 (+1개월 말일)', '3차 (+2개월 말일)'];
    installmentSchedule(deadline.final).forEach((d, i) => {
      parts.push(noticeDash(`${labels[i]}: ${escapeHtml(formatDottedDate(d))}`));
    });
  }
  return parts.join('');
}

const VAT_INSTALLMENT_MARKER = '분할 납부 안내';

/** 안내 HTML에서 분납 안내 본문(제목~일정)만 추출. 없으면 null */
function extractVatInstallmentBody(html: string): string | null {
  const raw = unwrapNoticeBody(html || '');
  const markerIdx = raw.indexOf(VAT_INSTALLMENT_MARKER);
  if (markerIdx < 0) return null;

  let start = markerIdx;
  const head = raw.slice(0, markerIdx);
  const lead = head.match(/(?:<(?:b|strong|span|font|i|em)[^>]*>\s*)*(?:💳\s*)?$/i);
  if (lead) start = markerIdx - lead[0].length;

  const tail = raw.slice(start);
  const thanksRel = tail.search(/감사합니다/);
  let end = thanksRel >= 0 ? start + thanksRel : raw.length;
  if (thanksRel < 0) {
    const closeRel = tail.search(/<\/div>/i);
    if (closeRel >= 0) end = start + closeRel;
  }

  let body = raw.slice(start, end);
  body = body.replace(/^(?:<br\s*\/?>\s*)+/i, '').replace(/(?:<br\s*\/?>\s*)+$/i, '').trim();
  return body || null;
}

function normalizeInstallmentKey(body: string | null): string {
  if (!body) return '';
  return body
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 편집본에서 분납 안내 블록(+앞뒤 여분 br) 제거 */
function removeVatInstallmentBody(html: string): string {
  const body = extractVatInstallmentBody(html);
  if (!body) return html;

  const wrapped = /<div\b/i.test(html.trim());
  let raw = unwrapNoticeBody(html);
  const idx = raw.indexOf(body);
  if (idx < 0) return html;

  let start = idx;
  let end = idx + body.length;
  const lead = raw.slice(0, start).match(/(?:<br\s*\/?>\s*)+$/i);
  if (lead) start -= lead[0].length;
  const trail = raw.slice(end).match(/^(?:<br\s*\/?>\s*)+/i);
  if (trail) end += trail[0].length;

  // 본문과 「감사합니다」 사이는 빈 optionalBreak(<br>) 한 칸만 유지
  raw = `${raw.slice(0, start)}<br>${raw.slice(end)}`;
  raw = tidyNoticeBreaks(raw);
  return wrapped ? wrapNoticeHtml(raw) : raw;
}

/** 「감사합니다」 앞에 분납 안내 삽입 (없으면 본문 끝) */
function insertVatInstallmentBody(html: string, body: string): string {
  const chunk = `<br>${body}<br><br>`;
  const wrapped = /<div\b/i.test(html.trim());
  let raw = unwrapNoticeBody(html);
  // 기존 분납이 있으면 먼저 제거
  if (extractVatInstallmentBody(raw)) {
    raw = unwrapNoticeBody(removeVatInstallmentBody(wrapNoticeHtml(raw)));
  }

  if (/감사합니다/.test(raw)) {
    raw = raw.replace(/감사합니다/, `${chunk}감사합니다`);
  } else {
    raw = raw.replace(/(?:<br\s*\/?>\s*)*$/i, '') + chunk;
  }
  raw = tidyNoticeBreaks(raw);
  return wrapped ? wrapNoticeHtml(raw) : raw;
}

/**
 * 자동생성 문구의 분납 안내만 편집본에 반영한다.
 * (분납 체크 on/off·일정 변경 시 편집 내용 유지)
 */
export function syncVatInstallmentInEdited(
  editedHtml: string,
  prevGeneratedHtml: string,
  nextGeneratedHtml: string,
): string {
  const prevBody = extractVatInstallmentBody(prevGeneratedHtml);
  const nextBody = extractVatInstallmentBody(nextGeneratedHtml);
  if (normalizeInstallmentKey(prevBody) === normalizeInstallmentKey(nextBody)) {
    return editedHtml;
  }

  let out = removeVatInstallmentBody(editedHtml);
  if (nextBody) {
    out = insertVatInstallmentBody(out, nextBody);
  }
  return finalizeNoticeHtml(out);
}

function buildVatSupplementBlock(
  report: VatReport,
  calc: ReturnType<typeof calcVatReport>,
): string {
  const lines: string[] = [];

  const employee = (report.employeeStatus || '').trim();
  if (employee) lines.push(`직원 여부: ${employee}`);

  const vehDed = (report.vehicleDeductible || '').trim();
  if (vehDed) lines.push(`차량 관련(공제 차량): ${vehDed}`);

  const vehNon = (report.vehicleNonDeductible || '').trim();
  if (vehNon) lines.push(`차량 관련(불공제 차량): ${vehNon}`);

  const paper = (report.paperTaxInvoice || '').trim();
  if (paper) lines.push(`종이 세금계산서: ${paper}`);

  if (calc.finalTax < 0) {
    const refund = (report.refundReason || '').trim();
    if (refund) lines.push(`환급 사유: ${refund}`);
  }

  const special = (report.vatSpecialNotes || '').trim();
  if (special) lines.push(`특이사항: ${special}`);

  if (lines.length === 0) return '';

  return lines.map(l => noticeDash(escapeHtml(l))).join('');
}

/** 없으면 줄바꿈만 / 있으면 줄바꿈+내용+줄바꿈 ({신고결과부가정보}, {분납안내}) */
function optionalBreakBlock(content: string): string {
  // 내용 끝 br은 래퍼가 담당 — 이중 빈 줄 방지
  const body = (content || '')
    .trim()
    .replace(/(?:<br\s*\/?>\s*)+$/i, '')
    .trim();
  if (!body) return '<br>';
  return `<br>${body}<br>`;
}

// 사용자 서식(토큰)으로 부가세 신고 결과 보고 문구 생성
export function renderVatReportTemplate({
  template,
  taxType,
  deadline,
  report,
}: {
  template: string;
  taxType: TaxTypeKey;
  deadline: DeadlineResult | null;
  report: VatReport;
}): string {
  const belong = deadline ? escapeHtml(deadline.periodLabel) : '';
  const name = NAME[taxType] || '부가가치세';
  const r = calcVatReport(report);
  const isPay = r.finalTax >= 0;
  const taxLabel = isPay ? '납부' : '환급';
  const summaryTable = vatSummaryTable(report, r, taxLabel);
  const supplementBlock = buildVatSupplementBlock(report, r);
  const installmentBlock = buildVatInstallmentBlock(
    deadline,
    isPay,
    r.finalTax,
    report.installmentConfirm,
  );

  const map: [string, string][] = [
    ['{신고결과요약표}', summaryTable],
    ['{신고결과부가정보}', optionalBreakBlock(supplementBlock)],
    ['{분납안내}', optionalBreakBlock(installmentBlock)],
    ['{귀속}', belong],
    ['{세목}', escapeHtml(name)],
  ];

  let out = (template || '').trim();
  for (const [token, value] of map) {
    out = out.split(token).join(value);
  }
  return finalizeNoticeHtml(out);
}

// 부가세 전용: 신고 결과 보고 및 검토 안내문구(HTML). 납부서 안내문구 앞에 표시.
export function buildVatReportHtml({
  taxType,
  deadline,
  report,
  template,
}: {
  taxType: TaxTypeKey;
  deadline: DeadlineResult | null;
  report: VatReport;
  template?: string;
}): string {
  return renderVatReportTemplate({
    template: template?.trim() || DEFAULT_VAT_REPORT_TEMPLATE,
    taxType,
    deadline,
    report,
  });
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
  const tpl = (template || '').trim();
  const materialsEmpty = isNoticeFieldEmpty(materials);
  const notesEmpty = isNoticeFieldEmpty(notes);
  const materialDeadlineEmpty = isNoticeFieldEmpty(materialDeadline);
  const materialNoteEmpty = isNoticeFieldEmpty(materialDeadlineNote);

  let prepared = tpl;
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripEmptyToken = (html: string, token: string) => {
    const t = escapeRe(token);
    return html
      .replace(new RegExp(`<div[^>]*>\\s*${t}\\s*</div>(?:\\s*<br\\s*/?>)?`, 'gi'), '')
      .replace(new RegExp(`${t}(?:\\s*<br\\s*/?>)?`, 'gi'), '');
  };

  // 안내문 서식 {특이사항}
  // 빈 토큰은 삭제만 하고 <br>를 넣지 않음 — "참고하시되,{특이사항}변동사항" 강제개행 방지
  prepared = prepared.replace(
    /(?:<br\s*\/?>\s*)*(?:<b\b[^>]*>\s*)?특이사항(?:\s*<\/b>)?\s*(?:<br\s*\/?>\s*)*(?=\{특이사항\})/gi,
    '',
  );
  if (notesEmpty) {
    prepared = prepared.replace(/\{특이사항\}/g, '');
  } else {
    prepared = prepared.replace(
      /(?:<br\s*\/?>\s*)*\{특이사항\}(?:\s*<br\s*\/?>)*/gi,
      '{특이사항}',
    );
  }

  if (materialsEmpty) prepared = stripEmptyToken(prepared, '{필요자료}');
  if (materialDeadlineEmpty) prepared = stripEmptyToken(prepared, '{자료제출마감}');
  if (materialNoteEmpty) prepared = stripEmptyToken(prepared, '{자료제출안내}');

  // 특이사항이 있을 때만 필요자료 끝 br 제거(optionalBreak가 간격 담당)
  let materialsHtml = noticeFieldToHtml(materials);
  if (!notesEmpty) {
    materialsHtml = materialsHtml.replace(/(?:<br\s*\/?>\s*)+$/i, '');
  }
  const notesHtml = noticeFieldToHtml(notes);

  const map: [string, string][] = [
    ['{마감일짧게}', deadline ? escapeHtml(formatDottedDate(deadline.final)) : ''],
    ['{법정마감일}', deadline ? escapeHtml(deadline.statutoryText) : ''],
    ['{마감일}', deadline ? escapeHtml(deadline.finalText) : ''],
    ['{대상기간}', escapeHtml(coverageRangeText(deadline))],
    ['{세금납부기한}', deadline ? escapeHtml(formatDottedDate(deadline.final)) : ''],
    ['{자료제출마감}', escapeHtml(materialDeadline)],
    ['{자료제출안내}', escapeHtml(materialDeadlineNote)],
    ['{업체명}', escapeHtml((companyName || '').trim())],
    ['{세목}', escapeHtml(displayTaxName(taxType, deadline))],
    ['{귀속}', deadline ? escapeHtml(deadline.periodLabel) : ''],
    ['{요일}', deadline ? escapeHtml(getWeekdayKo(deadline.final)) : ''],
    ['{필요자료}', materialsHtml],
    ['{특이사항}', notesEmpty ? '' : optionalBreakBlock(notesHtml)],
    ['{휴일안내}', escapeHtml(adjustmentSentence(deadline))],
  ];

  let out = prepared;
  for (const [token, value] of map) {
    out = out.split(token).join(value);
  }
  out = out.replace(/color\s*:\s*#13a89e\s*;?/gi, '');
  out = out.replace(/<(div|p)\b[^>]*>\s*<\/\1>/gi, '');

  return finalizeNoticeHtml(out);
}

// 미리보기 HTML → 일반 텍스트 (메신저 붙여넣기용)
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  let s = html
    .replace(/<div[^>]*>\s*<br\s*\/?>\s*<\/div>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<\/(div|p|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '');
  // 엔티티 복원
  const txt = document.createElement('textarea');
  txt.innerHTML = s;
  s = txt.value;
  return s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
}
