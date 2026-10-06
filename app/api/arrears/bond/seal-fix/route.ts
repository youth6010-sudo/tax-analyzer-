import { NextResponse } from 'next/server';
import { getAppConfig, setAppConfig } from '@/lib/appConfigDb';
import { BOND_BUCKET } from '@/lib/bondStorage';
import { getSupabaseAdmin } from '@/lib/supabaseStorage';
import { fixNoticeSeal, loadSealRgba, renameNoticeFile } from '@/lib/noticeSealFix';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Att = { storagePath: string; filename: string; sentDate: string; source: string };

/**
 * 해임통보 안내문 직인 위치 일괄 보정 (1회성 운영 작업).
 * BOND_SEAL_FIX_TOKEN 환경변수가 있을 때만 열리고, x-fix-token 헤더가 같아야 함.
 * ?offset=&limit= 로 나눠 실행, ?apply=1 이면 저장소 교체 + 파일명 정리, 없으면 미리보기만.
 */
export async function POST(req: Request) {
  const token = process.env.BOND_SEAL_FIX_TOKEN;
  if (!token || req.headers.get('x-fix-token') !== token) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const url = new URL(req.url);
  const apply = url.searchParams.get('apply') === '1';
  const offset = Number(url.searchParams.get('offset')) || 0;
  const limit = Number(url.searchParams.get('limit')) || 5;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'storage not configured' }, { status: 500 });
  const sealRes = await fetch(new URL('/seal-youth-busan.png', url.origin));
  const seal = await loadSealRgba(Buffer.from(await sealRes.arrayBuffer()));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = (await getAppConfig('bond_mgmt')) ?? {};
  const targets: Att[] = [];
  for (const rec of Object.values<{ attachments?: { 해임통보?: Att[] } }>(doc.records ?? {})) {
    for (const att of rec.attachments?.해임통보 ?? []) if (att.source === 'generated') targets.push(att);
  }
  targets.sort((a, b) => a.storagePath.localeCompare(b.storagePath));

  const results: Array<Record<string, unknown>> = [];
  let renamed = 0;
  for (const att of targets.slice(offset, offset + limit)) {
    const { data, error } = await admin.storage.from(BOND_BUCKET).download(att.storagePath);
    if (error || !data) {
      results.push({ filename: att.filename, status: 'download-fail', error: error?.message });
      continue;
    }
    const pdf = Buffer.from(await data.arrayBuffer());
    const size = pdf.length;
    const r = await fixNoticeSeal(pdf, seal);
    const nextName = renameNoticeFile(att.filename, att.sentDate);
    const row: Record<string, unknown> = { filename: att.filename, nextName, status: r.status, size };
    if (r.status === 'fixed') {
      if (pdf.length !== size) throw new Error(`length changed: ${att.filename}`);
      row.before = r.before.toString('base64');
      row.after = r.after.toString('base64');
      if (apply) {
        const { error: upErr } = await admin.storage
          .from(BOND_BUCKET)
          .upload(att.storagePath, pdf, { contentType: 'application/pdf', upsert: true });
        row.uploaded = !upErr;
        if (upErr) row.error = upErr.message;
      }
    }
    if (apply && nextName !== att.filename) {
      att.filename = nextName;
      renamed += 1;
    }
    results.push(row);
  }
  if (apply && renamed) await setAppConfig('bond_mgmt', doc);
  return NextResponse.json({ total: targets.length, offset, limit, apply, renamed, results });
}
