import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { createIntakeClient } from '@/lib/clientsDb';

export async function POST() {
  try {
    const user = await requireUser();
    const client = await createIntakeClient(user.id, user.name);
    return NextResponse.json({ client }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
