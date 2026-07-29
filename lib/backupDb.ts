import postgres from 'postgres';

export type DbBackup = {
  exportedAt: string;
  /** v2: public 스키마 전체 테이블 동적 export */
  version: 2;
  source: 'json-export';
  notes: string[];
  tableCounts: Record<string, number>;
  tables: Record<string, unknown[]>;
};

const SENSITIVE_BY_TABLE: Record<string, string[]> = {
  users: ['pin_hash', 'bluehole_password_enc', 'bluehole_session_cookie'],
};

function createSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  return postgres(connectionString, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 15 });
}

function redactRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const cols = SENSITIVE_BY_TABLE[table];
  if (!cols?.length) return row;
  const out = { ...row };
  for (const col of cols) {
    if (col in out && out[col] != null && out[col] !== '') {
      out[col] = '[REDACTED]';
    }
  }
  return out;
}

function omitMailImages(row: Record<string, unknown>): Record<string, unknown> {
  const images = row.images;
  const count = Array.isArray(images) ? images.length : 0;
  return {
    ...row,
    images: [],
    _imagesOmitted: count > 0,
    _imageCount: count,
  };
}

/** public 스키마 베이스 테이블 목록 (알파벳순) */
export async function listPublicBaseTables(
  sql: ReturnType<typeof postgres> = createSql(),
): Promise<string[]> {
  const rows = await sql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  return rows.map(r => r.table_name);
}

export type ExportBackupOptions = {
  /** true면 우편물 images(JSONB) 포함 — 용량·타임아웃 주의. 기본 false(메타만) */
  includeMailImages?: boolean;
};

/**
 * public 전체 테이블 JSON export.
 * PIN·블루홀 비밀번호·세션 쿠키는 [REDACTED].
 * 우편물 이미지는 기본 제외(CLI에서 includeMailImages로 포함 가능).
 */
export async function exportDatabaseBackup(opts: ExportBackupOptions = {}): Promise<DbBackup> {
  const includeMailImages = opts.includeMailImages === true;
  const sql = createSql();
  const notes: string[] = [
    'JSON 논리 백업입니다. 재해 복구의 본백업은 Supabase 콘솔 백업 또는 pg_dump를 권장합니다.',
    'users.pin_hash / bluehole 자격증명은 [REDACTED] — 복원 후 PIN·블루홀 로그인을 다시 설정해야 합니다.',
  ];
  if (!includeMailImages) {
    notes.push(
      'mail_receipts.images는 용량 때문에 제외되었습니다. 이미지까지 필요하면 CLI: npm run db:backup -- --with-mail-images',
    );
  }

  try {
    const tableNames = await listPublicBaseTables(sql);
    const tables: Record<string, unknown[]> = {};
    const tableCounts: Record<string, number> = {};

    for (const name of tableNames) {
      // table name comes from information_schema — safe to interpolate as identifier
      const rows = await sql.unsafe(`SELECT * FROM "${name.replace(/"/g, '""')}"`);
      let mapped = (rows as Record<string, unknown>[]).map(r => redactRow(name, r));
      if (name === 'mail_receipts' && !includeMailImages) {
        mapped = mapped.map(omitMailImages);
      }
      tables[name] = mapped;
      tableCounts[name] = mapped.length;
    }

    return {
      exportedAt: new Date().toISOString(),
      version: 2,
      source: 'json-export',
      notes,
      tableCounts,
      tables,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
