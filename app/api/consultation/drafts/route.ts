import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listConsultationDrafts } from '@/lib/consultationDb';

export async function GET() {
  try {
    const user = await requireUser();
    const items = await listConsultationDrafts(user.name);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
