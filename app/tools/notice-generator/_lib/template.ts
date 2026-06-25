// 사용자가 직접 편집/저장하는 "안내문 서식"과 치환 토큰 정의.
//
// 서식은 HTML(서식 포함)로 저장됩니다. 외부(웹/한글/워드/메신저 등)에서
// 색상·이모지·줄간격 등이 들어간 내용을 그대로 붙여넣으면 형식이 유지되고,
// 본문에 넣은 아래 토큰만 계산 결과로 자동 치환됩니다.

export type TemplateToken = { token: string; desc: string };

export const TOKENS: TemplateToken[] = [
  { token: '{업체명}', desc: '업체명 입력값' },
  { token: '{세목}', desc: '선택한 세목 (예: 부가가치세)' },
  { token: '{귀속}', desc: '귀속/과세기간 표기' },
  { token: '{대상기간}', desc: '과세/귀속 기간 · 2026. 01. 01 ~ 2026. 03. 31' },
  { token: '{세금납부기한}', desc: '세금 납부 기한 · 2026. 06. 30 (금)' },
  { token: '{자료제출마감}', desc: '자료 제출 마감 줄 (토글 ON일 때만 표시)' },
  { token: '{자료제출안내}', desc: '제출 마감 2일 전 안내 멘트 (토글 ON일 때만 표시)' },
  { token: '{마감일}', desc: '최종 기한 · 2026년 5월 8일 (금)' },
  { token: '{마감일짧게}', desc: '최종 기한 · 2026. 05. 08 (금)' },
  { token: '{법정마감일}', desc: '보정 전 법정 기한' },
  { token: '{요일}', desc: '최종 기한의 요일 (예: 금)' },
  { token: '{필요자료}', desc: '업체별 제출자료 입력값' },
  { token: '{특이사항}', desc: '업체 특이사항 입력값' },
];

// 기본 서식(HTML). 색상·이모지 예시 포함 — 사용자가 외부 서식으로 덮어쓰면 됩니다.
export const DEFAULT_TEMPLATE = `<div style="line-height:1.8;">
<div>{귀속} {세목} 신고와 관련하여 자료 요청드립니다. 첨부된 공문을 확인하시어 해당하시는 자료를 업로드 부탁드립니다.</div>
<div><br></div>
<div>📢 <b>[ 중요 ] 신고 일정 안내</b></div>
<div>대상 기간: {대상기간}</div>
<div>{자료제출마감}</div>
<div>세금 납부 기한: {세금납부기한}</div>
<div><br></div>
<div>📁 <b>기존 제출 자료</b></div>
<div>{필요자료}</div>
<div><br></div>
<div>{특이사항}</div>
<div><br></div>
<div>{자료제출안내}</div>
</div>`;

// 업체별 필요자료 기본 예시. 사용자가 자유롭게 수정.
export const DEFAULT_MATERIALS = `- 통장거래내역
- 카드이용내역
- 수기세금계산서`;
