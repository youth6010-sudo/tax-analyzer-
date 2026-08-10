/**
 * 거래처원장.xls → arrears_entries + 공문 잔액 맞춤 (API 확정과 동일)
 *
 * Usage: npx tsx scripts/import-arrears-ledger-full.ts [xls경로]
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
import { previewLedgerImport, upsertLedgerImport } from '../lib/arrearsDb';
import {
  applyLedgerLetterDiffsForCodes,
  previewLedgerLetterDiffs,
} from '../lib/arrearsLetterDb';

const file =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || '', 'Desktop', '거래처원장_20260803_151508 미수.xls');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error('파일 없음:', file);
    process.exit(1);
  }

  const host = (() => {
    try {
      return new URL(process.env.DATABASE_URL!).hostname;
    } catch {
      return '(parse-fail)';
    }
  })();
  console.log(`DB host: ${host}`);
  console.log(`파일: ${file}`);

  const buffer = fs.readFileSync(file);
  const ledgerRows = parseLedgerArrearsWorkbook(buffer);
  const asOfDate = asOfDateFromLedgerFilename(path.basename(file));
  console.log(`파싱 ${ledgerRows.length}행 · 기준일 ${asOfDate}`);

  const preview = await previewLedgerImport(ledgerRows);
  const letterPreview = await previewLedgerLetterDiffs(ledgerRows);
  console.log(
    `미리보기: 매칭 ${preview.matched} · 신규 ${preview.newCount} · 원장 밖 유지 ${preview.preserved} · 공문차이 ${letterPreview.letterDiffCount}`,
  );
  if (letterPreview.sample.length) {
    console.log('공문 차이 샘플:');
    for (const s of letterPreview.sample.slice(0, 10)) {
      console.log(
        `  ${s.externalCode} ${s.companyName} 원장=${s.ledgerBalance} 공문=${s.letterBalance} diff=${s.diff}`,
      );
    }
  }

  const actor = 'ledger-import';
  const result = await upsertLedgerImport(ledgerRows, asOfDate, actor);
  console.log(
    `잔액 반영: 갱신 ${result.updated} · 신규 ${result.inserted} · 원장 밖 유지 ${result.preserved}`,
  );

  const letterSync = await applyLedgerLetterDiffsForCodes(ledgerRows, asOfDate, actor);
  console.log(`공문 맞춤 적용: ${letterSync.applied}건`);
  console.log('완료');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
