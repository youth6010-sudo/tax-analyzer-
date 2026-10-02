import { getSupabaseAdmin } from '@/lib/supabaseStorage';

export const BOND_BUCKET = 'bond-docs';

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

function requireAdmin() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 가 필요합니다. (채권관리 첨부 저장소)');
  }
  return admin;
}

let bucketReady = false;

export async function ensureBondBucket(): Promise<void> {
  if (bucketReady) return;
  const admin = requireAdmin();
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) throw new Error(error.message);
  if (!(buckets || []).some(b => b.name === BOND_BUCKET)) {
    const { error: createErr } = await admin.storage.createBucket(BOND_BUCKET, {
      public: false,
      fileSizeLimit: 20 * 1024 * 1024,
      allowedMimeTypes: ALLOWED_MIME,
    });
    if (createErr && !/already exists/i.test(createErr.message)) throw new Error(createErr.message);
  }
  bucketReady = true;
}

export function bondMimeAllowed(mime: string): boolean {
  return ALLOWED_MIME.includes(mime);
}

function extOf(filename: string, mime: string): string {
  const dot = filename.lastIndexOf('.');
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
  if (/^(pdf|jpe?g|png|webp)$/.test(ext)) return ext;
  return mime === 'application/pdf' ? 'pdf' : mime.split('/')[1] || 'bin';
}

/** 한글 파일명은 Storage 키로 못 쓰므로 uuid 경로 사용 */
export function buildBondStoragePath(arrearsId: string, stepIndex: number, fileId: string, filename: string, mime: string) {
  return `${arrearsId}/s${stepIndex}/${fileId}.${extOf(filename, mime)}`;
}

export async function createBondUploadUrl(path: string): Promise<{ signedUrl: string; token: string }> {
  await ensureBondBucket();
  const admin = requireAdmin();
  const { data, error } = await admin.storage.from(BOND_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(error?.message || '업로드 URL 발급 실패');
  return { signedUrl: data.signedUrl, token: data.token };
}

export async function uploadBondFile(path: string, body: Buffer, contentType: string): Promise<void> {
  await ensureBondBucket();
  const admin = requireAdmin();
  const { error } = await admin.storage.from(BOND_BUCKET).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(error.message);
}

export async function bondFileExists(path: string): Promise<boolean> {
  const admin = requireAdmin();
  const slash = path.lastIndexOf('/');
  const { data, error } = await admin.storage
    .from(BOND_BUCKET)
    .list(path.slice(0, slash), { search: path.slice(slash + 1) });
  if (error) return false;
  return (data || []).some(f => f.name === path.slice(slash + 1));
}

export async function signBondFileUrl(path: string, downloadName?: string, expiresSec = 600): Promise<string> {
  const admin = requireAdmin();
  const { data, error } = await admin.storage
    .from(BOND_BUCKET)
    .createSignedUrl(path, expiresSec, downloadName ? { download: downloadName } : undefined);
  if (error || !data?.signedUrl) throw new Error(error?.message || '파일 URL 발급 실패');
  return data.signedUrl;
}

export async function removeBondFile(path: string): Promise<void> {
  const admin = requireAdmin();
  const { error } = await admin.storage.from(BOND_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}
