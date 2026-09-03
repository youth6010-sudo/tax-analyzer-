/**
 * 현황표 관리분류만 빠른 동기화 (잔액은 유지)
 * npx tsx scripts/sync-status-mgmt-only.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

import { getDb } from '../db';
import { arrearsEntries } from '../db/schema';
import { parseArrearsStatusWorkbook } from '../lib/arrearsStatusParse';

async function main() {
  const buf = fs.readFileSync(
    'z:/10_미수관리/미수금 공문 - 26년/미수수수료 거래처(잔액)현황_26.08.31.xls',
  );
  const { rows } = parseArrearsStatusWorkbook(buf);
  const db = getDb();
  let changed = 0;
  let skippedEmpty = 0;
  let same = 0;
  for (const row of rows) {
    if (!row.mgmtCategory) {
      skippedEmpty += 1;
      continue;
    }
    const [prev] = await db
      .select({ id: arrearsEntries.id, mgmtCategory: arrearsEntries.mgmtCategory })
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, row.externalCode))
      .limit(1);
    if (!prev) continue;
    if ((prev.mgmtCategory || '') === row.mgmtCategory) {
      same += 1;
      continue;
    }
    await db
      .update(arrearsEntries)
      .set({
        mgmtCategory: row.mgmtCategory,
        updatedBy: 'sync-status-mgmt',
        updatedAt: new Date(),
      })
      .where(eq(arrearsEntries.id, prev.id));
    changed += 1;
    console.log(
      `${row.externalCode} ${row.companyName}: ${prev.mgmtCategory || '(없음)'} → ${row.mgmtCategory}`,
    );
  }
  console.log({ changed, same, skippedEmpty, total: rows.length });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
