/**
 * TP export 3파일 일괄 import
 * node scripts/import-all.mjs
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');

const FILES = {
  suimcheo: path.join(desktop, '수임처-20260612.xlsx'),
  youth: path.join(desktop, '청년들 ID.xlsx'),
  contacts: path.join(desktop, '연락처-20260615105259.xlsx'),
};

function run(label, script, scriptArgs = []) {
  console.log('\n' + '='.repeat(60));
  console.log(`▶ ${label}`);
  console.log('='.repeat(60));
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...scriptArgs], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`\n✗ ${label} 실패 (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

run('1/4 TP 수임처 export', 'import-suimcheo.mjs', ['--replace', FILES.suimcheo]);
run('2/4 청년들 ID (link-only)', 'import-youth-workbook.mjs', ['--link-only', FILES.youth]);
run('3/4 TP 연락처 export', 'import-douzone-contacts.mjs', [FILES.contacts]);
run('4/4 검증', 'verify-client-import.mjs');

console.log('\n✓ import-all 완료');
