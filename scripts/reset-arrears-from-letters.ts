/**
 * 미수 전량 초기화 + 담당자 공문 6파일 import
 *
 * Usage: npx tsx scripts/reset-arrears-from-letters.ts
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

import { parseArrearsLetterWorkbookFile } from '../lib/arrearsLetterParse';
import { upsertLetterImport } from '../lib/arrearsLetterDb';
import { wipeAllArrears } from '../lib/arrearsRestart';
import { LETTER_DIR, LETTER_FILES } from '../lib/arrearsStackConfig';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  console.log('1) 미수 테이블 전량 삭제…');
  const wiped = await wipeAllArrears();
  console.log(`   entries ${wiped.entries} · lines ${wiped.lines} · links ${wiped.links}`);

  console.log('2) 공문 6파일 import…');
  let totalSheets = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalLines = 0;

  for (const name of LETTER_FILES) {
    const filePath = path.join(LETTER_DIR, name);
    if (!fs.existsSync(filePath)) {
      console.error('  파일 없음:', filePath);
      process.exit(1);
    }
    const buf = fs.readFileSync(filePath);
    const parsed = parseArrearsLetterWorkbookFile(buf, name);
    const result = await upsertLetterImport(
      parsed.sheets,
      parsed.managerName,
      'letter-reset',
      { unmatchedCreate: true, syncBalance: true },
    );
    totalSheets += parsed.sheets.length;
    totalCreated += result.created;
    totalUpdated += result.updated;
    totalLines += result.totalLines;
    console.log(
      `  ${name}: 시트 ${parsed.sheets.length} · 생성 ${result.created} · 갱신 ${result.updated} · 줄 ${result.totalLines} · 담당 ${parsed.managerName}`,
    );
  }

  console.log('—');
  console.log(
    `완료: 시트 ${totalSheets} · 생성 ${totalCreated} · 갱신 ${totalUpdated} · 줄 ${totalLines}`,
  );
  console.log('다음: npx tsx scripts/rebuild-arrears-stack.ts --apply');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
