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
};

export const CHECKLIST_LABEL_FULL: Record<string, string> = CHECKLIST_LABEL;

export function checklistDone(checklist: Record<string, boolean | string | string[] | Record<string, unknown>> | undefined) {
  return CHECKLIST_KEYS.filter(k => Boolean(checklist?.[k])).length;
}

export function progressPct(checklist: Record<string, boolean | string | string[] | Record<string, unknown>> | undefined) {
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
  excelKey?: string;
};

export type ProcessRow = {
  id: string;
  clientId: string | null;
  companyName: string;
  feeStartDate: string;
  monthlyFee: number | null;
  channel: string;
  checklist: Record<string, boolean | string | string[] | Record<string, unknown>>;
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

function appendBlueholeLine(lines: string[], label: string, value: string | number | null | undefined): void {
  const v = value == null ? '' : String(value).trim();
  if (!v) return;
  lines.push(`${label}: ${v}`);
}

/** 블루홀 수동 등록 시 붙여넣기용 텍스트 */
export function buildBlueholeRegisterText(inquiry: InquiryRow, process?: ProcessRow | null): string {
  const lines: string[] = [];
  const monthlyFee = process?.monthlyFee ?? inquiry.proposedFee;

  appendBlueholeLine(lines, '상호', process?.companyName || inquiry.companyName);
  appendBlueholeLine(lines, '대표', inquiry.representative);
  appendBlueholeLine(lines, '사업자번호', inquiry.businessNo);
  appendBlueholeLine(lines, '업종', inquiry.industry);
  appendBlueholeLine(lines, '주소', inquiry.address);
  appendBlueholeLine(lines, '연락처', inquiry.phone);
  appendBlueholeLine(lines, '대표 연락처', inquiryRepPhone(inquiry.extra));
  appendBlueholeLine(lines, '관리자', inquiryAdmin(inquiry.extra));
  appendBlueholeLine(lines, '관리자 연락처', inquiryAdminPhone(inquiry.extra));
  appendBlueholeLine(lines, '이메일', inquiryEmail(inquiry.extra));
  appendBlueholeLine(lines, '유입 채널', process?.channel || inquiry.channel);
  appendBlueholeLine(lines, '상담자', inquiry.consultant);
  appendBlueholeLine(lines, '문의일', inquiry.inquiryDate);
  if (monthlyFee != null && Number.isFinite(monthlyFee)) {
    appendBlueholeLine(lines, '월 수수료', `${monthlyFee.toLocaleString('ko-KR')}원`);
  }
  appendBlueholeLine(lines, '수임 시작일', process?.feeStartDate);
  appendBlueholeLine(lines, '문의·상담 내용', inquiry.inquiryContent);
  appendBlueholeLine(lines, '비고', inquiryNote(inquiry.extra));

  return lines.join('\n');
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

/** (주)·㈜·주식회사 등 법인 접두어 제거 후 핵심 상호 */
export function coreCompanyKey(name: string): string {
  let s = name.trim().normalize('NFKC').replace(/\s+/g, '');
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s
      .replace(/^\(주\)/i, '')
      .replace(/^㈜/, '')
      .replace(/^주식회사/i, '')
      .replace(/^\(유\)/i, '')
      .replace(/^유한회사/i, '')
      .replace(/^\(사\)/i, '')
      .replace(/^사\(/i, '');
  }
  return s.toLowerCase();
}

/** 엑셀 import excel_key 에서 상호 추출 */
export function companyNameFromExcelKey(excelKey?: string): string | null {
  if (!excelKey) return null;
  const m = excelKey.match(/^(?:inquiry|process)\|\|(?:\d+\|\|)?(.+)$/);
  return m?.[1]?.trim() || null;
}

/** 전덕삼(전포) → 전덕삼전포 등 괄호 병합 변형 */
function parentheticalVariants(name: string): string[] {
  const normalized = name.trim().normalize('NFKC').replace(/\s+/g, '');
  const m = normalized.match(/^(.*?)\(([^)]+)\)(.*)$/);
  if (!m) return [];
  return [m[1] + m[2] + m[3], m[1] + m[3]];
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function keysSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 4) return false;
  const dist = editDistance(a, b);
  if (dist <= 1) return true;
  if (dist <= 2 && Math.max(a.length, b.length) >= 10) return true;
  const maxLen = Math.max(a.length, b.length);
  return (1 - dist / maxLen) >= 0.9;
}

export function intakeMergeKey(name: string): string {
  return coreCompanyKey(name) || normalizeCompanyKey(name);
}

