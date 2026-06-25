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
  { token: '{대상기간}', desc: '과세/귀속 기간 · 2026.01.01 ~ 2026.03.31' },
  { token: '{세금납부기한}', desc: '세금 납부 기한 · 2026.06.30 (화)' },
  { token: '{자료제출마감}', desc: '자료 제출 마감 줄 (예: 2026.07.27 (월) 13:00)' },
  { token: '{자료제출안내}', desc: '제출 마감 2일 전 안내 멘트' },
  { token: '{마감일}', desc: '최종 기한 · 2026년 5월 8일 (금)' },
  { token: '{마감일짧게}', desc: '최종 기한 · 2026.05.08 (금)' },
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

// 원천세 전용 안내 유형. 두 가지 고정 서식 중 선택해 사용합니다.
export type WithholdingMode = 'request' | 'filing';

export type WithholdingTemplate = {
  mode: WithholdingMode;
  label: string;
  desc: string;
  html: string;
};

export const WITHHOLDING_TEMPLATES: Record<WithholdingMode, WithholdingTemplate> = {
  request: {
    mode: 'request',
    label: '자료요청',
    desc: '인건비 자료를 요청하는 안내',
    html: `<div style="line-height:1.8;">
<div>{귀속} {세목} 신고와 관련하여 자료 요청드립니다. 신고를 위해 아래 자료를 기한 내 제출 부탁드립니다.</div>
<div><br></div>
<div>📢 <b>신고 일정 안내</b></div>
<div>{자료제출마감}</div>
<div>세금 납부 기한: {세금납부기한}</div>
<div><br></div>
<div>📁 <b>요청자료</b></div>
<div>{필요자료}</div>
</div>`,
  },
  filing: {
    mode: 'filing',
    label: '신고안내',
    desc: '신고 일정만 간단히 안내',
    html: `<div style="line-height:1.8;">
<div>📢 <b>신고 일정 안내</b></div>
<div>신고 대상 : {귀속} {세목} 인건비 내역</div>
<div>세금 납부 기한: {세금납부기한}</div>
</div>`,
  },
};

export const WITHHOLDING_MODE_LIST: WithholdingMode[] = ['request', 'filing'];

// 담당자별로 서버 저장하는 안내문 서식은 "시나리오" 단위로 관리한다.
// - general: 부가세·법인세·종소세 공통
// - withholding_request: 원천세 + 급여대장 미작성(업체가 급여대장 제출) → 자료요청
// - withholding_filing: 원천세 + 급여대장 작성(우리가 작성) → 신고안내
export type TemplateScenario = 'general' | 'withholding_request' | 'withholding_filing';

export type TemplateMap = Partial<Record<TemplateScenario, string>>;

export const DEFAULT_TEMPLATE_BY_SCENARIO: Record<TemplateScenario, string> = {
  general: DEFAULT_TEMPLATE,
  withholding_request: WITHHOLDING_TEMPLATES.request.html,
  withholding_filing: WITHHOLDING_TEMPLATES.filing.html,
};

// 시나리오별 편집기 헤더 라벨
export const SCENARIO_LABEL: Record<TemplateScenario, string> = {
  general: '안내문 서식',
  withholding_request: '안내문 서식 · 원천세 자료요청',
  withholding_filing: '안내문 서식 · 원천세 신고안내(급여대장 작성)',
};
