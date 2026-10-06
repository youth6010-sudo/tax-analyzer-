import { inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries } from '@/db/schema';
import { getAppConfig, setAppConfig } from '@/lib/appConfigDb';
import { managerNamesMatch } from '@/app/utils/managerMatch';
import {
  BOND_ATTACHMENT_STEPS,
  BOND_NOTICE_VERSIONS,
  BOND_STAFF_CONTACTS,
  DEFAULT_BOND_CONTACT,
  isLockedBondAttachment,
  type BondAttachment,
  type BondAttachmentStepKey,
  type BondChangeLogEntry,
  type BondContact,
  type BondDocLogEntry,
  type BondNotice,
  type BondNoticeDefaults,
  type BondNoticeDefaultsLogEntry,
  type BondNoticeVersion,
  type BondRecipient,
  type BondRecordPatch,
  type BondStoredRecord,
} from '@/app/types/bond';

const KEY = 'bond_mgmt';

type BondDoc = {
  records: Record<string, BondStoredRecord>;
  contact?: BondContact;
  /** 연도별 마지막으로 쓴 해임통보 문서번호 일련번호 (PDF 만들 때마다 갱신) */
  docSeq?: Record<string, number>;
  docLog?: BondDocLogEntry[];
  noticeDefaults?: BondNoticeDefaults;
  noticeDefaultsLog?: BondNoticeDefaultsLogEntry[];
  changeLog?: BondChangeLogEntry[];
};

const DOC_LOG_MAX = 3000;
const CHANGE_LOG_MAX = 5000;

const dateText = (d: string | undefined) => d || '(없음)';

/** 저장 전후를 비교해 단계별 변경 이력 줄 생성 */
function diffRecord(
  before: BondStoredRecord | undefined,
  after: BondStoredRecord,
  meta: { at: string; by: string; entryId: string },
): BondChangeLogEntry[] {
  const out: BondChangeLogEntry[] = [];
  const push = (step: BondChangeLogEntry['step'], action: string, detail: string) =>
    out.push({ ...meta, step, action, detail });
  for (const step of ['내용증명', '지급명령'] as const) {
    const a = before?.[step];
    const b = after[step];
    if (!b) continue;
    if (!!a?.checked !== b.checked) push(step, b.checked ? '체크' : '체크 해제', '');
    if ((a?.date ?? '') !== b.date) push(step, '날짜 변경', `${dateText(a?.date)} → ${dateText(b.date)}`);
  }
  if (after.해임통보 && (before?.해임통보?.date ?? '') !== after.해임통보.date) {
    push('해임통보', '날짜 변경', `${dateText(before?.해임통보?.date)} → ${dateText(after.해임통보.date)}`);
  }
  const prevNotices = before?.해임통보?.notices?.length ?? 0;
  for (const n of after.해임통보?.notices?.slice(prevNotices) ?? []) {
    push('해임통보', '안내문 발송 기록', `${n.docNo} · v.${n.version} · 발송 ${n.sentDate} · 기한 ${n.deadline}`);
  }
  if (after.회수일정 !== undefined && (before?.회수일정 ?? '') !== after.회수일정) {
    push('회수일정', '메모 변경', `${before?.회수일정 || '(없음)'} → ${after.회수일정 || '(없음)'}`);
  }
  return out;
}

function appendChangeLog(doc: BondDoc, entries: BondChangeLogEntry[]) {
  if (entries.length) doc.changeLog = [...(doc.changeLog ?? []), ...entries].slice(-CHANGE_LOG_MAX);
}

/** 변경 이력 — 최신순 */
export async function readBondChangeLog(): Promise<BondChangeLogEntry[]> {
  return [...((await readDoc()).changeLog ?? [])].reverse();
}
const NOTICE_DEFAULTS_LOG_MAX = 200;

const DATE_RE = /^(\d{4}-\d{2}-\d{2})?$/;
const DOC_NO_RE = /^청년들-부산-추심-(\d{4})-(\d+)호$/;

async function readDoc(): Promise<BondDoc> {
  const doc = await getAppConfig<BondDoc>(KEY);
  return { ...doc, records: doc?.records ?? {} };
}

async function writeDoc(doc: BondDoc): Promise<void> {
  await setAppConfig(KEY, doc as unknown as Record<string, unknown>);
}

export async function readBondRecords(): Promise<Record<string, BondStoredRecord>> {
  return (await readDoc()).records;
}