function collectCompanyKeys(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed || trimmed === '(미입력)') return [];

  const keys = new Set<string>();
  const add = (s: string) => {
    const norm = normalizeCompanyKey(s);
    if (norm && norm !== '(미입력)') keys.add(norm);
    const core = coreCompanyKey(s);
    if (core && core !== '(미입력)') keys.add(core);
  };

  add(trimmed);
  add(trimmed.split(',')[0] ?? '');
  const noParen = trimmed.replace(/\([^)]*\)/g, '');
  add(noParen);
  for (const variant of parentheticalVariants(trimmed)) add(variant);

  return [...keys];
}

export function allCompanyMatchKeys(companyName: string, excelKey?: string): string[] {
  const keys = new Set<string>();
  for (const name of [companyName, companyNameFromExcelKey(excelKey)].filter(Boolean) as string[]) {
    for (const k of collectCompanyKeys(name)) keys.add(k);
  }
  return [...keys];
}

function keysOverlap(keysA: string[], keysB: string[]): boolean {
  if (!keysA.length || !keysB.length) return false;
  if (keysA.some(a => keysB.includes(a))) return true;
  for (const a of keysA) {
    for (const b of keysB) {
      if (keysSimilar(a, b)) return true;
      if (a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a))) return true;
    }
  }
  return false;
}

export function companyNamesMatch(a: string, b: string): boolean {
  return keysOverlap(collectCompanyKeys(a), collectCompanyKeys(b));
}

/** 문의 상호에서 프로세스 매칭용 후보 키 (쉼표·괄호·법인 접두어 변형) */
export function companyMatchKeys(name: string): string[] {
  return collectCompanyKeys(name);
}

export type ClientNameRef = { id: string; companyName: string };

export function resolveClientIdByName(
  companyName: string,
  clients: ClientNameRef[],
  excelKey?: string,
): string | null {
  const keys = allCompanyMatchKeys(companyName, excelKey);
  if (!keys.length) return null;
  for (const c of clients) {
    if (keysOverlap(keys, allCompanyMatchKeys(c.companyName))) return c.id;
  }
  return null;
}

export function extraNamesFromClients(
  companyName: string,
  clients: ClientNameRef[],
  excelKey?: string,
): string[] {
  const id = resolveClientIdByName(companyName, clients, excelKey);
  if (!id) return [];
  return clients.filter(c => c.id === id).map(c => c.companyName);
}

export function findProcessForInquiry(
  inquiry: InquiryRow,
  processes: ProcessRow[],
  clients: ClientNameRef[] = [],
): ProcessRow | null {
  const candidates = new Map<string, ProcessRow>();

  if (inquiry.excelKey?.startsWith('from-process||')) {
    const processKey = inquiry.excelKey.slice('from-process||'.length);
    for (const p of processes) {
      if (p.excelKey === processKey) candidates.set(p.id, p);
    }
  }
  if (typeof inquiry.extra?.processExcelKey === 'string' && inquiry.extra.processExcelKey.trim()) {
    const processKey = inquiry.extra.processExcelKey.trim();
    for (const p of processes) {
      if (p.excelKey === processKey) candidates.set(p.id, p);
    }
  }

  const consultId = typeof inquiry.extra?.consultationId === 'string'
    ? inquiry.extra.consultationId.trim()
    : '';
  if (consultId) {
    for (const p of processes) {
      if (p.excelKey === `portal||consult||${consultId}||process`) {
        candidates.set(p.id, p);
      }
    }
  }
  const inquiryConsultFromKey = inquiry.excelKey?.match(/^portal\|\|consult\|\|([^|]+)\|\|inquiry$/);
  if (inquiryConsultFromKey) {
    const cid = inquiryConsultFromKey[1];
    for (const p of processes) {
      if (p.excelKey === `portal||consult||${cid}||process`) {
        candidates.set(p.id, p);
      }
    }
  }

  const clientId = inquiry.clientId
    ?? resolveClientIdByName(inquiry.companyName, clients, inquiry.excelKey);
  if (clientId) {
    for (const p of processes) {
      if (p.clientId === clientId) candidates.set(p.id, p);
      const pClientId: string | null = p.clientId
        ?? resolveClientIdByName(p.companyName, clients, p.excelKey);
      if (pClientId === clientId) candidates.set(p.id, p);
    }
  }

  const clientNames = clientId
    ? clients.filter(c => c.id === clientId).map(c => c.companyName)
    : extraNamesFromClients(inquiry.companyName, clients, inquiry.excelKey);

  const inqKeys = [
    ...allCompanyMatchKeys(inquiry.companyName, inquiry.excelKey),
    ...clientNames.flatMap(n => allCompanyMatchKeys(n)),
  ];
  if (inqKeys.length) {
    for (const p of processes) {
      const pKeys = allCompanyMatchKeys(p.companyName, p.excelKey);
      if (keysOverlap(inqKeys, pKeys)) candidates.set(p.id, p);
    }
  }

  const list = [...candidates.values()];
  if (!list.length) return null;
  return list.sort((a, b) => {
    const diff = processMatchScore(b) - processMatchScore(a);
    return diff !== 0 ? diff : b.updatedAt.localeCompare(a.updatedAt);
  })[0];
}

