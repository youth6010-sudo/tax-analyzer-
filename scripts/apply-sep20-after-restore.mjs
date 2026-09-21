/**
 * 8/31 공문 복원 후 — 9/20 현황·거래처별만 반영 (cutoff 8/31 이후만 공문 추가)
 * node --import tsx scripts/apply-sep20-after-restore.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const envPath = path.join(process.cwd(), '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (!m) continue;
  const k = m[1].trim();
  const v = m[2].trim().replace(/^["']|["']$/g, '');
  if (!process.env[k]) process.env[k] = v;
}

const statusPath = 'C:/Users/ADMIN/Downloads/미수수수료 거래처(잔액)현황_26.09.20.xlsx';
const detailPath = 'C:/Users/ADMIN/Downloads/거래처별 현황_20260920.xlsx';

for (const p of [statusPath, detailPath]) {
  if (!fs.existsSync(p)) {
    console.error('missing', p);
    process.exit(1);
  }
}

const { applyStatusImport, applyClientDetailImport } = await import(
  pathToFileURL(path.join(process.cwd(), 'lib/arrearsImportApply.ts')).href
);

console.log('host', new URL(process.env.DATABASE_URL).hostname);

console.log('\n--- status 9/20 ---');
const statusRes = await applyStatusImport(
  fs.readFileSync(statusPath),
  'apply-sep20-after-restore',
  '2026.09.20',
);
console.log(statusRes);

console.log('\n--- detail 9/20 (cutoff frozen 8/31) ---');
const detailRes = await applyClientDetailImport(
  fs.readFileSync(detailPath),
  'apply-sep20-after-restore',
);
console.log(detailRes);
