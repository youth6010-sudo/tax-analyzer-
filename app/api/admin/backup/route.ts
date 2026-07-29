import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { exportDatabaseBackup } from '@/lib/backupDb';

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const includeMailImages = url.searchParams.get('withMailImages') === '1';
    const backup = await exportDatabaseBackup({ includeMailImages });
    const day = backup.exportedAt.slice(0, 10);
    const filename = `tax-analyzer-backup-${day}.json`;
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Backup-Table-Count': String(Object.keys(backup.tables).length),
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'FORBIDDEN') {
      return NextResponse.json({ error: '관리자만 백업할 수 있습니다.' }, { status: 403 });
    }
    if (e instanceof Error && e.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[admin/backup]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '백업에 실패했습니다.' },
      { status: 500 },
    );
  }
}
