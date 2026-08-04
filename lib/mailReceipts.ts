import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { clients, mailReceipts } from '@/db/schema';

export type MailReceiptImage = {
  id: string;
  name: string;
  contentType: string;
  dataUrl: string;
};

export type MailReceiptView = {
  id: string;
  clientId: string | null;
  clientName: string;
  receivedAt: string;
  title: string;
  tags: string[];
  memo: string;
  images: MailReceiptImage[];
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};

const MAX_IMAGES = 5;
/** 압축 후 data URL ~3MB 바이너리 */
const MAX_IMAGE_CHARS = 4_200_000;

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = String(item ?? '')
      .trim()
      .replace(/^#/, '')
      .slice(0, 40);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeImages(raw: unknown, opts?: { strict?: boolean }): MailReceiptImage[] {
  if (!Array.isArray(raw)) return [];
  const out: MailReceiptImage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const dataUrl = typeof rec.dataUrl === 'string' ? rec.dataUrl : '';
    if (!dataUrl.startsWith('data:image/')) continue;
    if (dataUrl.length > MAX_IMAGE_CHARS) {
      if (opts?.strict) {
        throw new Error('이미지 용량이 너무 큽니다. 장당 약 3MB(압축 후) 이하로 올려 주세요.');
      }
      continue;
    }
    out.push({
      id: typeof rec.id === 'string' && rec.id ? rec.id : crypto.randomUUID(),
      name: typeof rec.name === 'string' ? rec.name.slice(0, 120) : 'image',
      contentType: typeof rec.contentType === 'string' ? rec.contentType : 'image/*',
      dataUrl,
    });
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

function toView(
  row: typeof mailReceipts.$inferSelect,
  clientName = '',
): MailReceiptView {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName,
    receivedAt: row.receivedAt || '',
    title: row.title || '',
    tags: normalizeTags(row.tags),
    memo: row.memo || '',
    images: normalizeImages(row.images),
    createdByName: row.createdByName || '',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
          select 1 from jsonb_array_elements_text(coalesce(${mailReceipts.tags}, '[]'::jsonb)) t
          where t ilike ${like}
        )`,
      ),
    );
  }

  const rows = await db
    .select({
      receipt: mailReceipts,
      clientName: clients.companyName,
    })
    .from(mailReceipts)
    .leftJoin(clients, eq(mailReceipts.clientId, clients.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(mailReceipts.receivedAt), desc(mailReceipts.createdAt));

  return rows.map(r => toView(r.receipt, r.clientName ?? ''));
}

export async function getMailReceipt(id: string): Promise<MailReceiptView | null> {
  const db = getDb();
  const [row] = await db
    .select({
      receipt: mailReceipts,
      clientName: clients.companyName,
    })
    .from(mailReceipts)
    .leftJoin(clients, eq(mailReceipts.clientId, clients.id))
    .where(eq(mailReceipts.id, id))
    .limit(1);
  if (!row) return null;
  return toView(row.receipt, row.clientName ?? '');
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
    .select({ id: clients.id, companyName: clients.companyName })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) throw new Error('선택한 수임처를 찾을 수 없습니다.');

  const images = normalizeImages(input.images ?? [], { strict: true });
  const title = (input.title ?? '').trim() || '우편물';
  const receivedAt = (input.receivedAt ?? '').trim() || todayYmd();

  const [row] = await db
    .insert(mailReceipts)
    .values({
      clientId: client.id,
      receivedAt,
      title,
      tags: normalizeTags(input.tags ?? []),
      memo: (input.memo ?? '').trim(),
      images,
      createdByName: input.createdByName.trim() || '',
    })
    .returning();

  return toView(row, client.companyName);
}

export async function updateMailReceipt(
  id: string,
  input: {
    clientId?: string;
    receivedAt?: string;
    title?: string;
    tags?: string[];
    memo?: string;
    images?: MailReceiptImage[];
  },
): Promise<MailReceiptView> {
  const db = getDb();
  const existing = await getMailReceipt(id);
  if (!existing) throw new Error('NOT_FOUND');

  let nextClientId = existing.clientId;
  let nextClientName = existing.clientName;
  if (input.clientId !== undefined) {
    const clientId = input.clientId.trim();
    if (!clientId) throw new Error('수임처를 선택해 주세요.');
    const [client] = await db
      .select({ id: clients.id, companyName: clients.companyName })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (!client) throw new Error('선택한 수임처를 찾을 수 없습니다.');
    nextClientId = client.id;
    nextClientName = client.companyName;
  }

  const patch: Partial<typeof mailReceipts.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.clientId !== undefined) patch.clientId = nextClientId;
  if (input.receivedAt !== undefined) patch.receivedAt = input.receivedAt.trim() || todayYmd();
  if (input.title !== undefined) patch.title = input.title.trim() || '우편물';
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
  if (input.memo !== undefined) patch.memo = input.memo.trim();
  if (input.images !== undefined) patch.images = normalizeImages(input.images, { strict: true });

  const [row] = await db
    .update(mailReceipts)
    .set(patch)
    .where(eq(mailReceipts.id, id))
    .returning();

  return toView(row, nextClientName);
}

export async function deleteMailReceipt(id: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db.delete(mailReceipts).where(eq(mailReceipts.id, id)).returning({ id: mailReceipts.id });
  return deleted.length > 0;
}
