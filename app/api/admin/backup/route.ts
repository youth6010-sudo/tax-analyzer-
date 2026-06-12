import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { exportDatabaseBackup } from '@/lib/backupDb';

export async function GET() {
  try {
    await requireAdmin();
    const backup = await exportDatabaseBackup();
    const filename = `tax-analyzer-backup-${backup.exportedAt.slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: '관리자만 백업할 수 있습니다.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