export function inquiryExcelKeyFromProcess(processExcelKey: string): string {
  return `from-process||${processExcelKey}`;
}

export function findInquiryForProcess(
  process: ProcessRow,
  inquiries: InquiryRow[],
  extraCompanyNames: string[] = [],
  clients: ClientNameRef[] = [],
): InquiryRow | null {
  const candidates = new Map<string, InquiryRow>();

  if (process.excelKey) {
    const linkedKey = inquiryExcelKeyFromProcess(process.excelKey);
    for (const i of inquiries) {
      if (i.excelKey === linkedKey) candidates.set(i.id, i);
      if (i.extra?.fromProcess === true && i.extra?.processExcelKey === process.excelKey) {
        candidates.set(i.id, i);
      }
    }
  }

  const consultFromKey = process.excelKey?.match(/^portal\|\|consult\|\|([^|]+)\|\|process$/);
  if (consultFromKey) {
    const consultId = consultFromKey[1];
    for (const i of inquiries) {
      if (i.excelKey === `portal||consult||${consultId}||inquiry`) {
        candidates.set(i.id, i);
      }
      if (typeof i.extra?.consultationId === 'string' && i.extra.consultationId.trim() === consultId) {
        candidates.set(i.id, i);
      }
    }
  }

  const clientId = process.clientId
    ?? resolveClientIdByName(process.companyName, clients, process.excelKey);
  if (clientId) {
    for (const i of inquiries) {
      if (i.clientId === clientId) candidates.set(i.id, i);
    }
  }

  const clientNames = clientId
    ? clients.filter(c => c.id === clientId).map(c => c.companyName)
    : extraNamesFromClients(process.companyName, clients, process.excelKey);

  const processNames = [
    process.companyName,
    companyNameFromExcelKey(process.excelKey),
    ...extraCompanyNames,
    ...clientNames,
  ].filter(Boolean) as string[];

  const procKeys = processNames.flatMap(n => allCompanyMatchKeys(n));
  if (procKeys.length) {
    for (const i of inquiries) {
      const inqKeys = allCompanyMatchKeys(i.companyName, i.excelKey);
      if (keysOverlap(inqKeys, procKeys)) candidates.set(i.id, i);
    }
  }

  const list = [...candidates.values()];
  if (!list.length) return null;
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function buildIntakeDeepLink(opts: {
  inquiryId?: string | null;
  processId?: string | null;
  companyName?: string;
}): string {
  const p = new URLSearchParams({ tab: 'intake' });
  if (opts.inquiryId) p.set('inquiry', opts.inquiryId);
  if (opts.processId) p.set('processId', opts.processId);
  const company = opts.companyName?.trim();
  if (company && !opts.inquiryId) p.set('q', company);
  return `/clients/intake?${p.toString()}`;
}

/** 유입관리 없이 프로세스만 있을 때 패널용 최소 inquiry */
export function stubInquiryFromProcess(process: ProcessRow): InquiryRow {
  return {
    id: '',
    clientId: process.clientId,
    companyName: process.companyName,
    phone: '',
    channel: process.channel,
    consultant: '',
    inquiryDate: process.feeStartDate,
    inquiryContent: '',
    contractStatus: '',
    proposedFee: process.monthlyFee,
    industry: '',
    businessNo: '',
    representative: '',
    address: '',
    extra: {},
    createdAt: process.updatedAt,
  };
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
    const key = intakeMergeKey(i.companyName);
    if (!key) continue;
    const prev = inqByKey.get(key);
    inqByKey.set(key, prev ? pickNewerInquiry(i, prev) : i);
  }

  const procByKey = new Map<string, ProcessRow>();
  for (const p of processes) {
    const key = intakeMergeKey(p.companyName);
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
