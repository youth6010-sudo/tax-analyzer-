/** 부가가치세 공통·업종별 항목 — 준비서류 표 / 공문 본문 */

export type VatBusinessType = 'individual' | 'corporate';

export const VAT_BUSINESS_TYPE_LABEL: Record<VatBusinessType, string> = {
  individual: '개인',
  corporate: '법인',
};

type VatRow = { short: string; desc: string };

const INDUSTRY_ROWS: VatRow[] = [
  {
    short: 'POS 매출',
    desc: 'POS 단말기 매출내역, 현금 매출내역(현금영수증 발행분 제외)',
  },
  {
    short: '식당(배달)',
    desc: '배달 대행 정산 내역서 또는 ID/PW',
  },
  {
    short: '온라인 판매',
    desc: '판매대행(네이버, 쿠팡 등), PG사, SNS, 자사몰 매출 내역',
  },
  {
    short: '유튜브 등 미디어 콘텐츠',
    desc: '외화 입금 확인서 추가',
  },
  {
    short: '수출/외화',
    desc: '수출입 신고필증, 외환거래 내역, 인보이스 등',
  },
  { short: '물품 수입', desc: '수입 관련 내역' },
  { short: '임대사업자', desc: '변경된 임대차 계약서' },
];

function commonRows(businessType: VatBusinessType): VatRow[] {
  const manual: VatRow = {
    short: '수기 발행분',
    desc: '수기 세금계산서 및 계산서 일체',
  };
  const expenseCard: VatRow = {
    short: '지출 증빙',
    desc: '업무용 직원 신용카드(카드번호/사용처/용도 기입)',
  };
  const expenseEtc: VatRow = {
    short: '미등록 카드·영수증',
    desc: '홈택스 미등록 카드내역(엑셀), 일반 지출영수증, 간이영수증',
  };
  if (businessType === 'corporate') {
    return [
      {
        short: '통장·카드',
        desc: '통장 거래내역(엑셀), 카드 이용대금 명세서',
      },
      manual,
      expenseCard,
      expenseEtc,
    ];
  }
  return [manual, expenseCard, expenseEtc];
}

function commonFormalLines(businessType: VatBusinessType): string[] {
  if (businessType === 'corporate') {
    return [
      '통장 거래내역(엑셀), 카드 이용대금 명세서',
      '수기 발행분: 수기 세금계산서 및 계산서 일체',
    '지출 증빙: 업무용 직원 신용카드(카드번호/사용처/용도 기입)',
    '미등록 카드·영수증: 홈택스 미등록 카드내역(엑셀), 일반 지출영수증, 간이영수증',
  ];
  }
  return [
    '수기 발행분: 수기 세금계산서 및 계산서 일체',
    '지출 증빙: 업무용 직원 신용카드(카드번호/사용처/용도 기입)',
    '미등록 카드·영수증: 홈택스 미등록 카드내역(엑셀), 일반 지출영수증, 간이영수증',
  ];
}

function industryFormalLines(): string[] {
  return INDUSTRY_ROWS.map(r => (r.short ? `${r.short}: ${r.desc}` : r.desc));
}

function prepRowHtml(num: number, short: string, desc: string): string {
  const name = short
    ? `<span class="num-badge">${num}</span>${short}`
    : `<span class="num-badge">${num}</span>`;
  return `<tr><td class="item-name">${name}</td><td class="item-desc">${desc}</td></tr>`;
}

function formalLineHtml(num: number, text: string): string {
  return `<p class="formal-item-line"><span class="formal-li-num">${String(num).padStart(2, '0')}.</span> ${text}</p>`;
}

function prepTableRows(rows: VatRow[]): string {
  return rows.map((r, i) => prepRowHtml(i + 1, r.short, r.desc)).join('');
}

function formalItems(lines: string[]): string {
  return lines.map((text, i) => formalLineHtml(i + 1, text)).join('');
}

export function buildVatPrepCommonRows(businessType: VatBusinessType): string {
  return prepTableRows(commonRows(businessType));
}

export function buildVatPrepIndustryRows(): string {
  return prepTableRows(INDUSTRY_ROWS);
}

export function buildVatFormalCommonItems(businessType: VatBusinessType): string {
  return formalItems(commonFormalLines(businessType));
}

export function buildVatFormalIndustryItems(): string {
  return formalItems(industryFormalLines());
}

/** 공문 PDF 본문 — 표 디자인 없이 번호 목록만 */
export function buildVatFormalBody(businessType: VatBusinessType): string {
  return `
<p class="formal-section-mark">▶ 기본 신고 자료 ◀</p>
<div class="formal-items">${buildVatFormalCommonItems(businessType)}</div>
<p class="formal-line formal-blank">&nbsp;</p>
<p class="formal-section-mark">▶ 업종별 추가 제출자료 ◀</p>
<div class="formal-items">${buildVatFormalIndustryItems()}</div>`.trim();
}
