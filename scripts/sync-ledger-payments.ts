/**
 * 거래처원장 upsert (잔액·입금 요약) — 내역과 다르면 불일치로 남김 (자동 원장반영 없음)
 *
 *   npx tsx scripts/sync-ledger-payments.ts
 *   npx tsx scripts/sync-ledger-payments.ts "c:\path\거래처원장.xls"
 *
 * 공문 letter: 행 병합까지 필요하면 apply-arrears-ledger-with-links.ts
 * 또는 전체 3단: rebuild-arrears-stack.ts --apply
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const envPath = path.join(root, name);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

import {
  asOfDateFromLedgerFilename,
  parseLedgerArrearsWorkbook,
} from '../lib/arrearsLedgerParse';
import { upsertLedgerImport } from '../lib/arrearsDb';
import { listLedgerBalanceMismatches } from '../lib/arrearsLetterDb';
import { DEFAULT_LEDGER_PATH } from '../lib/arrearsStackConfig';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  const file = process.argv[2] || DEFAULT_LEDGER_PATH;
  if (!fs.existsSync(file)) {
    console.error('파일 없음:', file);
    process.exit(1);
  }

  const buf = fs.readFileSync(file);
  const rows = parseLedgerArrearsWorkbook(buf);
  const asOfDate = asOfDateFromLedgerFilename(path.basename(file));
  const actor = 'ledger-sync';

  console.log(`원장 ${rows.length}행 · 기준일 ${asOfDate}`);
  console.log(`파일: ${file}`);

  const upsert = await upsertLedgerImport(rows, asOfDate, actor);
  console.log(
    `원장 upsert — 갱신 ${upsert.updated} · 신규 ${upsert.inserted} · 매칭 ${upsert.matched} · 미매칭 ${upsert.unmatched}`,
  );

  const mismatches = await listLedgerBalanceMismatches({ limit: 20 });
  console.log(`잔액불일치 ${mismatches.count}업체 (자동 원장반영 안 함)`);
  for (const m of mismatches.items) {
    console.log(
      `  - ${m.companyName} (${m.externalCode}): 원장 ${m.ledgerBalance.toLocaleString('ko-KR')} · 내역 ${m.linesOpen.toLocaleString('ko-KR')} · 차 ${m.diff.toLocaleString('ko-KR')}`,
    );
  }

  const withCredit = rows.filter(r => r.credit > 0);
  const withBalance = rows.filter(r => r.balance !== 0);
  console.log(`— 대변(입금) 있는 행 ${withCredit.length} · 잔액≠0 ${withBalance.length}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
