import type {
  BondAttachment,
  BondAttachmentStepKey,
  BondRecordPatch,
  BondStoredRecord,
} from '@/app/types/bond';

type Records = Record<string, BondStoredRecord>;

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || fallback);
  return data as T;
}

/** 서명 URL 발급 → Supabase 직접 업로드 → 메타 저장 */
export async function uploadBondAttachment(opts: {
  id: string;
  step: BondAttachmentStepKey;
  file: Blob;
  filename: string;
  sentDate: string;
  source?: 'manual' | 'generated';
  patch?: BondRecordPatch;
}): Promise<{ records: Records; attachment: BondAttachment }> {
  const mimeType = opts.file.type || 'application/pdf';
  const ticket = await readJson<{ fileId: string; storagePath: string; signedUrl: string }>(
    await fetch('/api/arrears/bond/attachments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: opts.id,
        step: opts.step,
        filename: opts.filename,
        mimeType,
        size: opts.file.size,
      }),
    }),
    '업로드 준비 실패',
  );

  const up = await fetch(ticket.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType, 'x-upsert': 'true' },
    body: opts.file,
  });
  if (!up.ok) throw new Error(`파일 업로드 실패 (${up.status})`);

  return readJson<{ records: Records; attachment: BondAttachment }>(
    await fetch('/api/arrears/bond/attachments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: opts.id,
        step: opts.step,
        fileId: ticket.fileId,
        storagePath: ticket.storagePath,
        filename: opts.filename,
        mimeType,
        size: opts.file.size,
        sentDate: opts.sentDate,
        source: opts.source ?? 'manual',
        patch: opts.patch,
      }),
    }),
    '첨부 저장 실패',
  );
}

export async function signBondAttachmentUrl(
  id: string,
  step: BondAttachmentStepKey,
  attachmentId: string,
  download = false,
): Promise<string> {
  const q = new URLSearchParams({ id, step, attachmentId });
  if (download) q.set('download', '1');
  const data = await readJson<{ url: string }>(
    await fetch(`/api/arrears/bond/attachments?${q}`, { cache: 'no-store' }),
    '파일 열기 실패',
  );
  return data.url;
}

export async function deleteBondAttachment(
  id: string,
  step: BondAttachmentStepKey,
  attachmentId: string,
): Promise<Records> {
  const q = new URLSearchParams({ id, step, attachmentId });
  const data = await readJson<{ records: Records }>(
    await fetch(`/api/arrears/bond/attachments?${q}`, { method: 'DELETE' }),
    '삭제 실패',
  );
  return data.records;
}
