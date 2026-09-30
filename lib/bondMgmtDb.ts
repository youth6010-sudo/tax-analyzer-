import { inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries } from '@/db/schema';
import { getAppConfig, setAppConfig } from '@/lib/appConfigDb';
import { managerNamesMatch } from '@/app/utils/managerMatch';
import type { BondRecordPatch, BondStoredRecord } from '@/app/types/bond';

const KEY = 'bond_mgmt';

type BondDoc = { records: Record<string, BondStoredRecord> };

const DATE_RE = /^(\d{4}-\d{2}-\d{2})?$/;

export async function readBondRecords(): Promise<Record<string, BondStoredRecord>> {
  const doc = await getAppConfig<BondDoc>(KEY);
  return doc?.records ?? {};
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
  return out;
}

/** 담당자 본인 업체 또는 미수 관리권한자만 수정 */
export async function updateBondRecords(
  updates: Array<{ id: string; patch: BondRecordPatch }>,
  user: { name: string },
  canManage: boolean,
): Promise<Record<string, BondStoredRecord>> {
  const ids = [...new Set(updates.map(u => u.id).filter(Boolean))];
  if (!ids.length) return readBondRecords();

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

  const records = await readBondRecords();
  for (const { id, patch } of updates) {
    records[id] = { ...records[id], ...sanitizePatch(patch) };
  }
  await setAppConfig(KEY, { records });
  return records;
}