function sanitizeRecipient(v: unknown): BondRecipient {
  const r = (v ?? {}) as Record<string, unknown>;
  const s = (x: unknown, max = 300) => String(x ?? '').trim().slice(0, max);
  const 구분 = s(r.구분);
  return {
    상호: s(r.상호, 200),
    구분: 구분 === '법인' || 구분 === '개인' ? 구분 : '',
    등록번호: s(r.등록번호, 40),
    사업장주소: s(r.사업장주소),
    실제주소: s(r.실제주소),
  };
}

function sanitizeContact(v: unknown): BondContact {
  const r = (v ?? {}) as Record<string, unknown>;
  const s = (x: unknown) => String(x ?? '').trim().slice(0, 120);
  return { 담당: s(r.담당), 전화: s(r.전화), 이메일: s(r.이메일) };
}

function sanitizeNotice(v: unknown): BondNotice | null {
  const r = (v ?? {}) as Record<string, unknown>;
  const version = r.version as BondNoticeVersion;
  if (!BOND_NOTICE_VERSIONS.includes(version)) return null;
  const d = (x: unknown) => {
    const s = String(x ?? '');
    return DATE_RE.test(s) ? s : '';
  };
  const contact = r.contact === undefined ? null : sanitizeContact(r.contact);
  return {
    version,
    docNo: String(r.docNo ?? '').trim().slice(0, 60),
    sentDate: d(r.sentDate),
    deadline: d(r.deadline),
    ...(contact && (contact.담당 || contact.전화 || contact.이메일) ? { contact } : {}),
    ...noticeBody(r),
  };
}

/** 안내문 본문 값 (수정 때 다시 불러옴) */
function noticeBody(r: Record<string, unknown>): Pick<BondNotice, 'recipientName' | 'period' | 'amount'> {
  const out: Pick<BondNotice, 'recipientName' | 'period' | 'amount'> = {};
  if (typeof r.recipientName === 'string' && r.recipientName.trim()) out.recipientName = r.recipientName.trim().slice(0, 200);
  if (typeof r.period === 'string' && r.period.trim()) out.period = r.period.trim().slice(0, 60);
  const amount = Number(r.amount);
  if (Number.isFinite(amount) && amount > 0) out.amount = Math.round(amount);
  return out;
}

/** 이미 발급한 해임통보 안내문 수정 — 같은 문서번호의 발송 기록·발급 대장을 갱신하고 수정일 기록 */
export async function editBondNotice(
  v: unknown,
  user: { name: string },
  canManage: boolean,
): Promise<Record<string, BondStoredRecord>> {
  const r = (v ?? {}) as Record<string, unknown>;
  const entryId = String(r.entryId ?? '');
  const docNo = String(r.docNo ?? '').trim();
  const reason = String(r.reason ?? '').trim().slice(0, 500);
  if (!entryId || !docNo) throw new Error('BAD_EDIT');
  if (!reason) throw new Error('NO_REASON');
  await assertCanEdit([entryId], user, canManage);
  const doc = await readDoc();
  const rec = doc.records[entryId];
  const notices = rec?.해임통보?.notices ?? [];
  const idx = notices.findIndex(n => n.docNo === docNo);
  let logIdx = -1;
  (doc.docLog ?? []).forEach((l, i) => {
    if (l.docNo === docNo && l.entryId === entryId) logIdx = i;
  });
  if (idx < 0 && logIdx < 0) throw new Error('NOTICE_NOT_FOUND');
  const base = idx >= 0 ? notices[idx]! : doc.docLog![logIdx]!;
  const next = sanitizeNotice({ ...base, ...r, version: base.version, docNo });
  if (!next) throw new Error('BAD_EDIT');
  const at = new Date().toISOString();
  const stamped = { ...next, modifiedAt: at, modifiedBy: user.name, modifyReason: reason };
  if (rec && idx >= 0) {
    const list = [...notices];
    list[idx] = stamped;
    rec.해임통보 = { date: rec.해임통보?.date ?? '', ...rec.해임통보, notices: list };
  }
  if (logIdx >= 0) {
    const log = [...doc.docLog!];
    log[logIdx] = { ...log[logIdx]!, ...stamped };
    doc.docLog = log;
  }
  appendChangeLog(doc, [
    {
      at,
      by: user.name,
      entryId,
      step: '해임통보',
      action: '안내문 수정',
      detail: `사유: ${reason}\n${docNo} · 발송 ${next.sentDate} · 기한 ${next.deadline}${next.amount ? ` · ${next.amount.toLocaleString('ko-KR')}원` : ''}`,
    },
  ]);
  await writeDoc(doc);
  return doc.records;
}

