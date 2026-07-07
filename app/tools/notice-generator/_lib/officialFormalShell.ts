/** 공문양식 통일 레이아웃 — 공문.xlsx 헤더 + 준비서류 본문 + 로고 푸터 */

export const FORMAL_LOGO_SRC = '/logo-formal.png';
export const FORMAL_FOOTER_LOGO_SRC = '/logo-formal-footer.png';

export const OFFICIAL_FORMAL_FOOTER = `
<footer class="formal-footer">
  <img src="${FORMAL_FOOTER_LOGO_SRC}" alt="세무법인청년들 로고" class="formal-footer-logo" />
</footer>`;

/** 엑셀/PDF 공문 헤더·인사말 + 본문(번호 목록) + 하단 로고 */
export function buildFormalDocument(bodyContentHtml: string): string {
  return `
<div class="formal-doc">
  <div class="formal-header-top">
    <img src="${FORMAL_LOGO_SRC}" alt="세무법인청년들 로고" class="formal-header-logo" />
    <div class="formal-brand">Youth tax Management Corporation</div>
  </div>
  <div class="formal-address">우) 48059 부산광역시 해운대구 센텀중앙로 90, 큐비E센텀 1501호 세무법인 청년들</div>
  <div class="formal-contact">TEL : (051) 783-6007<span class="formal-contact-gap"></span>FAX : (051) 784-6007<span class="formal-contact-gap"></span>E-MAIL : {담당자메일}</div>

  <div class="formal-meta-block">
    <p class="formal-meta-row"><span class="formal-meta-label">문서번호</span><span class="formal-meta-colon">  :  </span><span class="formal-meta-value">{문서번호}</span></p>
    <p class="formal-meta-row"><span class="formal-meta-label">일자</span><span class="formal-meta-colon">  :  </span><span class="formal-meta-value">{공문일자}</span></p>
    <p class="formal-meta-row formal-subject-row"><span class="formal-meta-label">제목</span><span class="formal-meta-colon">  :  </span><span class="formal-meta-value formal-subject-text">{제목}</span></p>
  </div>

  <p class="formal-line">귀사의 무궁한 발전을 기원합니다.</p>
  <p class="formal-line">{신고기한문단}</p>
  <p class="formal-line formal-blank">&nbsp;</p>
  <p class="formal-line">아래 열거된 것 중에 해당되는 서류만 보내주시면 되며,</p>
  <p class="formal-line">이미 보내주신 자료 또는 확인 가능 자료는 제출하지 않으셔도 됩니다.</p>
  <p class="formal-line">{자료제출마감문장}</p>
  <p class="formal-line formal-blank">&nbsp;</p>
  <p class="formal-line formal-period">{공문기간안내}</p>
  <p class="formal-line formal-blank">&nbsp;</p>

  <div class="formal-body">
    ${bodyContentHtml}
  </div>
  ${OFFICIAL_FORMAL_FOOTER}
</div>`.trim();
}
