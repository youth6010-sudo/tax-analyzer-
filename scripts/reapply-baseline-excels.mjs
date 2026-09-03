/**
 * 현황표 + 거래처별 현황 재반영 (공문 letter 유지, cutoff 이후만 추가)
 * node --import tsx scripts/reapply-baseline-excels.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// load .env.local into process.env before importing app modules
const envPath = path.join(process.cwd(), '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (!m) continue;
  const k = m[1].trim();
  const v = m[2].trim().replace(/^["']|["']$/g, '');
  if (!process.env[k]) process.env[k] = v;
}

const statusPath =
  'z:/10_미수관리/미수금 공문 - 26년/미수수수료 거래처(잔액)현황_26.08.31.xls';
const detailPath = 'c:/Users/ADMIN/Downloads/거래처별 현황_20260902.xlsx';

for (const p of [statusPath, detailPath]) {
  if (!fs.existsSync(p)) {
    console.error('missing file', p);
    process.exit(1);
  }
}

const { applyStatusImport, applyClientDetailImport } = await import(
  pathToFileURL(path.join(process.cwd(), 'lib/arrearsImportApply.ts')).href
);

console.log('DATABASE host', new URL(process.env.DATABASE_URL).hostname);

console.log('\n--- status import ---');
const statusBuf = fs.readFileSync(statusPath);
const statusRes = await applyStatusImport(statusBuf, 'reapply-baseline', '2026.08.31');
console.log(statusRes);

console.log('\n--- client detail import (after 2026.07.27) ---');
const detailBuf = fs.readFileSync(detailPath);
const detailRes = await applyClientDetailImport(detailBuf, 'reapply-baseline', '2026.07.27');
console.log(detailRes);
