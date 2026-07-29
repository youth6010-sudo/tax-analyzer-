/**
 * DB public 스키마 JSON 백업 (CLI)
 *
 *   npm run db:backup
 *   npm run db:backup -- ./backups/out.json
 *   npm run db:backup -- --with-mail-images
 *   npm run db:backup -- ./backups/out.json --with-mail-images
 *
 * 미지정 시 Desktop에 tax-analyzer-backup-YYYYMMDD-HHmmss.json 생성.
 * PIN·블루홀 비밀번호는 [REDACTED]. 우편물 이미지는 기본 제외.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

loadEnv();

const args = process.argv.slice(2).filter(a => a !== '--');
const includeMailImages = args.includes('--with-mail-images');
const outArg = args.find(a => !a.startsWith('--'));

const SENSITIVE = {
  users: ['pin_hash', 'bluehole_password_enc', 'bluehole_session_cookie'],
};

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  const tableRows = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const tableNames = tableRows.map(r => r.table_name);
  console.log(`백업 대상 테이블 ${tableNames.length}개${includeMailImages ? ' (우편물 이미지 포함)' : ''}`);

  const tables = {};
  const tableCounts = {};
  for (const name of tableNames) {
    const rows = await sql.unsafe(`SELECT * FROM "${String(name).replace(/"/g, '""')}"`);
    let mapped = rows.map(row => {
      const out = { ...row };
      const cols = SENSITIVE[name];
      if (cols) {
        for (const col of cols) {
          if (out[col] != null && out[col] !== '') out[col] = '[REDACTED]';
        }
      }
      return out;
    });
    if (name === 'mail_receipts' && !includeMailImages) {
      mapped = mapped.map(r => {
        const images = r.images;
        const count = Array.isArray(images) ? images.length : 0;
        return { ...r, images: [], _imagesOmitted: count > 0, _imageCount: count };
      });
    }
    tables[name] = mapped;
    tableCounts[name] = mapped.length;
    console.log(`  ${name}: ${mapped.length}건`);
  }

  const now = new Date();
  const stamp =
    `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` +
    `-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const outPath =
    outArg ||
    path.join(process.env.USERPROFILE || root, 'Desktop', `tax-analyzer-backup-${stamp}.json`);

  const notes = [
    'JSON 논리 백업. 본백업은 Supabase 콘솔 또는 npm run db:backup:dump (pg_dump) 권장.',
    '민감 컬럼 [REDACTED].',
  ];
  if (!includeMailImages) {
    notes.push('mail_receipts.images 제외. 포함: --with-mail-images');
  }

  const payload = {
    exportedAt: now.toISOString(),
    version: 2,
    source: 'json-export',
    notes,
    tableCounts,
    tables,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  const mb = (fs.statSync(outPath).size / (1024 * 1024)).toFixed(2);
  console.log(`\n✓ 백업 저장: ${outPath} (${mb} MB)`);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