function sanitizePatch(patch: BondRecordPatch): BondRecordPatch {
  const out: BondRecordPatch = {};
  const step = (v: unknown) => {
    const s = v as { checked?: unknown; date?: unknown };
    const date = String(s?.date ?? '');
    return { checked: s?.checked === true, date: DATE_RE.test(date) ? date : '' };
  };
  if (patch.내용증명) out.내용증명 = step(patch.내용증명);
  if (patch.지급명령) out.지급명령 = step(patch.지급명령);
  if (patch.해임통보) {
    const date = String(patch.해임통보.date ?? '');
    out.해임통보 = { date: DATE_RE.test(date) ? date : '' };
  }
  if (patch.회수일정 !== undefined) out.회수일정 = String(patch.회수일정).slice(0, 2000);
  if (patch.recipient) out.recipient = sanitizeRecipient(patch.recipient);
  return out;
}

/** 해임통보는 날짜만 바꾸고 발송 기록(notices)은 보존 */
function applyPatch(rec: BondStoredRecord | undefined, patch: BondRecordPatch): BondStoredRecord {
  const clean = sanitizePatch(patch);
  const next: BondStoredRecord = { ...rec, ...clean };
  if (clean.해임통보) next.해임통보 = { ...rec?.해임통보, date: clean.해임통보.date };
  return next;
}

/** 담당자 본인 업체 또는 미수 관리권한자만 수정 */
async function assertCanEdit(ids: string[], user: { name: string }, canManage: boolean): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: arrearsEntries.id, managerName: arrearsEntries.managerName })
    .from(arrearsEntries)
    .where(inArray(arrearsEntries.id, ids));
  const managerById = new Map(rows.map(r => [r.id, r.managerName ?? '']));
  for (const id of ids) {
    if (!managerById.has(id)) throw new Error('NOT_FOUND');
    if (!canManage && !managerNamesMatch(managerById.get(id)!, user.name)) {
      throw new Error('FORBIDDEN');
    }
  }
}

/** 사용한 문서번호를 연도별 카운터에 반영 — 다음 번호는 그보다 1 큰 수 */
function consumeDocNo(doc: BondDoc, docNo: unknown): void {
  const m = DOC_NO_RE.exec(String(docNo ?? '').trim());
  if (!m) return;
  const year = m[1]!;
  const seq = Number(m[2]);
  doc.docSeq = { ...doc.docSeq, [year]: Math.max(doc.docSeq?.[year] ?? 0, seq) };
}

export async function updateBondRecords(
  updates: Array<{ id: string; patch: BondRecordPatch; appendNotice?: unknown }>,
  user: { name: string },
  canManage: boolean,
  contact?: unknown,
  usedDocNo?: unknown,
  issue?: unknown,
): Promise<Record<string, BondStoredRecord>> {
  const ids = [...new Set(updates.map(u => u.id).filter(Boolean))];
  if (!ids.length && contact === undefined && usedDocNo === undefined) return readBondRecords();
  if (ids.length) await assertCanEdit(ids, user, canManage);

  const doc = await readDoc();
  if (usedDocNo !== undefined) consumeDocNo(doc, usedDocNo);
  let saved = false;
  const at = new Date().toISOString();
  for (const { id, patch, appendNotice } of updates) {
    const prev = doc.records[id];
    const rec = applyPatch(prev, patch);
    const notice = appendNotice === undefined ? null : sanitizeNotice(appendNotice);
    if (notice) {
      saved = true;
      consumeDocNo(doc, notice.docNo);
      rec.해임통보 = {
        date: rec.해임통보?.date ?? '',
        notices: [...(rec.해임통보?.notices ?? []), notice],
      };
    }
    appendChangeLog(doc, diffRecord(prev, rec, { at, by: user.name, entryId: id }));
    doc.records[id] = rec;
  }
  if (contact !== undefined) doc.contact = sanitizeContact(contact);
  const logEntry = usedDocNo !== undefined && issue !== undefined ? sanitizeIssue(issue, usedDocNo) : null;
  if (logEntry) {
    doc.docLog = [
      ...(doc.docLog ?? []),
      { ...logEntry, saved, issuedAt: new Date().toISOString(), issuedBy: user.name },
    ].slice(-DOC_LOG_MAX);
  }
  await writeDoc(doc);
  return doc.records;
}

