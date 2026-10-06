import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { canManageArrears } from '@/lib/arrearsAccess';
import { handleApiError } from '@/lib/apiError';
import {
  addBondAttachment,
  assertCanEditBond,
  findBondAttachment,
  isBondStep,
  readBondRecords,
  removeBondAttachment,
} from '@/lib/bondMgmtDb';
import {
  bondFileExists,
  bondMimeAllowed,
  buildBondStoragePath,
  createBondUploadUrl,
  removeBondFile,
  signBondFileUrl,
} from '@/lib/bondStorage';
import {
  BOND_ATTACHMENT_STEPS,
  type BondAttachment,
  type BondAttachmentStepKey,
  type BondRecordPatch,
} from '@/app/types/bond';

export const runtime = 'nodejs';

const NO_STORE = { headers: { 'Cache-Control': 'private, no-store' } } as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SIZE = 20 * 1024 * 1024;

function errorResponse(e: unknown) {
  const msg = e instanceof Error ? e.message : '';
  if (msg === 'FORBIDDEN') {
    return NextResponse.json({ error: '본인 담당 업체만 수정할 수 있습니다.' }, { status: 403 });
  }
  if (msg === 'NOT_FOUND') {
    return NextResponse.json({ error: '미수관리 항목을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (msg === 'LOCKED') {
    return NextResponse.json(
      { error: '문서번호가 붙은 해임통보 안내문은 삭제할 수 없습니다. 이력관리에서 수정하세요.' },
      { status: 400 },
    );
  }
  if (msg === 'BAD_STEP') {
    return NextResponse.json({ error: '단계(step)가 올바르지 않습니다.' }, { status: 400 });
  }
  return handleApiError(e);
}

function parseStep(v: unknown): BondAttachmentStepKey {
  if (!isBondStep(v)) throw new Error('BAD_STEP');
  return v;
}

/** 보기/다운로드용 서명 URL: ?id=&step=&attachmentId=&download=1 */
export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const id = url.searchParams.get('id') || '';
    const step = parseStep(url.searchParams.get('step'));
    const attachmentId = url.searchParams.get('attachmentId') || '';
    const att = findBondAttachment(await readBondRecords(), id, step, attachmentId);
    if (!att) return NextResponse.json({ error: '첨부파일을 찾을 수 없습니다.' }, { status: 404 });
    const signed = await signBondFileUrl(
      att.storagePath,
      url.searchParams.get('download') === '1' ? att.filename : undefined,
    );
    return NextResponse.json({ url: signed }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}

/** 1단계: 업로드용 서명 URL 발급 (브라우저 → Supabase 직접 업로드, Vercel 본문 4.5MB 제한 회피) */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      step?: string;
      filename?: string;
      mimeType?: string;
      size?: number;
    };
    const id = String(body.id || '');
    const step = parseStep(body.step);
    const mimeType = String(body.mimeType || '');
    const size = Number(body.size) || 0;
    if (!bondMimeAllowed(mimeType)) {
      return NextResponse.json({ error: 'PDF 또는 이미지 파일만 올릴 수 있습니다.' }, { status: 400 });
    }
    if (size > MAX_SIZE) {
      return NextResponse.json({ error: '파일은 20MB 이하만 올릴 수 있습니다.' }, { status: 400 });
    }
    await assertCanEditBond(id, user, canManageArrears(user));

    const fileId = crypto.randomUUID();
    const storagePath = buildBondStoragePath(
      id,
      BOND_ATTACHMENT_STEPS.indexOf(step),
      fileId,
      String(body.filename || ''),
      mimeType,
    );
    const { signedUrl, token } = await createBondUploadUrl(storagePath);
    return NextResponse.json({ fileId, storagePath, signedUrl, token }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}

/** 2단계: 업로드 완료 후 메타 저장 (+ 단계 날짜 동시 갱신 가능) */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      step?: string;
      fileId?: string;
      storagePath?: string;
      filename?: string;
      mimeType?: string;
      size?: number;
      sentDate?: string;
      source?: string;
      patch?: BondRecordPatch;
    };
    const id = String(body.id || '');
    const step = parseStep(body.step);
    await assertCanEditBond(id, user, canManageArrears(user));

    const storagePath = String(body.storagePath || '');
    if (!storagePath.startsWith(`${id}/`) || !(await bondFileExists(storagePath))) {
      return NextResponse.json({ error: '업로드된 파일을 찾을 수 없습니다.' }, { status: 400 });
    }
    const sentDate = String(body.sentDate || '');
    const att: BondAttachment = {
      id: String(body.fileId || crypto.randomUUID()),
      filename: String(body.filename || '첨부파일').replace(/[\\/:*?"<>|]/g, '').slice(0, 200),
      storagePath,
      size: Number(body.size) || 0,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.name,
      sentDate: DATE_RE.test(sentDate) ? sentDate : '',
      mimeType: String(body.mimeType || 'application/pdf'),
      source: body.source === 'generated' ? 'generated' : 'manual',
    };
    const records = await addBondAttachment(id, step, att, user, body.patch);
    return NextResponse.json({ records, attachment: att }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}

/** 첨부 삭제: ?id=&step=&attachmentId= */
export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const id = url.searchParams.get('id') || '';
    const step = parseStep(url.searchParams.get('step'));
    await assertCanEditBond(id, user, canManageArrears(user));
    const { records, removed } = await removeBondAttachment(
      id,
      step,
      url.searchParams.get('attachmentId') || '',
      user,
    );
    if (removed) {
      await removeBondFile(removed.storagePath).catch(e => console.warn('bond file remove failed', e));
    }
    return NextResponse.json({ records }, NO_STORE);
  } catch (e) {
    return errorResponse(e);
  }
}
