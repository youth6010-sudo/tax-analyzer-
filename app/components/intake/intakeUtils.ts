import { CHECKLIST_KEYS, BLUEHOLE_CODE_KEY } from '@/app/types/intake';
import { compareIntakeDateDesc, formatIntakeDate } from '@/app/utils/intakeDates';

export { CHECKLIST_KEYS, BLUEHOLE_CODE_KEY };

/** 유입프로세스 시트 컬럼명 (청년들 ID.xlsx) */
export const CHECKLIST_LABEL: Record<string, string> = {
  contractSent: '계약서 작성 및 전달',
  consent: '수임동의',
  cms: 'CMS 등록',
  assignee: '담당자 배정',
  programClient: '프로그램 거래처 생성',
  blueholeClient: '블루홀 거래처 등록',
  tpClient: 'TP 거래처 등록',
  semoReport: '위멤버스 및 세모리포트 등록',
  bizAccount: '사업용계좌 등록',
  kakaoRoom: '거래처 카톡방 생성',
};

export const CHECKLIST_LABEL_FULL: Record<string, string> = CHECKLIST_LABEL;

export function checklistDone(checklist: Record<string, boolean | string | Record<string, unknown>> | undefined) {
  return CHECKLIST_KEYS.filter(k => Boolean(checklist?.[k])).length;
}

export function progressPct(checklist: Record<string, boolean | string | Record<string, unknown>> | undefined) {
  return Math.round((checklistDone(checklist) / CHECKLIST_KEYS.length) * 100);
}

export type InquiryRow = {
  id: string;
  clientId: string | null;
  companyName: string;
  phone: string;
  channel: string;
  consultant: string;
  inquiryDate: string;
  inquiryContent: string;
  contractStatus: string;
  proposedFee: number | null;
  industry: string;
  businessNo: string;
  representative: string;
  address: string;
  extra: Record<string, unknown>;
  createdAt: string;
};

export type ProcessRow = {
  id: string;
  clientId: string | null;
  companyName: string;
  feeStartDate: string;
  monthlyFee: number | null;
  channel: string;
  checklist: Record<string, boolean | string | Record<string, unknown>>;
  excelKey?: string;
  updatedAt: string;
};

/** 유입관리 블루홀케이스가 있으면 엑셀과 동일하게 등록 완료로 간주 */
export function isBlueholeClientDone(
  checklist: ProcessRow['checklist'] | undefined,
  inquiryBluehole = '',
): boolean {
  if (Boolean(checklist?.blueholeClient) || Boolean(checklist?.bluehole)) return true;
  return Boolean(inquiryBluehole.trim());
}

export function isChecklistItemDone(
  key: string,
  checklist: ProcessRow['checklist'] | undefined,
  inquiryBluehole = '',
): boolean {
  if (key === 'blueholeClient') return isBlueholeClientDone(checklist, inquiryBluehole);
  return Boolean(checklist?.[key]);
}

function processMatchScore(p: ProcessRow): number {
  let score = checklistDone(p.checklist) * 10;
  if (p.excelKey?.startsWith('process||')) score += 200;
  return score;
}

function pickBetterProcess(a: ProcessRow, b: ProcessRow): ProcessRow {
  const sa = processMatchScore(a);
  const sb = processMatchScore(b);
  if (sa !== sb) return sa >= sb ? a : b;
  return a.updatedAt >= b.updatedAt ? a : b;
}

export function processBlueholeCode(
  checklist: Record<string, boolean | string | Record<string, unknown>> | undefined,
): string {
  const v = checklist?.[BLUEHOLE_CODE_KEY];
  return typeof v === 'string' ? v : '';
}

export function inquiryNote(extra: Record<string, unknown> | undefined): string {
  return typeof extra?.note === 'string' ? extra.note : '';
}

export function inquiryBlueholeCase(extra: Record<string, unknown> | undefined): string {
  return typeof extra?.blueholeCase === 'string' ? extra.blueholeCase : '';
}

export function inquiryRepPhone(extra: Record<string, unknown> | undefined): string {
  return typeof extra?.repPhone === 'string' ? extra.repPhone : '';
}

export function inquiryAdmin(extra: Record<string, unknown> | undefined): string {
  return typeof extra?.admin === 'string' ? extra.admin : '';
}

