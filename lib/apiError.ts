import { NextResponse } from 'next/server';

const STATUS_MESSAGES: Record<string, { status: number; error: string }> = {
  UNAUTHORIZED: { status: 401, error: 'Unauthorized' },
  FORBIDDEN: { status: 403, error: 'Forbidden' },
  NOT_FOUND: { status: 404, error: 'Not found' },
  CONFLICT: { status: 409, error: '다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도해 주세요.' },
  COMPANY_NAME_REQUIRED: { status: 400, error: '업체명은 필수입니다.' },
  VALIDATION_ERROR: { status: 400, error: 'Invalid request' },
};

export function handleApiError(e: unknown): NextResponse {
  if (e instanceof Error) {
    const mapped = STATUS_MESSAGES[e.message];
    if (mapped) {
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }
  }
  console.error(e);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
