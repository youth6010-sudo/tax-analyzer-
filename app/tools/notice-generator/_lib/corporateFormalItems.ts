/** 법인세 공문·준비서류 — 법인세안내문2025년.hwp 기준, 공문용으로 다듬음 */

type CorpRow = { short: string; desc: string };

/** HWP 준비서류 1~26번 */
export const CORPORATE_FORMAL_ROWS: CorpRow[] = [
  {
    short: '모든 영수증',
    desc: '{귀속연도}년 영수증 일체',
  },
  {
    short: '통장 거래내역',
    desc: '{귀속연도}.1.1~12.31 법인통장 거래내역 엑셀(보통·정기·적금·외화통장 포함)',
  },
  {
    short: '잔액증명',
    desc: '{귀속연도}.12.31 기준 모든 법인통장 잔액증명서(정기예금·적금·외화통장 포함)',
  },
  {
    short: '부채증명',
    desc: '대출·차입금이 있는 경우 {귀속연도}.12.31 기준 부채증명서 또는 금융거래확인서(금융기관·협회 등)',
  },
  {
    short: '대출이자 납입',
    desc: '대출·차입이 있는 경우 월별 이자 납입·원금상환 내역서(이자 계산기간·요율 표기)',
  },
  {
    short: '어음대장',
    desc: '지급어음·받을어음 대장',
  },
  {
    short: '장려금·보조금',
    desc: '판매장려금·국고보조금 등 수령 내역서',
  },
  {
    short: '지방세',
    desc: '지방세 세목별 과세증명서',
  },
  {
    short: '자산·매매',
    desc: '자산 할부 상환 내역·부동산 매매계약서(리스 계약 포함)',
  },
  {
    short: '차량',
    desc: '{귀속연도}년 신규 구입 차량은 차량등록증, 폐차 차량은 폐차증명서 제출',
  },
  {
    short: '보험료',
    desc: '{귀속연도}년 법인명의 보험료 납입증명·보험증권(계약기간 표시분)',
  },
  {
    short: '법인카드',
    desc: '{귀속연도}년 1월~{귀속다음연도}년 2월 법인카드 이용대금 명세서·고지서({귀속연도}년 12월분 사용 확인용)',
  },
  {
    short: '재고',
    desc: '원재료·제품 등 재고현황표(업체 관리 양식)',
  },
  {
    short: '주식 변동',
    desc: '{귀속연도}년 주주·지분 변동이 있는 경우 변동상황명세서 통보',
  },
  {
    short: '부동산',
    desc: '부동산 양도·양수 해당 시 통보',
  },
  {
    short: '출자좌수증명원',
    desc: '건설업 해당 시 제출',
  },
  {
    short: '법인등기부등본',
    desc: '{귀속연도}년 변경사항이 표시된 법인등기부등본(말소사항 포함)',
  },
  {
    short: '고정자산 변동',
    desc: '고정자산 변동내역(차량·기계장치 등 처분 내역, 매매계약서 등)',
  },
  {
    short: '이자소득 원천징수',
    desc: '{귀속연도}년 이자소득원천징수영수증(각 계좌별), 외화·펀드·정기예금 포함',
  },
  {
    short: '주주명부',
    desc: '{귀속연도}.12.31 기준 주주명부',
  },
  {
    short: '채권·채무 잔액',
    desc: '{귀속연도}.12.31 기준 외상매출금·외상매입금·미지급금·미수금·선수금·선급금 잔액내역(거래처별 정리)',
  },
  {
    short: '임대차계약서',
    desc: '임대차계약서(부동산 임대차계약서 및 사무기기 등 각종 임대차계약서 사본)',
  },
  {
    short: '기부금',
    desc: '{귀속연도}년 기부금 내역서',
  },
  {
    short: '업무용승용차',
    desc: '{귀속연도}년 업무용승용차 운행일지 및 업무용 운행거리',
  },
  {
    short: '4대보험',
    desc: '{귀속연도}년 사업장 보험료 고지·납부 현황',
  },
  {
    short: '외상대 지급',
    desc: '법인통장에 찍히지 않은 외상대 지급내역(개인통장 지급 시 해당 엑셀에 체크, 예: 직원급여·임차료·리스료 등)',
  },
];

function prepRowHtml(num: number, short: string, desc: string): string {
  return `<tr><td class="item-name"><span class="num-badge">${num}</span>${short}</td><td class="item-desc">${desc}</td></tr>`;
}

function formalLineHtml(num: number, short: string, desc: string): string {
  const text = short ? `${short}: ${desc}` : desc;
  return `<p class="formal-item-line"><span class="formal-li-num">${String(num).padStart(2, '0')}.</span> ${text}</p>`;
}

export function buildCorporatePrepTableRows(): string {
  return CORPORATE_FORMAL_ROWS.map((r, i) => prepRowHtml(i + 1, r.short, r.desc)).join('');
}

export function buildCorporateFormalItems(): string {
  return CORPORATE_FORMAL_ROWS.map((r, i) => formalLineHtml(i + 1, r.short, r.desc)).join('');
}

export function buildCorporateFormalBody(): string {
  return `
<p class="formal-section-mark">▶ 준비서류 ◀</p>
<div class="formal-items">${buildCorporateFormalItems()}</div>`.trim();
}

export function buildCorporatePrepContent(): string {
  return `
<div class="content-grid">
  <div class="section-box">
    <div class="section-header">
      <i class="fa-solid fa-building"></i>
      <h3>▶ 준비서류 ◀</h3>
    </div>
    <table>
      <tbody>${buildCorporatePrepTableRows()}</tbody>
    </table>
  </div>
</div>`.trim();
}
