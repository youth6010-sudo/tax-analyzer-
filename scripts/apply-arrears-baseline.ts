/**
 * 현황표 + 거래처별 상세 baseline 일괄 반영
 * npx tsx scripts/apply-arrears-baseline.ts [--status path] [--detail path]
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
  applyClientDetailImport,
  applyStatusImport,
} from '../lib/arrearsImportApply';

const DEFAULT_STATUS =
  'z:/10_미수관리/미수금 공문 - 26년/미수수수료 거래처(잔액)현황_26.08.31.xls';
const DEFAULT_DETAIL = String.raw`c:\Users\ADMIN\Downloads\거래처별 현황_20260902.xlsx`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const statusPath = arg('--status') || DEFAULT_STATUS;
  const detailPath = arg('--detail') || DEFAULT_DETAIL;

  if (!fs.existsSync(statusPath)) throw new Error(`현황표 없음: ${statusPath}`);
  if (!fs.existsSync(detailPath)) throw new Error(`상세 없음: ${detailPath}`);

  console.log('1) 현황표', statusPath);
  const statusBuf = fs.readFileSync(statusPath);
  const s = await applyStatusImport(statusBuf, 'apply-baseline', '2026.08.31');
  console.log('  updated', s.updated, 'inserted', s.inserted, 'total', s.totalBalance.toLocaleString('ko-KR'));

  console.log('2) 거래처별 상세', detailPath);
  const detailBuf = fs.readFileSync(detailPath);
  const d = await applyClientDetailImport(detailBuf, 'apply-baseline', '2026.07.27');
  console.log('  applied', d.applied, 'linesAdded', d.linesAdded, 'skippedInactive', d.skippedInactive);

  console.log('done');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