export function inquiryAdminPhone(extra: Record<string, unknown> | undefined): string {
  return typeof extra?.adminPhone === 'string' ? extra.adminPhone : '';
}

export function inquiryEmail(extra: Record<string, unknown> | undefined): string {
  return typeof extra?.email === 'string' ? extra.email : '';
}

export function inquiryFieldValue(row: InquiryRow, key: string): string {
  switch (key) {
    case 'inquiryDate': return formatIntakeDate(row.inquiryDate);
    case 'companyName': return row.companyName;
    case 'phone': return row.phone;
    case 'channel': return row.channel;
    case 'consultant': return row.consultant;
    case 'inquiryContent': return row.inquiryContent;
    case 'blueholeCase': return inquiryBlueholeCase(row.extra);
    case 'note': return inquiryNote(row.extra);
    case 'proposedFee': return row.proposedFee != null ? String(row.proposedFee) : '';
    case 'industry': return row.industry;
    case 'businessNo': return row.businessNo;
    case 'representative': return row.representative;
    case 'repPhone': return inquiryRepPhone(row.extra);
    case 'admin': return inquiryAdmin(row.extra);
    case 'adminPhone': return inquiryAdminPhone(row.extra);
    case 'address': return row.address;
    case 'email': return inquiryEmail(row.extra);
    case 'contractStatus': return row.contractStatus;
    default: return '';
  }
}

export function inquiryFormFields(extra: Record<string, unknown> | undefined): Record<string, unknown> | null {
  const form = extra?.form;
  return form && typeof form === 'object' && !Array.isArray(form)
    ? form as Record<string, unknown>
    : null;
}

export function hasInquiryDetail(q: InquiryRow): boolean {
  return Boolean(
    q.inquiryContent
    || inquiryNote(q.extra)
    || inquiryBlueholeCase(q.extra)
    || q.industry
    || q.representative
    || q.businessNo
    || q.contractStatus
    || inquiryFormFields(q.extra),
  );
}

export type IntakePair = {
  id: string;
  matchKey: string;
  companyName: string;
  clientId: string | null;
  inquiry?: InquiryRow;
  process?: ProcessRow;
  sortDate: string;
};

export type IntakeSort = 'name' | 'inquiryDate' | 'created';

function compareInquiryDateDesc(a: InquiryRow, b: InquiryRow): number {
  const cmp = compareIntakeDateDesc(a.inquiryDate, b.inquiryDate);
  if (cmp !== 0) return cmp;
  return b.createdAt.localeCompare(a.createdAt);
}

/** 상호 병합용 키 — 공백·대소문자 차이로 인한 중복 행 방지 */
export function normalizeCompanyKey(name: string): string {
  return name.trim().normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

/** 문의 상호에서 프로세스 매칭용 후보 키 (쉼표·괄호 변형) */
export function companyMatchKeys(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed || trimmed === '(미입력)') return [];

  const keys = new Set<string>();
  const add = (s: string) => {
    const k = normalizeCompanyKey(s);
    if (k && k !== '(미입력)') keys.add(k);
  };

  add(trimmed);
  add(trimmed.split(',')[0] ?? '');
  add(trimmed.replace(/\([^)]*\)/g, ''));

  return [...keys];
}

export function findProcessForInquiry(inquiry: InquiryRow, processes: ProcessRow[]): ProcessRow | null {
  const candidates = new Map<string, ProcessRow>();

  if (inquiry.clientId) {
    for (const p of processes) {
      if (p.clientId === inquiry.clientId) candidates.set(p.id, p);
    }
  }

  const inqKeys = companyMatchKeys(inquiry.companyName);
  if (inqKeys.length) {
    for (const p of processes) {
      const pKey = normalizeCompanyKey(p.companyName);
      if (!pKey) continue;
      if (inqKeys.includes(pKey)) {
        candidates.set(p.id, p);
        continue;
      }
      for (const ik of inqKeys) {
        if (ik.length >= 2 && (ik.includes(pKey) || pKey.includes(ik))) {
          candidates.set(p.id, p);
          break;
        }
      }
    }
  }

  const list = [...candidates.values()];
  if (!list.length) return null;
  return list.sort((a, b) => {
    const diff = processMatchScore(b) - processMatchScore(a);
    return diff !== 0 ? diff : b.updatedAt.localeCompare(a.updatedAt);
  })[0];
}

