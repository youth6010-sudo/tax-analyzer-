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

function wrapNoticeHtml(body: string): string {
  return `<div style="margin:0;padding:0;line-height:1.6;color:#334155;font-size:14px;">${body}</div>`;
}

function isBlankBlock(el: HTMLElement): boolean {
  const html = el.innerHTML.replace(/\s/g, '').toLowerCase();
  return html === '' || html === '<br>' || html === '<br/>';
}

function isBoldLike(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'b' || tag === 'strong' || /^h[1-6]$/.test(tag)) return true;
  const fontWeight = (el.style.fontWeight || '').trim().toLowerCase();
  if (fontWeight === 'bold' || fontWeight === 'bolder') return true;
  const numeric = Number.parseInt(fontWeight, 10);
  return Number.isFinite(numeric) && numeric >= 600;
}

function sanitizeNodeStyles(el: HTMLElement) {
  const tag = el.tagName.toLowerCase();
  const isTable = tag === 'table';
  const isCell = tag === 'td' || tag === 'th';
  const isTableRow = tag === 'tr';
  const isTableSection = tag === 'thead' || tag === 'tbody' || tag === 'tfoot' || tag === 'colgroup' || tag === 'col';
  const isBold = isBoldLike(el) || tag === 'th';
  const textColor = isBold ? '#0f172a' : '#334155';

  const prevAlign = el.style.textAlign;
  const prevWidth = el.style.width;
  const prevColSpan = el.getAttribute('colspan');
  const prevRowSpan = el.getAttribute('rowspan');

  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'colspan' || attr.name === 'rowspan') continue;
    el.removeAttribute(attr.name);
  }
  if (prevColSpan) el.setAttribute('colspan', prevColSpan);
  if (prevRowSpan) el.setAttribute('rowspan', prevRowSpan);

  if (isTable) {
    el.style.borderCollapse = 'collapse';
    el.style.tableLayout = 'fixed';
    if (prevWidth) el.style.width = prevWidth;
    el.style.margin = '6px 0';
    el.style.fontSize = '13px';
    el.style.lineHeight = '1.7';
    el.style.color = '#334155';
    el.style.backgroundColor = 'transparent';
    return;
  }

  if (isTableSection || isTableRow) {
    el.style.backgroundColor = 'transparent';
    return;
  }

  if (isCell) {
    el.style.border = '1px solid #e5e7eb';
    el.style.padding = '8px 12px';
    el.style.color = textColor;
    el.style.backgroundColor = 'transparent';
    if (isBold) el.style.fontWeight = '700';
    if (prevAlign) el.style.textAlign = prevAlign;
    return;
  }

  el.style.color = textColor;
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

function collapseNoticeBreaks(html: string): string {
  return html
    .replace(/(<br\s*\/?>\s*)+/gi, '<br>')
    .replace(/^(<br\s*\/?>\s*)+/gi, '')
    .replace(/(<br\s*\/?>\s*)+$/gi, '');
}

/** 외부 HTML을 안내문 용도로 정리: 색상은 일반/볼드만 유지, 배경색 제거 */
export function sanitizeNoticeHtml(html: string): string {
  if (!html?.trim() || typeof document === 'undefined') return html;

  const root = document.createElement('div');
  root.innerHTML = html;

  root.querySelectorAll('script,style,meta,link,title').forEach(el => el.remove());
  root.querySelectorAll('*').forEach(node => sanitizeNodeStyles(node as HTMLElement));

  return collapseNoticeBreaks(
    root.innerHTML.replace(/<(div|p)\b[^>]*>\s*<\/\1>/gi, ''),
  );
}

