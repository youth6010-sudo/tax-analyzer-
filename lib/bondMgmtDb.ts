import { inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries } from '@/db/schema';
import { getAppConfig, setAppConfig } from '@/lib/appConfigDb';
import { managerNamesMatch } from '@/app/utils/managerMatch';
import {
  BOND_ATTACHMENT_STEPS,
  DEFAULT_BOND_CONTACT,
  type BondAttachment,
  type BondAttachmentStepKey,
  type BondContact,
  type BondNotice,
  type BondRecipient,
  type BondRecordPatch,
  type BondStoredRecord,
} from '@/app/types/bond';

const KEY = 'bond_mgmt';

type BondDoc = { records: Record<string, BondStoredRecord>; contact?: BondContact };

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
  const version = r.version;
  if (version !== 'v1' && version !== 'v1.5' && version !== 'v2') return null;
  const d = (x: unknown) => {
    const s = String(x ?? '');
    return DATE_RE.test(s) ? s : '';
  };
  return {
    version,
    docNo: String(r.docNo ?? '').trim().slice(0, 60),
    sentDate: d(r.sentDate),
    deadline: d(r.deadline),
  };
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

export async function updateBondRecords(
  updates: Array<{ id: string; patch: BondRecordPatch; appendNotice?: unknown }>,
  user: { name: string },
  canManage: boolean,
  contact?: unknown,
): Promise<Record<string, BondStoredRecord>> {
  const ids = [...new Set(updates.map(u => u.id).filter(Boolean))];
  if (!ids.length && contact === undefined) return readBondRecords();
  if (ids.length) await assertCanEdit(ids, user, canManage);

  const doc = await readDoc();
  for (const { id, patch, appendNotice } of updates) {
    const rec = applyPatch(doc.records[id], patch);
    const notice = appendNotice === undefined ? null : sanitizeNotice(appendNotice);
    if (notice) {
      rec.해임통보 = {
        date: rec.해임통보?.date ?? '',
        notices: [...(rec.해임통보?.notices ?? []), notice],
      };
    }
    doc.records[id] = rec;
  }
  if (contact !== undefined) doc.contact = sanitizeContact(contact);
  await writeDoc(doc);
  return doc.records;
}

export async function readBondContact(): Promise<BondContact> {
  const c = (await readDoc()).contact;
  return c && (c.담당 || c.전화 || c.이메일) ? c : DEFAULT_BOND_CONTACT;
}

/** 청년들-부산-추심-YYYY-NNN호 — 저장된 해임통보 기록 중 해당 연도 최대 번호 + 1 */
export function nextNoticeDocNo(records: Record<string, BondStoredRecord>, year: number): string {
  let max = 0;
  for (const rec of Object.values(records)) {
    for (const n of rec.해임통보?.notices ?? []) {
      const m = DOC_NO_RE.exec(n.docNo);
      if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
    }
  }
  return `청년들-부산-추심-${year}-${String(max + 1).padStart(3, '0')}호`;
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
  extra?: BondRecordPatch,
): Promise<Record<string, BondStoredRecord>> {
  const doc = await readDoc();
  const rec = extra ? applyPatch(doc.records[id], extra) : { ...doc.records[id] };
  const list = (rec.attachments?.[step] ?? []).filter(a => a.storagePath !== att.storagePath);
  rec.attachments = { ...rec.attachments, [step]: [...list, att] };
  doc.records[id] = rec;
  await writeDoc(doc);
  return doc.records;
}

export async function removeBondAttachment(
  id: string,
  step: BondAttachmentStepKey,
  attachmentId: string,
): Promise<{ records: Record<string, BondStoredRecord>; removed: BondAttachment | null }> {
  const doc = await readDoc();
  const rec = doc.records[id];
  const list = rec?.attachments?.[step] ?? [];
  const removed = list.find(a => a.id === attachmentId) ?? null;
  if (rec && removed) {
    rec.attachments = { ...rec.attachments, [step]: list.filter(a => a.id !== attachmentId) };
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