function pickNewerInquiry(a: InquiryRow, b: InquiryRow): InquiryRow {
  return a.createdAt >= b.createdAt ? a : b;
}

function pickNewerProcess(a: ProcessRow, b: ProcessRow): ProcessRow {
  return pickBetterProcess(a, b);
}

export function mergeIntakeRows(inquiries: InquiryRow[], processes: ProcessRow[]): IntakePair[] {
  const inqByKey = new Map<string, InquiryRow>();
  for (const i of inquiries) {
    const key = normalizeCompanyKey(i.companyName);
    if (!key) continue;
    const prev = inqByKey.get(key);
    inqByKey.set(key, prev ? pickNewerInquiry(i, prev) : i);
  }

  const procByKey = new Map<string, ProcessRow>();
  for (const p of processes) {
    const key = normalizeCompanyKey(p.companyName);
    if (!key) continue;
    const prev = procByKey.get(key);
    procByKey.set(key, prev ? pickNewerProcess(p, prev) : p);
  }

  const keys = new Set([...inqByKey.keys(), ...procByKey.keys()]);
  const pairs: IntakePair[] = [];

  for (const matchKey of keys) {
    const inquiry = inqByKey.get(matchKey);
    const process = procByKey.get(matchKey);
    const companyName = inquiry?.companyName ?? process?.companyName ?? '';
    const sortDate = inquiry?.inquiryDate.trim()
      || [inquiry?.createdAt, process?.updatedAt].filter(Boolean).sort().reverse()[0]
      || '';
    pairs.push({
      id: inquiry?.id ?? process?.id ?? matchKey,
      matchKey,
      companyName,
      clientId: inquiry?.clientId ?? process?.clientId ?? null,
      inquiry,
      process,
      sortDate,
    });
  }

  return pairs;
}

export function sortIntakePairs(pairs: IntakePair[], sort: IntakeSort): IntakePair[] {
  const copy = [...pairs];
  if (sort === 'name') {
    copy.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
  } else if (sort === 'created') {
    copy.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
  } else {
    copy.sort((a, b) => {
      const da = a.inquiry?.inquiryDate.trim() || a.sortDate;
      const db = b.inquiry?.inquiryDate.trim() || b.sortDate;
      return compareIntakeDateDesc(da, db);
    });
  }
  return copy;
}

export function sortInquiries(rows: InquiryRow[], sort: IntakeSort): InquiryRow[] {
  const copy = [...rows];
  if (sort === 'name') {
    copy.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
  } else if (sort === 'created') {
    copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } else {
    copy.sort(compareInquiryDateDesc);
  }
  return copy;
}

export function sortProcesses(rows: ProcessRow[], sort: IntakeSort): ProcessRow[] {
  const copy = [...rows];
  if (sort === 'name') {
    copy.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
  } else {
    copy.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return copy;
}

export function processRowFromApi(raw: Record<string, unknown>): ProcessRow {
  const pick = (camel: string, snake?: string): unknown => {
    if (raw[camel] !== undefined && raw[camel] !== null) return raw[camel];
    if (snake && raw[snake] !== undefined && raw[snake] !== null) return raw[snake];
    return undefined;
  };
  const updated = pick('updatedAt', 'updated_at');
  const rawChecklist = (pick('checklist') && typeof pick('checklist') === 'object'
    ? pick('checklist')
    : {}) as ProcessRow['checklist'];
  const checklist = { ...rawChecklist };
  if (checklist.bluehole && !checklist.blueholeClient) {
    checklist.blueholeClient = checklist.bluehole as boolean;
    delete checklist.bluehole;
  }
  return {
    id: String(pick('id') ?? ''),
    clientId: pick('clientId', 'client_id') != null ? String(pick('clientId', 'client_id')) : null,
    companyName: String(pick('companyName', 'company_name') ?? ''),
    feeStartDate: String(pick('feeStartDate', 'fee_start_date') ?? ''),
    monthlyFee: typeof pick('monthlyFee', 'monthly_fee') === 'number'
      ? (pick('monthlyFee', 'monthly_fee') as number)
      : null,
    channel: String(pick('channel') ?? ''),
    checklist,
    excelKey: pick('excelKey', 'excel_key') != null ? String(pick('excelKey', 'excel_key')) : undefined,
    updatedAt: updated instanceof Date ? updated.toISOString() : String(updated ?? ''),
  };
}