function sanitizeIssue(v: unknown, docNo: unknown): Omit<BondDocLogEntry, 'saved' | 'issuedAt' | 'issuedBy'> | null {
  const r = (v ?? {}) as Record<string, unknown>;
  const notice = sanitizeNotice({ ...r, docNo });
  if (!notice?.docNo) return null;
  return {
    ...notice,
    entryId: String(r.entryId ?? '').slice(0, 80),
    companyName: String(r.companyName ?? '').trim().slice(0, 200),
  };
}

/** 발급 대장 — 문서번호 순 */
export async function readBondDocLog(): Promise<BondDocLogEntry[]> {
  const log = (await readDoc()).docLog ?? [];
  return [...log].sort((a, b) => a.docNo.localeCompare(b.docNo) || a.issuedAt.localeCompare(b.issuedAt));
}

export async function readBondContact(): Promise<BondContact> {
  const c = (await readDoc()).contact;
  return c && (c.담당 || c.전화 || c.이메일) ? c : DEFAULT_BOND_CONTACT;
}

/** 담당 선택 목록 — 기본값 + 직원 목록 + 발송 기록에 직접 입력해 쓴 담당 (중복 제거) */
export function listBondContacts(records: Record<string, BondStoredRecord>, current: BondContact): BondContact[] {
  const used = Object.values(records)
    .flatMap(r => r.해임통보?.notices ?? [])
    .filter(n => n.contact)
    .sort((a, b) => b.sentDate.localeCompare(a.sentDate))
    .map(n => n.contact!);
  const seen = new Set<string>();
  return [current, ...BOND_STAFF_CONTACTS, ...used].filter(c => {
    const key = `${c.담당}|${c.전화}|${c.이메일}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function readBondNoticeDefaults(): Promise<BondNoticeDefaults> {
  const v = (await readDoc()).noticeDefaults;
  return {
    sentDate: v?.sentDate ?? '',
    deadline: v?.deadline ?? '',
    ...(v?.savedBy ? { savedBy: v.savedBy } : {}),
    ...(v?.savedAt ? { savedAt: v.savedAt } : {}),
  };
}

export async function writeBondNoticeDefaults(v: unknown, user: { name: string }): Promise<void> {
  const r = (v ?? {}) as Record<string, unknown>;
  const d = (x: unknown) => {
    const s = String(x ?? '');
    return DATE_RE.test(s) ? s : '';
  };
  const doc = await readDoc();
  const entry: BondNoticeDefaultsLogEntry = {
    sentDate: d(r.sentDate),
    deadline: d(r.deadline),
    savedBy: user.name,
    savedAt: new Date().toISOString(),
  };
  doc.noticeDefaults = { ...entry };
  doc.noticeDefaultsLog = [...(doc.noticeDefaultsLog ?? []), entry].slice(-NOTICE_DEFAULTS_LOG_MAX);
  await writeDoc(doc);
}

/** 일괄 날짜 저장 이력 — 최신순 */
export async function readBondNoticeDefaultsLog(): Promise<BondNoticeDefaultsLogEntry[]> {
  const doc = await readDoc();
  const log = doc.noticeDefaultsLog ?? [];
  const cur = doc.noticeDefaults;
  /** 이력 기능 이전에 저장된 값은 현재값 1건으로 보여 줌 */
  const seeded =
    !log.length && cur?.savedAt
      ? [{ sentDate: cur.sentDate, deadline: cur.deadline, savedBy: cur.savedBy ?? '', savedAt: cur.savedAt }]
      : log;
  return [...seeded].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function readBondDocSeq(): Promise<Record<string, number>> {
  return (await readDoc()).docSeq ?? {};
}

function noticeSeq(records: Record<string, BondStoredRecord>, year: number, docSeq: Record<string, number>): number {
  let max = docSeq[String(year)] ?? 0;
  for (const rec of Object.values(records)) {
    for (const n of rec.해임통보?.notices ?? []) {
      const m = DOC_NO_RE.exec(n.docNo);
      if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
    }
  }
  return max;
}

const formatDocNo = (year: number, seq: number) => `청년들-부산-추심-${year}-${String(seq).padStart(3, '0')}호`;

/** 청년들-부산-추심-YYYY-NNN호 — 해당 연도 카운터·발송 기록 중 최대 번호 + 1 (해가 바뀌면 001부터) */
export function nextNoticeDocNo(
  records: Record<string, BondStoredRecord>,
  year: number,
  docSeq: Record<string, number> = {},
): string {
  return formatDocNo(year, noticeSeq(records, year, docSeq) + 1);
}

/** 새 안내문 문서번호 확보 — 저장 직전에 서버에서 번호를 올려 동시 발급 시 중복 방지 */
export async function reserveBondDocNo(id: string, user: { name: string }, canManage: boolean): Promise<string> {
  await assertCanEdit([id], user, canManage);
  const year = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }));
  const doc = await readDoc();
  let seq = noticeSeq(doc.records, year, doc.docSeq ?? {});
  for (const l of doc.docLog ?? []) {
    const m = DOC_NO_RE.exec(l.docNo);
    if (m && Number(m[1]) === year) seq = Math.max(seq, Number(m[2]));
  }
  const docNo = formatDocNo(year, seq + 1);
  consumeDocNo(doc, docNo);
  await writeDoc(doc);
  return docNo;
}

/** 문서번호 선택 목록 — 다음 번호부터 연속 count개 (같은 날 여러 건 발송용) */
export function nextNoticeDocNos(
  records: Record<string, BondStoredRecord>,
  year: number,
  docSeq: Record<string, number> = {},
  count = 5,
): string[] {
  const base = noticeSeq(records, year, docSeq);
  return Array.from({ length: count }, (_, i) => formatDocNo(year, base + 1 + i));
}

export function isBondStep(v: unknown): v is BondAttachmentStepKey {
  return BOND_ATTACHMENT_STEPS.includes(v as BondAttachmentStepKey);
}

export async function assertCanEditBond(id: string, user: { name: string }, canManage: boolean) {
  await assertCanEdit([id], user, canManage);
}

/** 첨부 추가 + (옵션) 단계 날짜·수신정보 동시 갱신 — 권한 확인은 호출자가 */
export async function addBondAttachment(
  id: string,
  step: BondAttachmentStepKey,
  att: BondAttachment,
  user: { name: string },
  extra?: BondRecordPatch,
): Promise<Record<string, BondStoredRecord>> {
  const doc = await readDoc();
  const prev = doc.records[id];
  const rec = extra ? applyPatch(prev, extra) : { ...prev };
  const list = (rec.attachments?.[step] ?? []).filter(a => a.storagePath !== att.storagePath);
  rec.attachments = { ...rec.attachments, [step]: [...list, att] };
  const meta = { at: new Date().toISOString(), by: user.name, entryId: id };
  appendChangeLog(doc, [
    {
      ...meta,
      step,
      action: att.source === 'generated' ? '서식생성 파일 저장' : '파일 추가',
      detail: `${att.filename}${att.sentDate ? ` (${att.sentDate})` : ''}`,
    },
    ...diffRecord(prev, rec, meta),
  ]);
  doc.records[id] = rec;
  await writeDoc(doc);
  return doc.records;
}

export async function removeBondAttachment(
  id: string,
  step: BondAttachmentStepKey,
  attachmentId: string,
  user: { name: string },
): Promise<{ records: Record<string, BondStoredRecord>; removed: BondAttachment | null }> {
  const doc = await readDoc();
  const rec = doc.records[id];
  const list = rec?.attachments?.[step] ?? [];
  const removed = list.find(a => a.id === attachmentId) ?? null;
  if (removed && isLockedBondAttachment(step, removed)) throw new Error('LOCKED');
  if (rec && removed) {
    rec.attachments = { ...rec.attachments, [step]: list.filter(a => a.id !== attachmentId) };
    appendChangeLog(doc, [
      { at: new Date().toISOString(), by: user.name, entryId: id, step, action: '파일 삭제', detail: removed.filename },
    ]);
    await writeDoc(doc);
  }
  return { records: doc.records, removed };
}

export function findBondAttachment(
  records: Record<string, BondStoredRecord>,
  id: string,
  step: BondAttachmentStepKey,
  attachmentId: string,
): BondAttachment | null {
  return records[id]?.attachments?.[step]?.find(a => a.id === attachmentId) ?? null;
}
