import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listInquiries } from '@/lib/workbookDb';

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ items: await listInquiries() });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
