import { TAX_TYPES } from './taxTypes';
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
  return `※ 원활한 신고 업무를 위해 기한 준수를 부탁드리며, 일정 조정이 필요하시면 ${formatDottedDate(twoDaysBefore, { withWeekday: false })}까지 말씀해 주시기 바랍니다.`;
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

const OVERDUE_NOTE = '※ 기한 내 미납부 시 납부지연가산세가 부과될 수 있으니 유의 부탁드립니다.';

// "YYYY-MM-DD" → 점 표기 날짜(요일 포함). 비었으면 빈 문자열.
function isoToDottedDate(iso: string): string {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  return formatDottedDate(new Date(y, m - 1, d));
}

// 부가세 분납 안내문구 — 납부서(회차)별 날짜·금액 나열
function buildVatInstallmentHtml({
  belong,
  name,
  slips,
  installments,
}: {
  belong: string;
  name: string;
  slips: number;
  installments: { date: string; amount: number }[];
}): string {
  const line = (s: string) => `<div>${s}</div>`;
  const blank = '<div><br></div>';
  const dash = (s: string) => `<div>&nbsp;- ${s}</div>`;
  const total = installments.reduce((s, it) => s + Math.max(0, Math.round(it.amount || 0)), 0);

  const parts: string[] = [];
  parts.push(line(`${belong} ${escapeHtml(name)} 신고가 완료되어 납부서를 첨부해 드립니다. 분할 납부 일정은 아래와 같습니다.`));
  parts.push(blank);
  parts.push(line(`최종 납부 세액: 총 ${escapeHtml(formatWon(total))}`));
  installments.forEach((it, i) => {
    const dateText = isoToDottedDate(it.date) || '(일자 미입력)';
    parts.push(dash(`${i + 1}차: ${escapeHtml(dateText)} · ${escapeHtml(formatWon(it.amount))}`));
  });
  parts.push(line(`첨부 서류: 납부서 ${slips}장`));
  parts.push(line(OVERDUE_NOTE));
  return `<div style="line-height:1.8;">${parts.join('')}</div>`;
}

