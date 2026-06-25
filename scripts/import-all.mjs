/**
 * 더존·0618id·TP export·청년들 ID 일괄 import
 * node scripts/import-all.mjs [수임처.xlsx] [0618id.xlsx] [연락처.xlsx] [청년들ID.xlsx]
 */
import fs from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const desktop = path.join(process.env.USERPROFILE || '', 'Desktop');
const downloads = path.join(process.env.USERPROFILE || '', 'Downloads');
const SEARCH_DIRS = [desktop, downloads].filter(dir => fs.existsSync(dir));

function findLatestInDirs(matcher) {
  const matches = [];
  for (const dir of SEARCH_DIRS) {
    for (const name of fs.readdirSync(dir)) {
      if (!matcher.test(name)) continue;
      const full = path.join(dir, name);
      matches.push({ full, mtime: fs.statSync(full).mtimeMs });
    }
  }
  matches.sort((a, b) => b.mtime - a.mtime);
  return matches[0]?.full ?? null;
}

function resolveFile(explicit, matcher, fallbackName) {
  if (explicit && fs.existsSync(explicit)) return explicit;
  const latest = findLatestInDirs(matcher);
  if (latest) return latest;
  for (const dir of SEARCH_DIRS) {
    const fallback = path.join(dir, fallbackName);
    if (fs.existsSync(fallback)) return fallback;
  }
  return path.join(desktop, fallbackName);
}

const cli = process.argv.slice(2);
const FILES = {
  suimcheo: resolveFile(cli[0], /^수임처-.*\.xlsx$/i, '수임처-20260618153548.xlsx'),
  youthFees: resolveFile(cli[1], /^(0618id|청년들\s*ID).*\.xlsx$/i, '0618id.1.xlsx'),
  contacts: resolveFile(cli[2], /^연락처-.*\.xlsx$/i, '연락처-20260618153559.xlsx'),
  youthFull: resolveFile(cli[3], /^청년들\s*ID.*\.xlsx$/i, '청년들 ID.xlsx'),
};

for (const [key, filePath] of Object.entries(FILES)) {
  if (!fs.existsSync(filePath)) {
    console.error(`파일을 찾을 수 없습니다 (${key}): ${filePath}`);
    console.error('바탕화면·Downloads에 export 파일을 두거나 경로를 인자로 전달하세요.');
    console.error('  node scripts/import-all.mjs "경로/수임처.xlsx" "경로/0618id.1.xlsx" "경로/연락처.xlsx" "경로/청년들 ID.xlsx"');
    process.exit(1);
  }
}

console.log('Import 파일:');
console.log(`  수임처: ${FILES.suimcheo}`);
console.log(`  0618id (수임료): ${FILES.youthFees}`);
console.log(`  연락처: ${FILES.contacts}`);
console.log(`  청년들 ID (유입·유출): ${FILES.youthFull}`);

function run(label, script, scriptArgs = [], opts = {}) {
  console.log('\n' + '='.repeat(60));
  console.log(`▶ ${label}`);
  console.log('='.repeat(60));
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', script), ...scriptArgs], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0 && !(opts.allowWarnings && r.status === 1)) {
    console.error(`\n✗ ${label} 실패 (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
  if (r.status === 1 && opts.allowWarnings) {
    console.log(`\n⚠ ${label} — 경고 있음 (import는 계속 완료)`);
  }
}

run('1/5 더존 수임처 export', 'import-suimcheo.mjs', ['--replace', FILES.suimcheo]);
run('2/5 0618id 수임료', 'import-youth-workbook.mjs', ['--fees-only', FILES.youthFees]);
run('3/5 TP 연락처 export', 'import-douzone-contacts.mjs', [FILES.contacts]);
run('4/5 청년들 ID (유입·유출)', 'import-youth-workbook.mjs', ['--operational-only', FILES.youthFull]);
run('5/5 검증', 'verify-client-import.mjs', [], { allowWarnings: true });

console.log('\n✓ import-all 완료');
console.log('  미매칭 수임료·미연결 유입/유출 → /admin/fee-link 에서 연결');
