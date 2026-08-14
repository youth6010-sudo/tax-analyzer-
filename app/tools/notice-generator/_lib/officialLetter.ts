import { TAX_TYPES, VAT_PERIODS, isVatPreliminaryNotice } from './taxTypes';
import type { CorpNoticePhase, DeadlineResult, TaxTypeKey } from './types';
import { ALL_MANAGER_CONTACTS, type ManagerContact } from './managerContact';
import { DEFAULT_OFFICIAL_INCOME_BODY } from './defaultOfficialIncomeBody';
import { DEFAULT_OFFICIAL_VAT_BODY } from './defaultOfficialVatBody';
import {
  buildVatFormalBody,
  buildVatPrepCommonRows,
  buildVatPrepIndustryRows,
  type VatBusinessType,
} from './vatBusinessItems';
import {
  buildCorporateFormalBody,
  buildCorporatePrepContent,
} from './corporateFormalItems';

export type NoticeOutputMode = 'message' | 'official';

export type OfficialLetterKind = 'vat' | 'corporate' | 'income';

export const NOTICE_OUTPUT_MODES: { id: NoticeOutputMode; label: string }[] = [
  { id: 'message', label: '신고안내문구' },
  { id: 'official', label: '공문' },
];

export const OFFICIAL_TAX_KINDS: { id: OfficialLetterKind; label: string }[] = [
  { id: 'vat', label: '부가가치세' },
  { id: 'corporate', label: '법인세' },
  { id: 'income', label: '종합소득세' },
];

const LEGACY_MODE_TO_TAX: Record<string, OfficialLetterKind> = {
  official_vat: 'vat',
  official_corporate: 'corporate',
  official_income: 'income',
};

/** localStorage 마이그레이션 */
export function normalizeNoticeCategory(raw: string): NoticeOutputMode {
  if (raw === 'message') return 'message';
  if (raw === 'official' || raw === 'notice' || raw === 'official_form') return 'official';
  if (raw in LEGACY_MODE_TO_TAX) return 'official';
  return 'message';
}

/** 종소세: 안내문(A4 표) / 부가·법인: 공문(PDF 양식) */
export function usesFormalOfficialLayout(kind: OfficialLetterKind): boolean {
  return kind === 'vat' || kind === 'corporate';
}

export function legacyTaxKindFromMode(raw: string): OfficialLetterKind | null {
  return LEGACY_MODE_TO_TAX[raw] ?? null;
}

export function officialKindForNav(
  category: NoticeOutputMode,
  taxKind: OfficialLetterKind,
): OfficialLetterKind | null {
  if (category !== 'official') return null;
  return taxKind;
}

export const OFFICIAL_LETTER_TOKENS = [
  { token: '{귀속연도}', desc: '귀속·기준 연도' },
  { token: '{귀속다음연도}', desc: '귀속연도 + 1 (법인카드 등)' },
  { token: '{과세기간}', desc: '과세/귀속 기간 표기 (연도 포함)' },
  { token: '{자료제출마감일}', desc: '자료 제출 마감 (예: 05월 08일)' },
  { token: '{세금납부기한}', desc: '세금 납부 기한' },
  { token: '{담당자메일}', desc: '공문 하단 연락처 메일 (로그인 담당자 자동)' },
  { token: '{업체명}', desc: '연결된 업체명' },
  { token: '{문서번호}', desc: '공문 문서번호' },
  { token: '{공문일자}', desc: '공문 작성일' },
  { token: '{제목}', desc: '공문 제목' },
  { token: '{신고기한문단}', desc: '신고·납부기한 안내 문장' },
  { token: '{자료제출마감문장}', desc: '자료 제출 요청 문장' },
  { token: '{신고대상기간}', desc: '신고대상 과세기간' },
  { token: '{공문기간안내}', desc: '세목별 기간 안내 문장' },
  { token: '{부가세공문본문}', desc: '부가세 공문 본문(공통·업종별)' },
  { token: '{부가세공통항목표}', desc: '준비서류 공통 항목 표' },
  { token: '{부가세업종항목표}', desc: '준비서류 업종별 항목 표' },
  { token: '{법인세공문본문}', desc: '법인세 공문 본문' },
] as const;

const OFFICIAL_FOOTER = `
<footer>
  <div class="contact-details">
    <div class="contact-item"><i class="fa-solid fa-phone"></i> 051-783-6007</div>
    <div class="contact-item"><i class="fa-solid fa-envelope"></i><span style="font-weight: bold; color: rgb(255, 0, 0);"> {담당자메일}</span></div>
    <div class="contact-item"><i class="fa-solid fa-fax"></i> 051-784-6007</div>
    <div class="contact-item"><i class="fa-solid fa-location-dot"></i> 부산 해운대구 센텀중앙로 90</div>
  </div>
  <div class="brand-area">
    <img src="/logo-income-footer.png" alt="세무법인청년들 로고" class="brand-logo" />
  </div>
</footer>`;

