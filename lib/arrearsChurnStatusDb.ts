import { sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries } from '@/db/schema';
import { getAppConfig, setAppConfig } from '@/lib/appConfigDb';
import {
  sanitizeArrearsChurnStatuses,
  type ArrearsChurnStatusOption,
} from '@/app/types/arrears';

const KEY = 'arrears_churn_statuses';
const MAX_OPTIONS = 20;

export async function readArrearsChurnStatuses(): Promise<ArrearsChurnStatusOption[]> {
  const doc = await getAppConfig<{ items?: unknown }>(KEY);
  return sanitizeArrearsChurnStatuses(doc?.items);
}

async function countEntriesByStatus(): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({ status: arrearsEntries.churnMgmtStatus, n: sql<number>`count(*)::int` })
    .from(arrearsEntries)
    .groupBy(arrearsEntries.churnMgmtStatus);
  return new Map(rows.map(r => [r.status || '', Number(r.n)]));
}

/** 목록 저장 — 이름 중복·빈 이름 거부, 사용 중인 항목은 삭제 불가 */
export async function writeArrearsChurnStatuses(raw: unknown): Promise<ArrearsChurnStatusOption[]> {
  if (!Array.isArray(raw)) throw new Error('해임 목록 형식이 올바르지 않습니다.');
  const draft = raw.map(v => {
    const o = (v ?? {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? '').trim(),
      label: String(o.label ?? '').replace(/\s+/g, ' ').trim(),
      color: o.color,
    };
  });
  if (!draft.length) throw new Error('해임 구분은 1개 이상 있어야 합니다.');
  if (draft.length > MAX_OPTIONS) throw new Error(`해임 구분은 최대 ${MAX_OPTIONS}개까지입니다.`);
  if (draft.some(d => !d.label)) throw new Error('이름이 빈 해임 구분이 있습니다.');
  const labels = draft.map(d => d.label.replace(/\s+/g, ''));
  const dup = labels.find((l, i) => labels.indexOf(l) !== i);
  if (dup) throw new Error(`해임 구분 이름이 중복됩니다: ${dup}`);

  const used = new Set<string>();
  const items = draft.map(d => {
    let id = d.id;
    if (!id || used.has(id)) id = `c_${crypto.randomUUID().slice(0, 8)}`;
    used.add(id);
    return { ...d, id };
  });
  const next = sanitizeArrearsChurnStatuses(items);

  const prev = await readArrearsChurnStatuses();
  const removed = prev.filter(p => !next.some(n => n.id === p.id));
  if (removed.length) {
    const counts = await countEntriesByStatus();
    const inUse = removed
      .map(r => ({ label: r.label, n: counts.get(r.id) ?? 0 }))
      .filter(r => r.n > 0);
    if (inUse.length) {
      throw new Error(
        `사용 중인 해임 구분은 삭제할 수 없습니다: ${inUse.map(r => `${r.label}(${r.n}곳)`).join(', ')} — 먼저 업체의 해임 구분을 바꿔 주세요.`,
      );
    }
  }

  await setAppConfig(KEY, { items: next });
  return next;
}

export async function isValidArrearsChurnStatus(id: string): Promise<boolean> {
  if (!id) return true;
  return (await readArrearsChurnStatuses()).some(o => o.id === id);
}