/** div 블록 나열 → br 줄 구조로 변환 (서식 유지 복사용) */
export function normalizeHtmlForClipboard(html: string): string {
  if (!html?.trim() || typeof document === 'undefined') return html;

  const root = document.createElement('div');
  root.innerHTML = sanitizeNoticeHtml(html).trim();

  const flatten = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'table') return el.outerHTML;
    if (tag === 'br') return '<br>';
    if (tag === 'ol' || tag === 'ul') return (el as HTMLElement).outerHTML;

    if (tag === 'div' || tag === 'p') {
      const block = el as HTMLElement;
      if (isBlankBlock(block)) return '<br>';

      const blockChild = block.querySelector(':scope > div, :scope > p, :scope > table, :scope > ol, :scope > ul');
      if (blockChild) {
        return Array.from(block.children)
          .map(child => flatten(child))
          .join('');
      }

      const inner = block.innerHTML.trim();
      if (!inner) return '<br>';
      if (inner.endsWith('<br>') || inner.endsWith('<br/>')) return inner;
      return `${inner}<br>`;
    }

    return (el as HTMLElement).outerHTML;
  };

  let target: Element = root;
  if (
    root.children.length === 1 &&
    root.firstElementChild &&
    (root.firstElementChild.tagName.toLowerCase() === 'div' ||
      root.firstElementChild.tagName.toLowerCase() === 'p')
  ) {
    target = root.firstElementChild;
  }

  const body = Array.from(target.childNodes)
    .map(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent ?? '').trim();
        return t ? `${t}<br>` : '';
      }
      if (node.nodeType === Node.ELEMENT_NODE) return flatten(node as Element);
      return '';
    })
    .join('');

  return wrapNoticeHtml(collapseNoticeBreaks(body));
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

// 원(₩) 금액을 천 단위 콤마 + "원"으로 표기 (절댓값 기준)
function formatWon(n: number): string {
  return `${Math.abs(Math.round(n)).toLocaleString('ko-KR')} 원`;
}

// 부가세를 제외한 세목(원천세·종소세·법인세)은 지방소득세가 별도로 부과된다.
export function hasLocalIncomeTax(taxType: TaxTypeKey): boolean {
  return taxType !== TAX_TYPES.VAT;
}

