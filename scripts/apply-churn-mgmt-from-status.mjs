import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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

/** 현황표 해임 열 — 코드 → 대기|완료|확정|유예|특수 */
const BY_CODE = {
  '00170': '대기',
  '00155': '완료',
  '00173': '확정',
  '00150': '대기',
  '00234': '대기',
  '01071': '대기',
  '00175': '유예',
  '00166': '대기',
  '00180': '특수',
  '00185': '유예',
  '00229': '완료',
  '01407': '확정',
  '00637': '완료',
  '00208': '대기',
  '01664': '대기',
  '01418': '완료',
  '00159': '확정',
  '00164': '대기',
  '00165': '대기',
  '00121': '대기',
  '00209': '대기',
  '00666': '대기',
  '00645': '대기',
  '01406': '대기',
  '00162': '확정', // 현황표 01162 표기 → DB 코드 00162 해밀한의원
  '01404': '대기',
  '01405': '대기',
  '00151': '대기',
  '00118': '확정',
};

const LABEL_TO_ID = {
  대기: 'pending',
  완료: 'done',
  확정: 'confirmed',
  유예: 'deferred',
  특수: 'special',
};

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql`
    ALTER TABLE arrears_entries
    ADD COLUMN IF NOT EXISTS churn_mgmt_status text NOT NULL DEFAULT ''
  `;

  let updated = 0;
  let missing = [];
  for (const [code, label] of Object.entries(BY_CODE)) {
    const id = LABEL_TO_ID[label];
    if (!id) {
      console.warn('unknown label', code, label);
      continue;
    }
    const rows = await sql`
      UPDATE arrears_entries
      SET churn_mgmt_status = ${id}, updated_at = now()
      WHERE external_code = ${code}
      RETURNING company_name, churn_mgmt_status
    `;
    if (!rows.length) {
      missing.push(code);
      continue;
    }
    updated += 1;
    console.log(`✓ ${code} ${rows[0].company_name} → ${label}`);
  }

  console.log(`\n업데이트 ${updated}/${Object.keys(BY_CODE).length}건`);
  if (missing.length) console.log('미매칭 코드:', missing.join(', '));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
