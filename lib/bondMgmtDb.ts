import { inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries } from '@/db/schema';
import { getAppConfig, setAppConfig } from '@/lib/appConfigDb';
import { managerNamesMatch } from '@/app/utils/managerMatch';
import {
  BOND_ATTACHMENT_STEPS,
  type BondAttachment,
  type BondAttachmentStepKey,
  type BondRecipient,
  type BondRecordPatch,
  type BondStoredRecord,
} from '@/app/types/bond';

const KEY = 'bond_mgmt';

type BondDoc = { records: Record<string, BondStoredRecord> };

const DATE_RE = /^(\d{4}-\d{2}-\d{2})?$/;

export async function readBondRecords(): Promise<Record<string, BondStoredRecord>> {
  const doc = await getAppConfig<BondDoc>(KEY);
  return doc?.records ?? {};
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
  updates: Array<{ id: string; patch: BondRecordPatch }>,
  user: { name: string },
  canManage: boolean,
): Promise<Record<string, BondStoredRecord>> {
  const ids = [...new Set(updates.map(u => u.id).filter(Boolean))];
  if (!ids.length) return readBondRecords();
  await assertCanEdit(ids, user, canManage);

  const records = await readBondRecords();
  for (const { id, patch } of updates) {
    records[id] = { ...records[id], ...sanitizePatch(patch) };
  }
  await setAppConfig(KEY, { records });
  return records;
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
  const records = await readBondRecords();
  const rec: BondStoredRecord = { ...records[id], ...(extra ? sanitizePatch(extra) : {}) };
  const list = (rec.attachments?.[step] ?? []).filter(a => a.storagePath !== att.storagePath);
  rec.attachments = { ...rec.attachments, [step]: [...list, att] };
  records[id] = rec;
  await setAppConfig(KEY, { records });
  return records;
}

export async function removeBondAttachment(
  id: string,
  step: BondAttachmentStepKey,
  attachmentId: string,
): Promise<{ records: Record<string, BondStoredRecord>; removed: BondAttachment | null }> {
  const records = await readBondRecords();
  const rec = records[id];
  const list = rec?.attachments?.[step] ?? [];
  const removed = list.find(a => a.id === attachmentId) ?? null;
  if (rec && removed) {
    rec.attachments = { ...rec.attachments, [step]: list.filter(a => a.id !== attachmentId) };
    await setAppConfig(KEY, { records });
  }
  return { records, removed };
}

export function findBondAttachment(
  records: Record<string, BondStoredRecord>,
  id: string,
  step: BondAttachmentStepKey,
  attachmentId: string,
): BondAttachment | null {
  return records[id]?.attachments?.[step]?.find(a => a.id === attachmentId) ?? null;
}