// 부가세 외 세목은 납부서 기본 2장(본세·지방소득세), 부가세는 1장
export function defaultPaymentSlips(taxType: TaxTypeKey): number {
  return hasLocalIncomeTax(taxType) ? 2 : 1;
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
  dueDate,
}: {
  belong: string;
  name: string;
  payment: PaymentNotice;
  dueDate: string;
}): string {
  const line = noticeLine;
  const blank = noticeBlank;
  const dash = noticeDash;
  const installments = payment.installments;
  const attachText = formatAttachText(payment);
  const total = installments.reduce((s, it) => s + Math.max(0, Math.round(it.amount || 0)), 0);

  const parts: string[] = [];
  parts.push(
    line(`${belong} ${escapeHtml(name)} 신고가 완료되어 납부서를 첨부하오니, 분할 납부 일정은 아래와 같습니다.`),
  );
  parts.push(blank());
  if (attachText) parts.push(line(`첨부 서류: ${escapeHtml(attachText)}`));
  parts.push(line(`최종 납부 세액: 총 ${escapeHtml(formatWon(total))}`));
  installments.forEach((it, i) => {
    const dateText = isoToDottedDate(it.date) || '(일자 미입력)';
    parts.push(dash(`${i + 1}차: ${escapeHtml(dateText)} · ${escapeHtml(formatWon(it.amount))}`));
  });
  if (dueDate) parts.push(line(`납부 기한: ${escapeHtml(dueDate)}`));
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
}: {
  taxType: TaxTypeKey;
  deadline: DeadlineResult | null;
  payment: PaymentNotice;
}): PaymentNoticeTokens {
  const name = NAME[taxType] || '';
  const belong = deadline ? escapeHtml(deadline.periodLabel) : '';
  const dueDate = deadline ? escapeHtml(formatDottedDate(deadline.final)) : '';
  const slips = Math.max(0, Math.round(payment.slips || 0));
  const hasLocal = hasLocalIncomeTax(taxType);
  const main = Math.round(payment.amount || 0);
  const local = hasLocal ? Math.round(payment.localAmount || 0) : 0;

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

  if (taxType === TAX_TYPES.VAT && slips >= 2 && payment.installments.length >= 2) {
    const attachText = formatAttachText(payment);
    const body = buildVatInstallmentBody({ belong, name, payment, dueDate });
    const total = payment.installments.reduce((s, it) => s + Math.max(0, Math.round(it.amount || 0)), 0);
    const 회차 = payment.installments
      .map((it, i) => {
        const dateText = isoToDottedDate(it.date) || '(일자 미입력)';
        return noticeDash(`${i + 1}차: ${escapeHtml(dateText)} · ${escapeHtml(formatWon(it.amount))}`);
      })
      .join('');
    return {
      ...empty,
      '{최종납부세액}': escapeHtml(formatWon(total)),
      '{서두}': noticeLine(
        `${belong} ${escapeHtml(name)} 신고가 완료되어 납부서를 첨부하오니, 분할 납부 일정은 아래와 같습니다.`,
      ),
      '{납부요약}': noticeLine(`최종 납부 세액: 총 ${escapeHtml(formatWon(total))}`),
      '{분납회차목록}': 회차,
      '{첨부안내}': attachText ? noticeLine(`첨부 서류: ${escapeHtml(attachText)}`) : '',
      '{첨부서류상세}': attachText ? escapeHtml(attachText) : '',
      '{납부기한줄}': dueDate ? noticeLine(`납부 기한: ${dueDate}`) : '',
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
          amount: Math.round(i.amount || 0),
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

  let 서두 = '';
  let 납부요약 = '';
  let 납부내역 = '';
  let 환급요약 = '';
  let 환급내역 = '';

  if (anyRefund && !anyPay) {
    서두 = line(`${belong} ${escapeHtml(name)} 신고 결과 환급 세액이 발생하여 별도로 납부하실 금액은 없습니다.`);
    환급요약 = line(`최종 환급 세액: 총 ${escapeHtml(formatWon(refundTotal))}`);
    환급내역 = breakdown(refundItems);
    parts.push(서두, blank(), 환급요약, 환급내역, refundTiming);
  } else if (anyPay && anyRefund) {
    서두 = line(`${belong} ${escapeHtml(name)} 신고가 완료되었습니다. 납부·환급 내역을 함께 안내드립니다.`);
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
    서두 = line(
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

function cleanupPaymentTemplate(html: string): string {
  return html
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .replace(/<div[^>]*>\s*<br\s*\/?>\s*<\/div>/gi, '<br>');
}

/** 사용자 서식(토큰)으로 신고 결과 안내 문구 생성 */
export function renderPaymentNoticeTemplate(template: string, tokens: PaymentNoticeTokens): string {
  let out = (template || DEFAULT_PAYMENT_NOTICE_TEMPLATE).trim();
  const entries = Object.entries(tokens).sort((a, b) => b[0].length - a[0].length);
  for (const [token, value] of entries) {
    out = out.split(token).join(value);
  }
  return cleanupPaymentTemplate(out);
}

// 신고 결과 안내문구(HTML) 생성. 금액이 음수면 환급으로 처리하며,
// 납부·환급이 섞인 경우 필요한 내용만 취합한다.
export function buildPaymentNoticeHtml({
  taxType,
  deadline,
  payment,
  template,
}: {
  taxType: TaxTypeKey;
  deadline: DeadlineResult | null;
  payment: PaymentNotice;
  template?: string;
}): string {
  const tokens = buildPaymentNoticeTokens({ taxType, deadline, payment });
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
  const reduction = Math.round(report.reductionAmount || 0);
  const penalty = Math.round(report.penaltyAmount || 0);
  // 납부세액 = 매출세액 − 공제매입세액 − 경감세액 + 가산세액
  const finalTax = salesVat - deductibleBuyVat - reduction + penalty;

  const buySupplyExFixed = Math.round(
    (report.taxInvoiceSupply || 0) + (report.cardCashSupply || 0),
  );
  const buyVatExFixed = Math.round((report.taxInvoiceVat || 0) + (report.cardCashVat || 0));
  const salesVatRate = salesSupply > 0 ? (salesVat / salesSupply) * 100 : null;
  const buyVatRateExFixed =
    buySupplyExFixed > 0 ? (buyVatExFixed / buySupplyExFixed) * 100 : null;

  return {
    salesSupply,
    salesVat,
    buySupply,
    buyVat,
    nonDeductibleVat,
    deductibleBuyVat,
    reduction,
    penalty,
    finalTax,
    salesVatRate,
    buyVatRateExFixed,
    buySupplyExFixed,
    buyVatExFixed,
  };
}

// 입력값을 그대로 보여주는 신고 결과 요약 표(HTML).
// 0은 '-'로 표기하고, 관련 항목끼리 색으로 구분한다.
function vatSummaryTable(
  report: VatReport,
  calc: ReturnType<typeof calcVatReport>,
  taxLabel: string,
): string {
  // 0은 '-'로 표기 / 합계 등은 0도 '0'으로 표기
  const num = (n: number) => (n ? Math.round(n).toLocaleString('ko-KR') : '-');
  const numZero = (n: number) => Math.round(n || 0).toLocaleString('ko-KR');
  const reductionName = (report.reductionLabel || '').trim();
  const border = '1px solid #e5e7eb';

  type RowOpts = { bg?: string; color?: string; bold?: boolean; indent?: boolean };
  const row = (label: string, supply: string, vat: string, opts: RowOpts = {}) => {
    const { bg = '#ffffff', color = '#334155', bold = false, indent = false } = opts;
    const base = `border:${border};padding:8px 12px;background:${bg};color:${color};${bold ? 'font-weight:bold;' : ''}`;
    const pad = indent ? 'padding-left:26px;' : '';
    return (
      `<tr>` +
      `<td style="${base}${pad}">${escapeHtml(label)}</td>` +
      `<td style="${base}text-align:right;">${supply}</td>` +
      `<td style="${base}text-align:right;">${vat}</td>` +
      `</tr>`
    );
  };

  // 첫 행(헤더)은 글자 가운데정렬
  const th = (text: string) =>
    `<th style="border:${border};padding:8px 12px;background:#334155;color:#ffffff;font-weight:bold;text-align:center;">${text}</th>`;

  // 색상 그룹: 매출(파랑) / 매입(주황) / 경감(보라) / 최종(납부 핑크·환급 초록)
  const finalBg = calc.finalTax >= 0 ? '#ffe4e6' : '#d1fae5';
  const finalColor = calc.finalTax >= 0 ? '#be123c' : '#047857';

  // 매입 세부 항목 중 값이 입력된 것만 표에 노출
  const buySubRows = (
    [
      { label: '└ 세금계산서', s: report.taxInvoiceSupply, v: report.taxInvoiceVat },
      { label: '└ 고정자산 취득', s: report.fixedAssetSupply, v: report.fixedAssetVat },
      { label: '└ 카드/현금영수증', s: report.cardCashSupply, v: report.cardCashVat },
    ] as const
  )
    .filter(x => Math.round(x.s || 0) !== 0 || Math.round(x.v || 0) !== 0)
    .map(x =>
      row(x.label, num(x.s), num(x.v), { bg: '#fff7ed', color: '#9a3412', indent: true }),
    )
    .join('');

  const reductionRow =
    Math.round(report.reductionAmount || 0) !== 0
      ? row(
          `경감세액${reductionName ? ` (${reductionName})` : ''}`,
          '-',
          num(report.reductionAmount),
          { bg: '#ede9fe', color: '#6d28d9' },
        )
      : '';

  const nonDeductibleRows = (report.nonDeductibleItems ?? [])
    .filter(it => Math.round(it.vat || 0) !== 0)
    .map(it => {
      const reason = (it.reason || '').trim();
      const label = reason
        ? `매입세액 불공제 (${reason} 사유로 제외)`
        : '매입세액 불공제';
      return row(label, '-', num(it.vat), { bg: '#fef3c7', color: '#b45309', indent: true });
    })
    .join('');

  const deductibleBuyRow =
    calc.nonDeductibleVat > 0
      ? row('공제 매입세액 합계', '-', numZero(calc.deductibleBuyVat), {
          bg: '#ffedd5',
          color: '#c2410c',
          bold: true,
          indent: true,
        })
      : '';

  const penaltyName = (report.penaltyLabel || '').trim();
  const penaltyRow =
    Math.round(report.penaltyAmount || 0) !== 0
      ? row(
          `가산세${penaltyName ? ` (${penaltyName})` : ''}`,
          '-',
          num(report.penaltyAmount),
          { bg: '#fee2e2', color: '#b91c1c' },
        )
      : '';

  return (
    `<table style="border-collapse:collapse;table-layout:fixed;width:420px;margin:6px 0;font-size:13px;">` +
    `<colgroup><col style="width:160px;"><col style="width:130px;"><col style="width:130px;"></colgroup>` +
    `<thead><tr>${th('구분')}${th('공급가')}${th('부가세(세액)')}</tr></thead>` +
    `<tbody>` +
    row('매출 합계', num(report.salesSupply), num(report.salesVat), {
      bg: '#dbeafe',
      color: '#1d4ed8',
      bold: true,
    }) +
    row('매입 합계', numZero(calc.buySupply), numZero(calc.buyVat), {
      bg: '#fed7aa',
      color: '#c2410c',
      bold: true,
    }) +
    buySubRows +
    nonDeductibleRows +
    deductibleBuyRow +
    reductionRow +
    penaltyRow +
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
): string {
  if (!isPay || finalTax <= 0) return '';
  const parts: string[] = [];
  parts.push(noticeBlank());
  parts.push(noticeLine('💳 [분납(분할 납부) 안내]'));
  parts.push(
    noticeLine(
      '분할 납부를 원하시면 "확인 완료" 댓글에 희망 납부일자별 금액을 함께 적어 주시면 신청을 도와드리겠습니다.',
    ),
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

function fmtVatRate(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '';
  return `${n.toFixed(1)}%`;
}

function buildVatSupplementBlock(
  report: VatReport,
  calc: ReturnType<typeof calcVatReport>,
): string {
  const lines: string[] = [];

  if (calc.salesVatRate != null) {
    lines.push(`매출 부가율: ${fmtVatRate(calc.salesVatRate)}`);
  }
  if (calc.buyVatRateExFixed != null) {
    lines.push(`매입 부가율(고정자산 제외): ${fmtVatRate(calc.buyVatRateExFixed)}`);
  }

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

  const body = lines.map(l => noticeDash(escapeHtml(l))).join('');
  return `${noticeBlank()}${noticeLine('📌 [검토 사항]')}${body}`;
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
  const installmentBlock = buildVatInstallmentBlock(deadline, isPay, r.finalTax);

  const map: [string, string][] = [
    ['{신고결과요약표}', summaryTable],
    ['{신고결과부가정보}', supplementBlock],
    ['{분납안내}', installmentBlock],
    ['{귀속}', belong],
    ['{세목}', escapeHtml(name)],
  ];

  let out = (template || '').trim();
  for (const [token, value] of map) {
    out = out.split(token).join(value);
  }
  if (!installmentBlock) {
    out = out.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
    out = out.replace(/<div[^>]*>\s*<br\s*\/?>\s*<\/div>/gi, '<br>');
  }
  if (!supplementBlock) {
    out = out.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
  }
  return out;
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

  const tpl = (template || '').trim();
  const notesTrimmed = (notes || '').trim();

  // {특이사항} 데이터 없으면 해당 블록·인접 줄바꿈 없이 제거
  let prepared = tpl;
  if (!notesTrimmed) {
    prepared = prepared
      .replace(/<div[^>]*>\s*\{특이사항\}\s*<\/div>\s*/gi, '')
      .replace(/\{특이사항\}\s*(<br\s*\/?>)?\s*/gi, '');
  }

  let out = prepared;
  for (const [token, value] of map) {
    out = out.split(token).join(value);
  }
  // 레거시 기본 서식의 청록색(세금 납부 기한 강조) 제거 — 저장된 옛 서식 마이그레이션
  out = out.replace(/color\s*:\s*#13a89e\s*;?/gi, '');
  // 토큰이 비어 내용이 사라진 블록(<div>/<p>) 제거 — <br>만 있는 빈 줄은 유지
  out = out.replace(/<(div|p)\b[^>]*>\s*<\/\1>/gi, '');
  // 빈 특이사항 등으로 인접한 빈 줄이 둘 이상이면 하나로 축소
  out = out.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
  out = out.replace(/<div[^>]*>\s*<br\s*\/?>\s*<\/div>/gi, '<br>');
  return out;
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
