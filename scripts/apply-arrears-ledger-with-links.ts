/**
 * 원장 upsert + 공문↔원장 링크로 공문 상세 부착
 *
 * Usage: npx tsx scripts/apply-arrears-ledger-with-links.ts [원장xls경로]
 *
 * 전체 3단 재구성은 rebuild-arrears-stack.ts --apply 권장.
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
import { applyLedgerWithLetterLinks } from '../lib/arrearsRestart';
import { DEFAULT_LEDGER_PATH } from '../lib/arrearsStackConfig';

const file = process.argv[2] || DEFAULT_LEDGER_PATH;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error('파일 없음:', file);
    process.exit(1);
  }

  const buf = fs.readFileSync(file);
  const ledgerRows = parseLedgerArrearsWorkbook(buf);
  const asOfDate = asOfDateFromLedgerFilename(path.basename(file));
  console.log(`원장 ${ledgerRows.length}행 · 기준일 ${asOfDate}`);
  console.log(`파일: ${file}`);

  const result = await applyLedgerWithLetterLinks({
    ledgerRows,
    asOfDate,
    actorName: 'ledger-apply-links',
    keepUnmatchedLetters: !process.argv.includes('--drop-unmatched'),
  });

  console.log('—');
  console.log(
    `원장 갱신 ${result.ledgerUpdated} · 신규 ${result.ledgerInserted}`,
  );
  console.log(
    `공문 부착 ${result.attached} · 제외 ${result.skipped} · 미연결유지 ${result.keptUnmatched} · orphan삭제 ${result.deletedOrphans} · 실패 ${result.failed}`,
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
