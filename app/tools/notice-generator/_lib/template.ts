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
{귀속} {세목} 신고를 위해 첨부된 공문을 확인하시고, 해당 자료 업로드를 부탁드립니다.<br>
📢 <b>[ 중요 ] 신고 일정 안내</b><br>
대상 기간: {대상기간}<br>
{자료제출마감}<br>
세금 납부 기한: {세금납부기한}<br>
📁 <b>기존 제출 자료</b><br>
{필요자료}<br>
{특이사항}<br>
{자료제출안내}<br>
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
{귀속} {세목} 신고를 위해 아래 자료를 기한 내 제출 부탁드립니다.<br>
📢 <b>신고 일정 안내</b><br>
{자료제출마감}<br>
세금 납부 기한: {세금납부기한}<br>
📁 <b>요청자료</b><br>
{필요자료}<br>
</div>`,
  },
  filing: {
    mode: 'filing',
    label: '신고안내',
    desc: '신고 일정만 간단히 안내',
    html: `<div style="line-height:1.8;">
📢 <b>신고 일정 안내</b><br>
신고 대상 : {귀속} {세목} 인건비 내역<br>
세금 납부 기한: {세금납부기한}<br>
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

/** 기본 서식 vs 담당자 저장 서식 */
export type TemplateSource = 'default' | 'custom';

// 부가세 신고 결과 보고 및 검토 — 사용자 서식 토큰
export const VAT_REPORT_TOKENS: TemplateToken[] = [
  { token: '{귀속}', desc: '과세기간 표기' },
  { token: '{세목}', desc: '세목명 (부가가치세)' },
  { token: '{신고결과요약표}', desc: '매출·매입·불공제·경감·가산·최종세액 요약 표' },
  { token: '{신고결과부가정보}', desc: '부가율·직원·차량·종이계산서·환급사유·특이사항 (입력된 항목만)' },
  { token: '{분납안내}', desc: '납부 세액 발생 시 분납 권장 일정 (없으면 자동 제거)' },
];

export const DEFAULT_VAT_REPORT_TEMPLATE = `<div style="line-height:1.8;">
📋 [신고 결과 보고 및 검토 안내]<br>
안녕하세요. {귀속} {세목} 신고 결과를 안내드립니다.<br>
매입매출장과 결과 보고서를 함께 첨부했습니다.<br>
아래 요약과 첨부 자료에 누락·오류가 없는지 검토 부탁드립니다.<br>
[신고 결과 요약]<br>
{신고결과요약표}
<br>
{신고결과부가정보}
<br>
✅ 이상이 없으시면 "확인 완료" 댓글을 남겨 주세요.<br>
{분납안내}
<br>
감사합니다.<br>
</div>`;

// 신고 결과 안내(납부세액) — 사용자 서식 토큰
export const PAYMENT_NOTICE_TOKENS: TemplateToken[] = [
  { token: '{귀속}', desc: '과세/귀속 기간' },
  { token: '{세목}', desc: '세목명' },
  { token: '{납부기한}', desc: '납부 기한 날짜' },
  { token: '{납부서장수}', desc: '납부서 장수' },
  { token: '{최종납부세액}', desc: '최종 납부 세액' },
  { token: '{최종환급세액}', desc: '최종 환급 세액' },
  { token: '{안내본문}', desc: '납부·환급·분납 자동 본문 전체' },
  { token: '{서두}', desc: '상단 안내 문장' },
  { token: '{납부요약}', desc: '최종 납부 세액 줄' },
  { token: '{납부내역}', desc: '세목별 납부 내역' },
  { token: '{첨부안내}', desc: '첨부 서류 안내 줄' },
  { token: '{첨부서류상세}', desc: '입력한 첨부 서류 설명만' },
  { token: '{납부기한줄}', desc: '납부 기한 줄' },
  { token: '{환급요약}', desc: '최종 환급 세액 줄' },
  { token: '{환급내역}', desc: '세목별 환급 내역' },
  { token: '{환급시점}', desc: '환급 예정 안내' },
  { token: '{분납회차목록}', desc: '부가세 분납 회차별 일정·금액' },
  { token: '{연체안내}', desc: '납부지연 가산세 안내' },
];

export const DEFAULT_PAYMENT_NOTICE_TEMPLATE = `<div style="line-height:1.8;">
{안내본문}
</div>`;

import type { OfficialLetterKind } from './officialLetter';

/** 담당자(로그인 계정)별 서식 저장 구조 — users.notice_template JSON */
export type { OfficialLetterKind };

export type NoticeTemplateStore = {
  version: 3;
  templates: TemplateMap;
  sources: Partial<Record<TemplateScenario, TemplateSource>>;
  vatReportTemplate?: string;
  vatReportSource?: TemplateSource;
  paymentNoticeTemplate?: string;
  paymentNoticeSource?: TemplateSource;
  officialLetters?: Partial<Record<OfficialLetterKind, string>>;
  officialLetterSources?: Partial<Record<OfficialLetterKind, TemplateSource>>;
  officialFormTemplates?: Partial<Record<string, string>>;
  officialFormSources?: Partial<Record<string, TemplateSource>>;
};

export function emptyNoticeTemplateStore(): NoticeTemplateStore {
  return { version: 3, templates: {}, sources: {} };
}
