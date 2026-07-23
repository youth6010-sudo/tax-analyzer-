import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { reviewGridNewRows, reviewGridPatches } from '@/db/schema';

export type ReviewPatchInput = {
  sheetName: string;
  r: number;
  c: number;
  v: string | number | boolean | null;
  bg?: string | null;
};

export type ReviewNewRowInput = {
  id: string;
  owner?: string;
  kind?: string;
  sheetName?: string;
  createdAt?: string;
  cells?: Record<string, unknown>;
  filterKey?: string;
  sectionLabel?: string;
  [key: string]: unknown;
};

export async function listReviewPatches() {
  try {
    const db = getDb();
    const rows = await db.select().from(reviewGridPatches);
    return rows.map(row => ({
      sheetName: row.sheetName,
      r: row.r,
      c: row.c,
      v: parsePatchValue(row.value),
      bg: row.bg ?? undefined,
    }));
  } catch (e) {
    console.warn('[reviewGridDb] listReviewPatches fallback:', e);
    return [];
  }
}

export async function listReviewNewRows() {
  try {
    const db = getDb();
    const rows = await db.select().from(reviewGridNewRows).orderBy(asc(reviewGridNewRows.createdAt));
    return rows.map(row => ({
      id: row.id,
      owner: row.owner,
      kind: row.kind,
      sheetName: row.sheetName,
      ...(row.payload as Record<string, unknown>),
    }));
  } catch (e) {
    console.warn('[reviewGridDb] listReviewNewRows fallback:', e);
    return [];
  }
}

function parsePatchValue(raw: string): string | number | null {
  if (raw === '') return '';
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
  return raw;
}

function serializePatchValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

export async function upsertReviewPatches(
  patches: ReviewPatchInput[],
  userId: string | null,
) {
  if (!patches.length) return;
  const db = getDb();
  const now = new Date();
  /** 순차 await 대신 청크 병렬 — 셀 다수 편집 시 DB 왕복 대기 감소 */
  const CHUNK = 25;

  for (let i = 0; i < patches.length; i += CHUNK) {
    const slice = patches.slice(i, i + CHUNK);
    await Promise.all(
      slice.map(patch => {
        const setFields: {
          value: string;
          updatedBy: string | null;
          updatedAt: Date;
          bg?: string | null;
        } = {
          value: serializePatchValue(patch.v),
          updatedBy: userId,
          updatedAt: now,
        };
        if (patch.bg !== undefined) {
          setFields.bg = patch.bg;
        }
        return db
          .insert(reviewGridPatches)
          .values({
            sheetName: patch.sheetName,
            r: patch.r,
            c: patch.c,
            value: serializePatchValue(patch.v),
            bg: patch.bg ?? null,
            updatedBy: userId,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [reviewGridPatches.sheetName, reviewGridPatches.r, reviewGridPatches.c],
            set: setFields,
          });
      }),
    );
  }
}

export async function replaceReviewNewRows(
  rows: ReviewNewRowInput[],
  userId: string | null,
) {
  const db = getDb();
  // 빈 배열로 전체 삭제하는 실수(로드 전 dirty 저장 등) 방지 — 명시적 clear는 clearReviewGridEdits
  if (!rows.length) {
    console.warn('[reviewGridDb] replaceReviewNewRows skipped empty array');
    return;
  }
  await db.delete(reviewGridNewRows);

  await db.insert(reviewGridNewRows).values(
    rows.map(row => {
      const { id, owner, kind, sheetName, ...rest } = row;
      return {
        id,
        owner: owner ?? '',
        kind: kind ?? '',
        sheetName: sheetName ?? '',
        payload: rest,
        createdBy: userId,
      };
    }),
  );
}

export async function addReviewNewRow(row: ReviewNewRowInput, userId: string | null) {
  const db = getDb();
  const { id, owner, kind, sheetName, ...rest } = row;
  await db.insert(reviewGridNewRows).values({
    id,
    owner: owner ?? '',
    kind: kind ?? '',
    sheetName: sheetName ?? '',
    payload: rest,
    createdBy: userId,
  });
}

export async function clearReviewGridEdits() {
  const db = getDb();
  await db.delete(reviewGridPatches);
  await db.delete(reviewGridNewRows);
}

export async function removeReviewNewRow(id: string) {
  const db = getDb();
  await db.delete(reviewGridNewRows).where(eq(reviewGridNewRows.id, id));
}
