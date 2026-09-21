/**
 * 08.31 고정본 재구성 → 9월만 추가
 *
 * 1) Neon 공문 복원 (8월까지 원본)
 * 2) 8/31 엑셀에 없는 가짜 7·8월 제거
 * 3) 9월~ 월기장 줄 제거 (있다면)
 * 4) 08.31 현황표로 잔액 고정
 * 5) 9/20 현황 + 거래처별만 추가
 *
 * node --import tsx scripts/rebuild-aug31-then-sep20.mjs [--dry]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function run(cmd, args) {
  console.log('\n>', cmd, args.join(' '));
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 20 * 1024 * 1024 });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error(`failed: ${cmd} ${args.join(' ')} (exit ${r.status})`);
}

const status31 = 'C:/Users/ADMIN/Downloads/미수수수료 거래처(잔액)현황_26.08.31.xlsx';
const detail31 = 'C:/Users/ADMIN/Downloads/거래처별 현황_20260831.xlsx';
const status20 = 'C:/Users/ADMIN/Downloads/미수수수료 거래처(잔액)현황_26.09.20.xlsx';
const detail20 = 'C:/Users/ADMIN/Downloads/거래처별 현황_20260920.xlsx';

for (const p of [status31, detail31, status20, detail20]) {
  if (!fs.existsSync(p)) throw new Error(`missing ${p}`);
}

if (DRY) {
  console.log('DRY — would rebuild aug31 then sep20');
  process.exit(0);
}

// 1) Neon 전체 공문 복원
run('node', ['scripts/restore-all-letters-from-neon.mjs']);

// 2) 가짜 7·8월 제거
run('node', ['--import', 'tsx', 'scripts/strip-jul-aug-not-in-aug31-excel.mjs', '--apply']);

// 3~5) TS 모듈로 9월 줄 제거 + 08.31 잔액 + 9/20 반영
const { getDb } = await import(pathToFileURL(path.join(root, 'db/index.ts')).href);
const { arrearsEntries } = await import(pathToFileURL(path.join(root, 'db/schema.ts')).href);
const { listLetterLines, replaceLetterLines } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsLetterDb.ts')).href
);
const { letterBalanceFromLines } = await import(pathToFileURL(path.join(root, 'app/types/arrears.ts')).href);
const { applyStatusImport, applyClientDetailImport, isPostCutoffLetterMonth } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsImportApply.ts')).href
);
const { ARREARS_FROZEN_LETTER_CUTOFF } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsImportConfig.ts')).href
);
const { parseArrearsStatusWorkbook } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsStatusParse.ts')).href
);
const { eq } = await import('drizzle-orm');

const cutoff = ARREARS_FROZEN_LETTER_CUTOFF;
const db = getDb();

console.log('\n--- strip post-cutoff (9월~) month lines ---');
const entries = await db.select().from(arrearsEntries);
let strippedSep = 0;
for (const e of entries) {
  const lines = await listLetterLines(e.id);
  const next = lines
    .filter(l => {
      if (/현황맞춤|말잔맞춤/.test(String(l.description || '').replace(/\s+/g, ''))) return false;
      if (isPostCutoffLetterMonth(l.description, cutoff)) return false;
      return true;
    })
    .map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || '',
      source: l.source,
    }));
  if (next.length === lines.length) continue;
  await replaceLetterLines(e.id, 'rebuild-aug31-strip-sep', next, { syncBalance: false });
  strippedSep += 1;
}
console.log('entries stripped of 9월~ lines', strippedSep);

console.log('\n--- apply 08.31 status (freeze balances) ---');
const s31 = await applyStatusImport(fs.readFileSync(status31), 'rebuild-aug31-freeze', '2026.08.31');
console.log(s31);

// 08.31 정합 리포트
const statusParsed = parseArrearsStatusWorkbook(fs.readFileSync(status31));
const byCode = new Map(statusParsed.rows.map(r => [r.externalCode, Math.round(r.balance)]));
let ok = 0;
let bad = 0;
const badSamples = [];
for (const e of await db.select().from(arrearsEntries)) {
  const want = byCode.get(e.externalCode);
  if (want == null) continue;
  const lines = await listLetterLines(e.id);
  const open = letterBalanceFromLines(lines);
  const bal = Math.round(e.balance);
  if (bal === want && open === want) ok += 1;
  else {
    bad += 1;
    if (badSamples.length < 20) {
      badSamples.push({
        code: e.externalCode,
        name: e.companyName,
        status31: want,
        bal,
        open,
        diffOpen: open - want,
      });
    }
  }
}
console.log('\n=== AUG31 FREEZE CHECK ===', { ok, bad, badSamples });

console.log('\n--- apply 9/20 status + detail (only after freeze) ---');
const s20 = await applyStatusImport(fs.readFileSync(status20), 'rebuild-sep20', '2026.09.20');
console.log(s20);
const d20 = await applyClientDetailImport(fs.readFileSync(detail20), 'rebuild-sep20');
console.log(d20);

// 최종: 7·8월 유지 여부
const { sql } = await import('drizzle-orm');
const { arrearsLetterLines } = await import(pathToFileURL(path.join(root, 'db/schema.ts')).href);
const agg = await db.execute(sql`
  SELECT
    (SELECT count(*)::int FROM arrears_letter_lines WHERE description ~ '2026년\\s*7월|2026년7월|26년\\s*7월|26년7월') AS julish,
    (SELECT count(*)::int FROM arrears_letter_lines WHERE description ~ '2026년\\s*8월|2026년8월|26년\\s*8월|26년8월') AS augish,
    (SELECT count(*)::int FROM arrears_letter_lines WHERE description ~ '2026년\\s*9월|2026년9월|26년\\s*9월|26년9월') AS sepish
`);
console.log('month agg', agg.rows?.[0] ?? agg[0]);

for (const code of ['01407', '00208', '00170', '00173']) {
  const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, code)).limit(1);
  if (!e) continue;
  const lines = await listLetterLines(e.id);
  const open = letterBalanceFromLines(lines);
  console.log(code, e.companyName, 'bal', e.balance, 'open', open, 'diff', Math.round(e.balance) - open, 'n', lines.length);
}

console.log('\ndone');
