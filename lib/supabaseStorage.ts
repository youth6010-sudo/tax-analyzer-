import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabaseUrl } from '@/lib/infraStatus';

const MAIL_BUCKET = 'mail-receipts';

let cached: SupabaseClient | null | undefined;

/** 서비스 롤이 있을 때만 admin 클라이언트 (Storage 업로드) */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = resolveSupabaseUrl();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function isMailStorageEnabled(): boolean {
  return getSupabaseAdmin() != null;
}

export async function ensureMailReceiptsBucket(): Promise<{ ok: boolean; message: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      ok: false,
      message:
        'SUPABASE_URL(또는 DB에서 ref 추론) + SUPABASE_SERVICE_ROLE_KEY 가 필요합니다. Supabase → Settings → API',
    };
  }
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) return { ok: false, message: listErr.message };
  const exists = (buckets || []).some(b => b.name === MAIL_BUCKET);
  if (!exists) {
    const { error } = await admin.storage.createBucket(MAIL_BUCKET, {
      public: false,
      fileSizeLimit: 8 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    });
    if (error) return { ok: false, message: error.message };
  }
  return { ok: true, message: `버킷 «${MAIL_BUCKET}» 준비됨` };
}

function parseDataUrl(dataUrl: string): { contentType: string; buffer: Buffer } | null {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    return { contentType: m[1], buffer: Buffer.from(m[2], 'base64') };
  } catch {
    return null;
  }
}

export type StoredMailImage = {
  id: string;
  name: string;
  contentType: string;
  /** data URL 또는 비움(스토리지만) */
  dataUrl: string;
  storagePath?: string;
};

/** data URL → Storage 업로드 후 storagePath 채움 (실패 시 원본 dataUrl 유지) */
export async function persistMailImageToStorage(
  image: StoredMailImage,
  receiptKey: string,
): Promise<StoredMailImage> {
  const admin = getSupabaseAdmin();
  if (!admin || !image.dataUrl?.startsWith('data:image/')) return image;

  const parsed = parseDataUrl(image.dataUrl);
  if (!parsed) return image;

  const ext =
    parsed.contentType.includes('png')
      ? 'png'
      : parsed.contentType.includes('webp')
        ? 'webp'
        : 'jpg';
  const path = `${receiptKey}/${image.id}.${ext}`;

  const { error } = await admin.storage.from(MAIL_BUCKET).upload(path, parsed.buffer, {
    contentType: parsed.contentType,
    upsert: true,
  });
  if (error) {
    console.warn('mail storage upload failed', error.message);
    return image;
  }

  return {
    ...image,
    storagePath: path,
    // DB 용량 절약 — 스토리지에 올렸으면 dataUrl 비움
    dataUrl: '',
    contentType: parsed.contentType,
  };
}

export async function signMailImageUrl(storagePath: string, expiresSec = 3600): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin || !storagePath) return null;
  const { data, error } = await admin.storage
    .from(MAIL_BUCKET)
    .createSignedUrl(storagePath, expiresSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