function officialHeader(title: string, guide: string): string {
  return `
<header>
  <span class="sub-top">세무법인 청년들 부산지점</span>
  <h1 class="main-title">${title}</h1>
  <div class="guide-msg">${guide}</div>
</header>`;
}

const DEFAULT_OFFICIAL_CORPORATE_BODY = `${officialHeader(
  '{귀속연도}년 귀속 법인세 신고 안내문',
  '모든 자료는 <span style="color: rgb(253, 8, 8); font-weight: bold;">{귀속연도}년</span> 사업연도 결산 자료를 <span style="color: rgb(255, 0, 0); font-weight: bold;">{자료제출마감일}까지</span> 보내주시기 바랍니다.',
)}
${buildCorporatePrepContent()}
${OFFICIAL_FOOTER}`;

export const DEFAULT_OFFICIAL_LETTER_BY_KIND: Record<OfficialLetterKind, string> = {
  income: DEFAULT_OFFICIAL_INCOME_BODY.trim(),
  vat: DEFAULT_OFFICIAL_VAT_BODY.trim(),
  corporate: DEFAULT_OFFICIAL_CORPORATE_BODY.trim(),
};

export const OFFICIAL_LETTER_LABEL: Record<OfficialLetterKind, string> = {
  vat: '부가가치세 공문',
  corporate: '법인세 공문',
  income: '종합소득세 공문',
};

export function officialKindFromOutputMode(
  mode: NoticeOutputMode,
  taxKind?: OfficialLetterKind,
): OfficialLetterKind | null {
  return officialKindForNav(mode, taxKind ?? 'vat');
}

export function taxTypeForOfficialKind(kind: OfficialLetterKind) {
  if (kind === 'vat') return TAX_TYPES.VAT;
  if (kind === 'corporate') return TAX_TYPES.CORPORATE;
  return TAX_TYPES.INCOME;
}

/** @deprecated official + taxKind 사용 */
export function taxTypeForOutputMode(
  mode: NoticeOutputMode,
  taxKind: OfficialLetterKind = 'vat',
): TaxTypeKey {
  const kind = officialKindForNav(mode, taxKind);
  if (kind) return taxTypeForOfficialKind(kind);
  return TAX_TYPES.VAT;
}

export type OfficialLetterVars = {
  attributionYear: string;
  periodLabel: string;
  materialDeadlineShort: string;
  taxDueShort: string;
  managerEmail: string;
  companyName: string;
  documentNumber: string;
  letterDate: string;
  subject: string;
  filingParagraph: string;
  materialSubmitSentence: string;
  coveragePeriod: string;
  periodNoteLine: string;
  vatBusinessType: VatBusinessType;
  vatFormalBodyHtml: string;
  vatPrepCommonRows: string;
  vatPrepIndustryRows: string;
  corporateFormalBodyHtml: string;
};

function formatLetterDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}. ${m}. ${day}.`;
}

function formatVatCoveragePeriod(year: number, vatPeriodId?: string): string {
  const p = VAT_PERIODS.find(x => x.id === vatPeriodId);
  if (!p) return '';
  return `${year}년 ${String(p.startMonth).padStart(2, '0')}월 ~ ${String(p.endMonth).padStart(2, '0')}월`;
}

export function buildOfficialLetterVars(opts: {
  deadline: DeadlineResult | null;
  materialDeadlineLine: string;
  manager: ManagerContact | null;
  companyName?: string;
  year: number;
  vatPeriodId?: string;
  vatBusinessType?: VatBusinessType;
  fyEndMonth?: number;
  corpPhase?: CorpNoticePhase;
  officialKind?: OfficialLetterKind | null;
}): OfficialLetterVars {
  const { deadline, materialDeadlineLine, manager, companyName, year, vatPeriodId } = opts;
  const vatBusinessType = opts.vatBusinessType ?? 'individual';
  const kind = opts.officialKind ?? 'vat';
  const vatPeriod = VAT_PERIODS.find(p => p.id === vatPeriodId);
  const materialShort = materialDeadlineLine
    ? materialDeadlineLine.replace(/^자료 제출 마감:\s*/i, '').split(/\s+\d{1,2}:\d{2}/)[0]?.trim() ||
      materialDeadlineLine
    : '';
  const dueShort = deadline?.finalText ?? '';
  const periodLabel = deadline?.periodLabel ?? '';
  const vatShort = vatPeriod?.shortLabel ?? '';
  const coveragePeriod = formatVatCoveragePeriod(year, vatPeriodId) || '{신고대상기간}';

  let subject = '{제목}';
  let filingParagraph = '{신고기한문단}';
  let periodNoteLine = '{공문기간안내}';

  if (kind === 'vat') {
    const noticeOnly = isVatPreliminaryNotice(vatPeriodId);
    subject = noticeOnly
      ? `${year}년 ${vatShort || '예정고지'} 납부 안내의 건`
      : periodLabel
        ? `${periodLabel} 부가가치세 신고 자료안내의 건`
        : subject;
    filingParagraph = noticeOnly
      ? dueShort
        ? `안녕하세요. 부가세 예정고지는 확정신고 전에 세무서에서 미리 알려 준 세액을 납부하실 차례입니다. 납부기한은 ${dueShort}입니다.`
        : '안녕하세요. 부가세 예정고지는 확정신고 전에 세무서에서 미리 알려 준 세액을 납부하실 차례입니다.'
      : periodLabel && vatShort && dueShort
        ? `${year}년도 부가가치세 ${vatShort}신고 및 납부기한은 ${dueShort}입니다.`
        : filingParagraph;
    periodNoteLine = noticeOnly
      ? `고지 대상 기간 : ${coveragePeriod}`
      : `신고대상 기간 : ${coveragePeriod}`;
  } else if (kind === 'income') {
    subject = `${year}년 귀속 종합소득세 신고 자료안내의 건`;
    filingParagraph = dueShort
      ? `${year}년 귀속 종합소득세 신고 및 납부기한은 ${dueShort}입니다.`
      : filingParagraph;
    periodNoteLine = `귀속 연도 : ${year}년`;
  } else if (kind === 'corporate') {
    const fy = opts.fyEndMonth ?? 12;
    const interim = opts.corpPhase === '중간예납';
    const cov =
      deadline?.coverage?.replace(/^(사업연도|중간예납기간)\s*/, '') ||
      `${year}.1.1~${year}.12.31`;
    if (interim) {
      subject = `${year}년 법인세 중간예납 자료안내의 건`;
      filingParagraph = dueShort
        ? `안녕하세요. 법인세 중간예납은 사업연도 전반기 실적에 대해 세액을 미리 납부하실 차례입니다. 납부기한은 ${dueShort}입니다.`
        : '안녕하세요. 법인세 중간예납은 사업연도 전반기 실적에 대해 세액을 미리 납부하실 차례입니다.';
      periodNoteLine = `중간예납기간 : ${cov}`;
    } else {
      subject = `${year}년 ${fy}월 결산 법인세 신고 자료안내의 건`;
      filingParagraph = dueShort
        ? `회계기간이 ${cov}인 법인은 법인세 결산 신고 및 납부기한은 ${dueShort}입니다.`
        : `회계기간이 ${cov}인 법인은 법인세 결산 신고를 하셔야 합니다.`;
      periodNoteLine = `회계기간 : ${cov}`;
    }
  }

  return {
    attributionYear: String(year),
    periodLabel,
    materialDeadlineShort: materialShort || '{자료제출마감일}',
    taxDueShort: dueShort || '{세금납부기한}',
    managerEmail: manager?.email ?? '{담당자메일}',
    companyName: companyName?.trim() || '',
    documentNumber: `${year}-001`,
    letterDate: formatLetterDate(),
    subject,
    filingParagraph,
    materialSubmitSentence: materialShort
      ? `${materialShort}까지 우편 또는 이메일 등으로 제출해주시기 바랍니다.`
      : '{자료제출마감문장}',
    coveragePeriod,
    periodNoteLine,
    vatBusinessType,
    vatFormalBodyHtml: buildVatFormalBody(vatBusinessType),
    vatPrepCommonRows: buildVatPrepCommonRows(vatBusinessType),
    vatPrepIndustryRows: buildVatPrepIndustryRows(),
    corporateFormalBodyHtml: buildCorporateFormalBody(),
  };
}

export function normalizeOfficialLetterHtml(html: string): string {
  let out = html;
  for (const c of ALL_MANAGER_CONTACTS) {
    out = out.split(c.email).join('{담당자메일}');
  }
  return out;
}

export function applyOfficialLetterVars(html: string, vars: OfficialLetterVars): string {
  const nextYear = String(Number(vars.attributionYear) + 1 || vars.attributionYear);
  const map: Record<string, string> = {
    '{귀속연도}': vars.attributionYear,
    '{귀속다음연도}': nextYear,
    '{과세기간}': vars.periodLabel,
    '{자료제출마감일}': vars.materialDeadlineShort,
    '{세금납부기한}': vars.taxDueShort,
    '{담당자메일}': vars.managerEmail,
    '{업체명}': vars.companyName,
    '{문서번호}': vars.documentNumber,
    '{공문일자}': vars.letterDate,
    '{제목}': vars.subject,
    '{신고기한문단}': vars.filingParagraph,
    '{자료제출마감문장}': vars.materialSubmitSentence,
    '{신고대상기간}': vars.coveragePeriod,
    '{공문기간안내}': vars.periodNoteLine,
    '{부가세공문본문}': vars.vatFormalBodyHtml,
    '{부가세공통항목표}': vars.vatPrepCommonRows,
    '{부가세업종항목표}': vars.vatPrepIndustryRows,
    '{법인세공문본문}': vars.corporateFormalBodyHtml,
  };
  let out = html;
  for (let pass = 0; pass < 3; pass++) {
    for (const [token, value] of Object.entries(map)) {
      if (value) out = out.split(token).join(value);
    }
  }
  return out;
}

export type { VatBusinessType } from './vatBusinessItems';
