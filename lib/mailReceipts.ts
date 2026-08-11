import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { clients, mailReceipts } from '@/db/schema';
import { managerNamesMatch } from '@/app/utils/managerMatch';
import {
  isMailStorageEnabled,
  persistMailImageToStorage,
  signMailImageUrl,
} from '@/lib/supabaseStorage';

export type MailReceiptImage = {
  id: string;
  name: string;
  contentType: string;
  /** base64 data URL — Storage 사용 시 비울 수 있음 */
  dataUrl: string;
  /** Supabase Storage 경로 (mail-receipts 버킷) */
  storagePath?: string;
  /** 서명 URL (조회 시 채움) */
  url?: string;
};

export type MailAuthoredTag = {
  id: string;
  label: string;
  authorName: string;
  createdAt: string;
};

export type MailMemo = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type MailReceiptView = {
  id: string;
  clientId: string | null;
  clientName: string;
  /** 수임처 담당자 (clients.manager) */
  clientManager: string;
  receivedAt: string;
  title: string;
  tags: MailAuthoredTag[];
  memos: MailMemo[];
  /** @deprecated 검색·하위호환 — memos body 합친 텍스트 */
  memo: string;
  images: MailReceiptImage[];
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

const MAX_IMAGES = 5;
const MAX_TAGS = 24;
const MAX_MEMOS = 50;
/** 압축 후 data URL — Storage 미사용 시. Pro Storage면 장당 더 여유 */
const MAX_IMAGE_CHARS = 4_200_000;
const MAX_IMAGE_CHARS_STORAGE = 8_000_000;

function cleanTagLabel(raw: string): string {
  return raw.trim().replace(/^#/, '').slice(0, 40);
}

function normalizeTags(
  raw: unknown,
  fallbackAuthor = '',
  fallbackCreatedAt = '',
): MailAuthoredTag[] {
  if (!Array.isArray(raw)) return [];
  const out: MailAuthoredTag[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item === 'string') {
      const label = cleanTagLabel(item);
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      out.push({
        id: crypto.randomUUID(),
        label,
        authorName: fallbackAuthor,
        createdAt: fallbackCreatedAt || new Date().toISOString(),
      });
    } else if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const label = cleanTagLabel(String(rec.label ?? rec.tag ?? ''));
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      out.push({
        id: typeof rec.id === 'string' && rec.id ? rec.id : crypto.randomUUID(),
        label,
        authorName: typeof rec.authorName === 'string' ? rec.authorName.trim() : fallbackAuthor,
        createdAt:
          typeof rec.createdAt === 'string' && rec.createdAt
            ? rec.createdAt
            : fallbackCreatedAt || new Date().toISOString(),
      });
    }
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function normalizeMemos(
  raw: unknown,
  legacyMemo = '',
  fallbackAuthor = '',
  fallbackCreatedAt = '',
): MailMemo[] {
  const out: MailMemo[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const body = typeof rec.body === 'string' ? rec.body.trim() : '';
      const authorName = typeof rec.authorName === 'string' ? rec.authorName.trim() : '';
      if (!body) continue;
      out.push({
        id: typeof rec.id === 'string' && rec.id ? rec.id : crypto.randomUUID(),
        authorName: authorName || fallbackAuthor || '알 수 없음',
        body: body.slice(0, 2000),
        createdAt:
          typeof rec.createdAt === 'string' && rec.createdAt
            ? rec.createdAt
            : fallbackCreatedAt || new Date().toISOString(),
      });
      if (out.length >= MAX_MEMOS) break;
    }
  }
  if (out.length === 0) {
    const body = legacyMemo.trim();
    if (body) {
      out.push({
        id: crypto.randomUUID(),
        authorName: fallbackAuthor || '알 수 없음',
        body: body.slice(0, 2000),
        createdAt: fallbackCreatedAt || new Date().toISOString(),
      });
    }
  }
  return out;
}

function memosToSearchText(memos: MailMemo[]): string {
  return memos.map(m => m.body).join('\n').slice(0, 8000);
}

function tagsFromLabels(labels: string[], authorName: string, createdAt?: string): MailAuthoredTag[] {
  const at = createdAt || new Date().toISOString();
  return normalizeTags(
    labels.map(label => ({
      id: crypto.randomUUID(),
      label,
      authorName,
      createdAt: at,
    })),
    authorName,
    at,
  );
}

function normalizeImages(raw: unknown, opts?: { strict?: boolean }): MailReceiptImage[] {
  if (!Array.isArray(raw)) return [];
  const out: MailReceiptImage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const dataUrl = typeof rec.dataUrl === 'string' ? rec.dataUrl : '';
    const storagePath = typeof rec.storagePath === 'string' ? rec.storagePath.trim() : '';
    if (!dataUrl.startsWith('data:image/') && !storagePath) continue;
    const maxChars = storagePath ? MAX_IMAGE_CHARS_STORAGE : MAX_IMAGE_CHARS;
    if (dataUrl && dataUrl.length > maxChars) {
      if (opts?.strict) {
        throw new Error('이미지 용량이 너무 큽니다. 장당 압축 후 용량을 줄여 주세요.');
      }
      continue;
    }
    out.push({
      id: typeof rec.id === 'string' && rec.id ? rec.id : crypto.randomUUID(),
      name: typeof rec.name === 'string' ? rec.name.slice(0, 120) : 'image',
      contentType: typeof rec.contentType === 'string' ? rec.contentType : 'image/*',
      dataUrl: dataUrl.startsWith('data:image/') ? dataUrl : '',
      storagePath: storagePath || undefined,
      url: typeof rec.url === 'string' ? rec.url : undefined,
    });
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

function toView(
  row: typeof mailReceipts.$inferSelect,
  clientName = '',
  clientManager = '',
): MailReceiptView {
  const createdAt = row.createdAt.toISOString();
  const tags = normalizeTags(row.tags, row.createdByName || '', createdAt);
  const memos = normalizeMemos(
    (row as { memos?: unknown }).memos,
    row.memo || '',
    row.createdByName || '',
    createdAt,
  );
  return {
    id: row.id,
    clientId: row.clientId,
    clientName,
    clientManager: (clientManager || '').trim(),
    receivedAt: row.receivedAt || '',
    title: row.title || '',
    tags,
    memos,
    memo: memosToSearchText(memos) || row.memo || '',
    images: normalizeImages(row.images),
    createdByName: row.createdByName || '',
    createdAt,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function withSignedImageUrls(view: MailReceiptView): Promise<MailReceiptView> {
  if (!isMailStorageEnabled()) return view;
  const images = await Promise.all(
    view.images.map(async img => {
      if (img.dataUrl) return img;
      if (!img.storagePath) return img;
      const url = await signMailImageUrl(img.storagePath);
      return url ? { ...img, url } : img;
    }),
  );
  return { ...view, images };
}

async function storeImagesIfEnabled(
  images: MailReceiptImage[],
  receiptKey: string,
): Promise<MailReceiptImage[]> {
  if (!isMailStorageEnabled()) return images;
  const out: MailReceiptImage[] = [];
  for (const img of images) {
    out.push(await persistMailImageToStorage(img, receiptKey));
  }
  return out;
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function listMailReceipts(opts?: {
  q?: string;
  clientId?: string;
}): Promise<MailReceiptView[]> {
  const db = getDb();
  const q = (opts?.q ?? '').trim();
  const clientId = (opts?.clientId ?? '').trim();

  const conditions = [];
  if (clientId) conditions.push(eq(mailReceipts.clientId, clientId));
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      or(
        ilike(mailReceipts.title, like),
        ilike(mailReceipts.memo, like),
        ilike(clients.companyName, like),
        sql`exists (
          select 1 from jsonb_array_elements(coalesce(${mailReceipts.tags}, '[]'::jsonb)) t
          where coalesce(t->>'label', trim(both '"' from t::text)) ilike ${like}
        )`,
        sql`exists (
          select 1 from jsonb_array_elements(coalesce(${mailReceipts.memos}, '[]'::jsonb)) m
          where coalesce(m->>'body', '') ilike ${like}
        )`,
      ),
    );
  }

  const rows = await db
    .select({
      receipt: mailReceipts,
      clientName: clients.companyName,
      clientManager: clients.manager,
    })
    .from(mailReceipts)
    .leftJoin(clients, eq(mailReceipts.clientId, clients.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(mailReceipts.receivedAt), desc(mailReceipts.createdAt));

  return Promise.all(
    rows.map(r =>
      withSignedImageUrls(toView(r.receipt, r.clientName ?? '', r.clientManager ?? '')),
    ),
  );
}

export async function getMailReceipt(id: string): Promise<MailReceiptView | null> {
  const db = getDb();
  const [row] = await db
    .select({
      receipt: mailReceipts,
      clientName: clients.companyName,
      clientManager: clients.manager,
    })
    .from(mailReceipts)
    .leftJoin(clients, eq(mailReceipts.clientId, clients.id))
    .where(eq(mailReceipts.id, id))
    .limit(1);
  if (!row) return null;
  return withSignedImageUrls(toView(row.receipt, row.clientName ?? '', row.clientManager ?? ''));
}

export async function createMailReceipt(input: {
  clientId: string;
  receivedAt?: string;
  title?: string;
  tags?: string[];
  memo?: string;
  images?: MailReceiptImage[];
  createdByName: string;
}): Promise<MailReceiptView> {
  const clientId = input.clientId.trim();
  if (!clientId) throw new Error('수임처를 선택해 주세요.');

  const db = getDb();
  const [client] = await db
    .select({ id: clients.id, companyName: clients.companyName, manager: clients.manager })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) throw new Error('선택한 수임처를 찾을 수 없습니다.');

  const imagesIn = normalizeImages(input.images ?? [], { strict: true });
  const title = (input.title ?? '').trim() || '우편물';
  const receivedAt = (input.receivedAt ?? '').trim() || todayYmd();
  const author = input.createdByName.trim() || '';
  const now = new Date().toISOString();
  const tags = tagsFromLabels(input.tags ?? [], author, now);
  const memos = (input.memo ?? '').trim()
    ? [{
        id: crypto.randomUUID(),
        authorName: author || '알 수 없음',
        body: (input.memo ?? '').trim().slice(0, 2000),
        createdAt: now,
      }]
    : [];

  const [row] = await db
    .insert(mailReceipts)
    .values({
      clientId: client.id,
      receivedAt,
      title,
      tags,
      memos,
      memo: memosToSearchText(memos),
      images: imagesIn,
      createdByName: author,
    })
    .returning();

  let images = imagesIn;
  if (isMailStorageEnabled() && imagesIn.length) {
    images = await storeImagesIfEnabled(imagesIn, row.id);
    await db.update(mailReceipts).set({ images, updatedAt: new Date() }).where(eq(mailReceipts.id, row.id));
  }

  return withSignedImageUrls(toView({ ...row, images }, client.companyName, client.manager ?? ''));
}

export type UpdateMailReceiptInput = {
  clientId?: string;
  receivedAt?: string;
  title?: string;
  images?: MailReceiptImage[];
  addTag?: string;
  deleteTag?: string;
  addMemo?: string;
  updateMemo?: { id: string; body: string };
  deleteMemo?: string;
  /** @deprecated 생성 직후 호환 — 생성자만, 전체를 본인 태그로 교체하지 않음 */
  tags?: string[];
  memo?: string;
};

export async function updateMailReceipt(
  id: string,
  actorName: string,
  input: UpdateMailReceiptInput,
): Promise<MailReceiptView> {
  const db = getDb();
  const existing = await getMailReceipt(id);
  if (!existing) throw new Error('NOT_FOUND');

  const isCreator = managerNamesMatch(existing.createdByName, actorName);
  const coreTouched =
    input.clientId !== undefined
    || input.receivedAt !== undefined
    || input.title !== undefined
    || input.images !== undefined
    || input.tags !== undefined
    || input.memo !== undefined;

  if (coreTouched && !isCreator) {
    throw new Error('본인이 등록한 우편물만 기본 정보를 수정할 수 있습니다.');
  }

  let nextClientId = existing.clientId;
  let nextClientName = existing.clientName;
  let nextClientManager = existing.clientManager;
  if (input.clientId !== undefined) {
    const clientId = input.clientId.trim();
    if (!clientId) throw new Error('수임처를 선택해 주세요.');
    const [client] = await db
      .select({ id: clients.id, companyName: clients.companyName, manager: clients.manager })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (!client) throw new Error('선택한 수임처를 찾을 수 없습니다.');
    nextClientId = client.id;
    nextClientName = client.companyName;
    nextClientManager = client.manager ?? '';
  }

  let nextTags = [...existing.tags];
  let nextMemos = [...existing.memos];

  if (input.tags !== undefined && isCreator) {
    // 레거시 전체 치환 — 신규 라벨만 생성자 앞으로 추가(기존 타인 태그 유지)
    const wanted = new Set(
      (input.tags ?? []).map(t => cleanTagLabel(t).toLowerCase()).filter(Boolean),
    );
    nextTags = nextTags.filter(t => wanted.has(t.label.toLowerCase()) || !managerNamesMatch(t.authorName, actorName));
    const have = new Set(nextTags.map(t => t.label.toLowerCase()));
    const now = new Date().toISOString();
    for (const raw of input.tags ?? []) {
      const label = cleanTagLabel(raw);
      if (!label || have.has(label.toLowerCase())) continue;
      have.add(label.toLowerCase());
      nextTags.push({
        id: crypto.randomUUID(),
        label,
        authorName: actorName.trim(),
        createdAt: now,
      });
    }
  }

  if (input.memo !== undefined && isCreator && existing.memos.length === 0 && input.memo.trim()) {
    nextMemos = [{
      id: crypto.randomUUID(),
      authorName: actorName.trim() || '알 수 없음',
      body: input.memo.trim().slice(0, 2000),
      createdAt: new Date().toISOString(),
    }];
  }

  if (input.addTag !== undefined) {
    const label = cleanTagLabel(input.addTag);
    if (!label) throw new Error('태그를 입력해 주세요.');
    if (nextTags.some(t => t.label.toLowerCase() === label.toLowerCase())) {
      throw new Error('이미 있는 태그입니다.');
    }
    if (nextTags.length >= MAX_TAGS) throw new Error(`태그는 최대 ${MAX_TAGS}개까지입니다.`);
    nextTags.push({
      id: crypto.randomUUID(),
      label,
      authorName: actorName.trim() || '알 수 없음',
      createdAt: new Date().toISOString(),
    });
  }

  if (input.deleteTag !== undefined) {
    const tagId = input.deleteTag.trim();
    const target = nextTags.find(t => t.id === tagId);
    if (!target) throw new Error('태그를 찾을 수 없습니다.');
    if (!managerNamesMatch(target.authorName, actorName)) {
      throw new Error('본인이 등록한 태그만 삭제할 수 있습니다.');
    }
    nextTags = nextTags.filter(t => t.id !== tagId);
  }

  if (input.addMemo !== undefined) {
    const body = input.addMemo.trim();
    if (!body) throw new Error('메모 내용을 입력하세요.');
    if (nextMemos.length >= MAX_MEMOS) throw new Error(`메모는 최대 ${MAX_MEMOS}개까지입니다.`);
    nextMemos.push({
      id: crypto.randomUUID(),
      authorName: actorName.trim() || '알 수 없음',
      body: body.slice(0, 2000),
      createdAt: new Date().toISOString(),
    });
  }

  if (input.updateMemo !== undefined) {
    const memoId = input.updateMemo.id.trim();
    const body = input.updateMemo.body.trim();
    if (!body) throw new Error('메모 내용을 입력하세요.');
    const idx = nextMemos.findIndex(m => m.id === memoId);
    if (idx < 0) throw new Error('메모를 찾을 수 없습니다.');
    if (!managerNamesMatch(nextMemos[idx]!.authorName, actorName)) {
      throw new Error('본인이 작성한 메모만 수정할 수 있습니다.');
    }
    nextMemos = nextMemos.map((m, i) => (i === idx ? { ...m, body: body.slice(0, 2000) } : m));
  }

  if (input.deleteMemo !== undefined) {
    const memoId = input.deleteMemo.trim();
    const target = nextMemos.find(m => m.id === memoId);
    if (!target) throw new Error('메모를 찾을 수 없습니다.');
    if (!managerNamesMatch(target.authorName, actorName)) {
      throw new Error('본인이 작성한 메모만 삭제할 수 있습니다.');
    }
    nextMemos = nextMemos.filter(m => m.id !== memoId);
  }

  const patch: Partial<typeof mailReceipts.$inferInsert> = {
    updatedAt: new Date(),
    tags: nextTags,
    memos: nextMemos,
    memo: memosToSearchText(nextMemos),
  };
  if (input.clientId !== undefined) patch.clientId = nextClientId;
  if (input.receivedAt !== undefined) patch.receivedAt = input.receivedAt.trim() || todayYmd();
  if (input.title !== undefined) patch.title = input.title.trim() || '우편물';
  if (input.images !== undefined) {
    let images = normalizeImages(input.images, { strict: true });
    if (isMailStorageEnabled() && images.length) {
      images = await storeImagesIfEnabled(images, id);
    }
    patch.images = images;
  }

  const [row] = await db
    .update(mailReceipts)
    .set(patch)
    .where(eq(mailReceipts.id, id))
    .returning();

  return withSignedImageUrls(toView(row, nextClientName, nextClientManager));
}

export async function deleteMailReceipt(id: string, actorName: string): Promise<boolean> {
  const existing = await getMailReceipt(id);
  if (!existing) return false;
  if (!managerNamesMatch(existing.createdByName, actorName)) {
    throw new Error('본인이 등록한 우편물만 삭제할 수 있습니다.');
  }
  const db = getDb();
  const deleted = await db.delete(mailReceipts).where(eq(mailReceipts.id, id)).returning({ id: mailReceipts.id });
  return deleted.length > 0;
}
