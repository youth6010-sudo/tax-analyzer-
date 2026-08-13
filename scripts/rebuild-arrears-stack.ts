/**
 * 미수 3단 레이어 재구성 CLI
 *
 *   npx tsx scripts/rebuild-arrears-stack.ts --preview
 *   npx tsx scripts/rebuild-arrears-stack.ts --apply
 *   npx tsx scripts/rebuild-arrears-stack.ts --apply --ledger="c:\...\거래처원장.xls"
 *
 * 배포/푸시 없음. DATABASE_URL(.env.local)에 반영.
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

import { DEFAULT_LEDGER_PATH } from '../lib/arrearsStackConfig';
import {
  formatStackRebuildReport,
  rebuildArrearsStack,
} from '../lib/arrearsStackRebuild';

function argValue(flag: string): string | undefined {
  const eq = process.argv.find(a => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1]!.startsWith('-')) {
    return process.argv[idx + 1];
  }
  return undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  // --apply가 있으면 반영, 없으면(--preview 포함) dryRun
  const isDryRun = !process.argv.includes('--apply');

  const ledgerPath = argValue('--ledger') || DEFAULT_LEDGER_PATH;
  const letterDir = argValue('--letter-dir');
  const taxDir = argValue('--tax-dir');
  const dropUnmatched = process.argv.includes('--drop-unmatched');

  console.log(
    isDryRun
      ? '미리보기 모드 (DB 변경 없음). 반영하려면 --apply'
      : 'APPLY 모드 — 공문 → 원장병합 → 원장상세PDF → 세금계산서(보충) → 잔액불일치',
  );

  const report = await rebuildArrearsStack({
    actorName: 'stack-rebuild',
    ledgerPath,
    letterDir: letterDir || undefined,
    taxDir: taxDir || undefined,
    keepUnmatchedLetters: !dropUnmatched,
    dryRun: isDryRun,
  });

  console.log(formatStackRebuildReport(report));

  if (report.missingFiles.length) {
    console.error('\n파일 누락으로 중단했습니다.');
    process.exit(1);
  }

  if (isDryRun) {
    console.log('\n다음: npx tsx scripts/rebuild-arrears-stack.ts --apply');
  } else {
    console.log('\n완료. 「연결필요」 잔여 건은 포털에서 수동 연결하세요.');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