// 신고 결과 안내문구(HTML) 생성. 금액이 음수면 환급으로 처리하며,
// 납부·환급이 섞인 경우 필요한 내용만 취합한다.
export function buildPaymentNoticeHtml({
  taxType,
  deadline,
  payment,
}: {
  taxType: TaxTypeKey;
  deadline: DeadlineResult | null;
  payment: PaymentNotice;
}): string {
  const name = NAME[taxType] || '';
  const belong = deadline ? escapeHtml(deadline.periodLabel) : '';
  const dueDate = deadline ? escapeHtml(formatDottedDate(deadline.final)) : '';
  const slips = Math.max(0, Math.round(payment.slips || 0));
  const hasLocal = hasLocalIncomeTax(taxType);
  const main = Math.round(payment.amount || 0);
  const local = hasLocal ? Math.round(payment.localAmount || 0) : 0;

  // 부가세 분납: 납부서 2장 이상이면 회차별 날짜·금액으로 안내
  if (taxType === TAX_TYPES.VAT && slips >= 2 && payment.installments.length >= 2) {
    return buildVatInstallmentHtml({ belong, name, slips, installments: payment.installments });
  }

  const items: PayItem[] = hasLocal
    ? [
        { name, amount: main },
        { name: '지방소득세', amount: local },
      ]
    : [{ name, amount: main }];

  const payItems = items.filter(i => i.amount > 0);
  const refundItems = items.filter(i => i.amount < 0);
  const payTotal = payItems.reduce((s, i) => s + i.amount, 0);
  const refundTotal = refundItems.reduce((s, i) => s + Math.abs(i.amount), 0);

  const line = (s: string) => `<div>${s}</div>`;
  const blank = '<div><br></div>';
  const dash = (s: string) => `<div>&nbsp;- ${s}</div>`;
  // 지방소득세가 있는 세목(원천세·종소세·법인세)만 항목별 내역을 표기
  const breakdown = (list: PayItem[]) =>
    hasLocal ? list.map(i => dash(`${escapeHtml(i.name)} ${escapeHtml(formatWon(i.amount))}`)).join('') : '';
  const refundTiming = escapeHtml(refundTimingLine(taxType, payment.refundClaimed));

  const anyPay = payItems.length > 0;
  const anyRefund = refundItems.length > 0;
  const parts: string[] = [];

  if (anyRefund && !anyPay) {
    // 전액 환급
    parts.push(line(`${belong} ${escapeHtml(name)} 신고 결과 환급 세액이 발생하여 별도로 납부하실 금액은 없습니다.`));
    parts.push(blank);
    parts.push(line(`최종 환급 세액: 총 ${escapeHtml(formatWon(refundTotal))}`));
    parts.push(breakdown(refundItems));
    parts.push(line(refundTiming));
  } else if (anyPay && anyRefund) {
    // 납부 + 환급 혼합 — 필요한 내용만 취합
    parts.push(line(`${belong} ${escapeHtml(name)} 신고가 완료되었습니다. 납부·환급 내역을 함께 안내드립니다.`));
    parts.push(blank);
    parts.push(line(`[납부] 최종 납부 세액: 총 ${escapeHtml(formatWon(payTotal))}`));
    parts.push(breakdown(payItems));
    parts.push(line(`첨부 서류: 납부서 ${slips}장`));
    parts.push(line(`납부 기한: ${dueDate}`));
    parts.push(blank);
    parts.push(line(`[환급] 최종 환급 세액: 총 ${escapeHtml(formatWon(refundTotal))}`));
    parts.push(breakdown(refundItems));
    parts.push(line(refundTiming));
    parts.push(line(OVERDUE_NOTE));
  } else {
    // 전액 납부 (기본). 입력 전(0원) 상태 포함.
    const listForBreakdown = payItems.length > 0 ? payItems : items;
    parts.push(line(`${belong} ${escapeHtml(name)} 신고가 완료되어 납부서를 첨부해 드립니다. 금액 확인 후 기한 내 납부 부탁드립니다.`));
    parts.push(blank);
    parts.push(line(`최종 납부 세액: 총 ${escapeHtml(formatWon(payTotal))}`));
    parts.push(breakdown(listForBreakdown));
    parts.push(line(`첨부 서류: 납부서 ${slips}장`));
    parts.push(line(`납부 기한: ${dueDate}`));
    parts.push(line(OVERDUE_NOTE));
  }

  return `<div style="line-height:1.8;">${parts.join('')}</div>`;
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
  const reduction = Math.round(report.reductionAmount || 0);
  // 납부세액 = 매출세액 - 매입세액 - 경감세액 (+ 납부 / - 환급)
  const finalTax = salesVat - buyVat - reduction;
  return { salesSupply, salesVat, buySupply, buyVat, reduction, finalTax };
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
    reductionRow +
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

// 부가세 전용: 신고 결과 보고 및 검토 안내문구(HTML). 납부서 안내문구 앞에 표시.
export function buildVatReportHtml({
  taxType,
  deadline,
  report,
}: {
  taxType: TaxTypeKey;
  deadline: DeadlineResult | null;
  report: VatReport;
}): string {
  const belong = deadline ? escapeHtml(deadline.periodLabel) : '';
  const name = NAME[taxType] || '부가가치세';
  const r = calcVatReport(report);
  const isPay = r.finalTax >= 0;
  const taxLabel = isPay ? '납부' : '환급';

  const line = (s: string) => `<div>${s}</div>`;
  const blank = '<div><br></div>';
  const dash = (s: string) => `<div>&nbsp;- ${s}</div>`;
  const parts: string[] = [];

  parts.push(line('📋 [신고 결과 보고 및 검토 안내]'));
  parts.push(blank);
  parts.push(line(`안녕하세요. ${belong} ${escapeHtml(name)} 신고 결과를 안내드립니다.`));
  parts.push(line('매입매출장과 결과 보고서를 함께 첨부하오니,'));
  parts.push(line('아래 요약과 첨부 자료에 누락·오류가 없는지 검토 부탁드립니다.'));
  parts.push(blank);
  parts.push(line('[신고 결과 요약]'));
  parts.push(vatSummaryTable(report, r, taxLabel));
  parts.push(blank);
  parts.push(line('✅ 검토 후 이상이 없으시면 "확인 완료" 댓글 부탁드립니다.'));

  if (isPay && r.finalTax > 0) {
    parts.push(blank);
    parts.push(line('💳 [분납(분할 납부) 안내]'));
    parts.push(line('분할 납부를 원하시면 희망 납부일자별 금액을 댓글로 남겨 주세요.'));
    parts.push(line('다음 신고기한과 겹치지 않도록 아래 일정 내 최대 3회(약 3개월) 분납을 권장드립니다.'));
    if (deadline) {
      const labels = ['1차 (신고·납부일)', '2차 (+1개월 말일)', '3차 (+2개월 말일)'];
      installmentSchedule(deadline.final).forEach((d, i) => {
        parts.push(dash(`${labels[i]}: ${escapeHtml(formatDottedDate(d))}`));
      });
    }
  }

  parts.push(blank);
  parts.push(line('감사합니다.'));

  return `<div style="line-height:1.8;">${parts.join('')}</div>`;
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

  const tpl = template || '';

  let out = tpl;
  for (const [token, value] of map) {
    out = out.split(token).join(value);
  }
  // 레거시 기본 서식의 청록색(세금 납부 기한 강조) 제거 — 저장된 옛 서식 마이그레이션
  out = out.replace(/color\s*:\s*#13a89e\s*;?/gi, '');
  // 토큰이 비어 내용이 사라진 블록(<div>/<p>) 제거 — <br>만 있는 빈 줄은 유지
  out = out.replace(/<(div|p)\b[^>]*>\s*<\/\1>/gi, '');
  // 빈 특이사항 등으로 인접한 빈 줄(<div><br></div>)이 둘 이상이면 하나로 축소
  out = out.replace(/(<(div|p)\b[^>]*>\s*<br\s*\/?>\s*<\/\2>\s*){2,}/gi, '<div><br></div>');
  return out;
}

// 미리보기 HTML → 일반 텍스트 (메신저 붙여넣기용)
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  let s = html
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
