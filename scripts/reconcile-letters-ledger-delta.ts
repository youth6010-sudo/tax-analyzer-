/**
 * 1) 담당자별 7월 공문 xls로 상세 내역 재반영 (잔액은 건드리지 않음)
 * 2) 8/11 원장 대비 차액만 「원장반영」한 줄로 붙인 뒤 entry.balance = 원장
 *
 * Usage:
 *   npx tsx scripts/reconcile-letters-ledger-delta.ts
 *   npx tsx scripts/reconcile-letters-ledger-delta.ts "z:/10_미수관리/미수금 공문 - 26년" "c:/Users/.../거래처원장_....xls"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ilike } from 'drizzle-orm';

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

import { getDb } from '../db';
import { arrearsEntries } from '../db/schema';
import { parseArrearsLetterWorkbookFile } from '../lib/arrearsLetterParse';
import {
  applyLedgerLetterDiffsForCodes,
  upsertLetterImport,
} from '../lib/arrearsLetterDb';
import {
  asOfDateFromLedgerFilename,
  parseLedgerArrearsWorkbook,
} from '../lib/arrearsLedgerParse';
import { upsertLedgerImport } from '../lib/arrearsDb';

const MANAGERS = ['인디', '다야', '리아', '블루', '윈터', '페리'] as const;

function managerFromFilename(name: string): string {
  for (const key of MANAGERS) {
    if (name.includes(key)) return key;
  }
  return '';
}

function listLetterFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!/\.xls[x]?$/i.test(f)) continue;
    if (!f.includes('미수수수료')) continue;
    if (f.includes('현황')) continue;
    if (!managerFromFilename(f)) continue;
    out.push(path.join(dir, f));
  }
  return out.sort();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }

  const letterDir =
    process.argv[2] || path.join('z:', '10_미수관리', '미수금 공문 - 26년');
  const ledgerFile =
    process.argv[3] ||
    path.join(process.env.USERPROFILE || '', 'Desktop', '거래처원장_20260811_144759.xls');

  if (!fs.existsSync(letterDir)) {
    console.error('공문 폴더 없음:', letterDir);
    process.exit(1);
  }
  if (!fs.existsSync(ledgerFile)) {
    console.error('원장 파일 없음:', ledgerFile);
    process.exit(1);
  }

  const files = listLetterFiles(letterDir);
  console.log(`공문 파일 ${files.length}개 · 폴더 ${letterDir}`);
  if (!files.length) {
    console.error('담당자 공문 xls 없음');
    process.exit(1);
  }

  const actor = 'reconcile-letter-ledger';
  let letterUpdated = 0;
  let letterLines = 0;
  let letterSkipped = 0;

  for (const filePath of files) {
    const base = path.basename(filePath);
    const managerName = managerFromFilename(base);
    const buf = fs.readFileSync(filePath);
    const parsed = parseArrearsLetterWorkbookFile(buf, base);
    console.log(`파일: ${base} · 시트 ${parsed.sheets.length} · 담당 ${managerName || '(미상)'}`);
    if (!parsed.sheets.length) continue;

    const result = await upsertLetterImport(parsed.sheets, managerName, actor, {
      syncBalance: false, // 원장 잔액 유지
      unmatchedCreate: false,
    });
    letterUpdated += result.updated;
    letterLines += result.totalLines;
    letterSkipped += result.skipped;
    console.log(
      `  → 반영 ${result.updated}, 미매칭 ${result.skipped}, 라인 ${result.totalLines}`,
    );
  }

  console.log(
    `공문 재깔기 합계: 반영 ${letterUpdated}, 미매칭 ${letterSkipped}, 라인 ${letterLines}`,
  );

  // 원장 잔액 다시 맞추기 (공문 줄은 안 건드림)
  const ledgerBuf = fs.readFileSync(ledgerFile);
  const ledgerRows = parseLedgerArrearsWorkbook(ledgerBuf);
  const asOfDate = asOfDateFromLedgerFilename(path.basename(ledgerFile));
  console.log(`원장: ${path.basename(ledgerFile)} · ${ledgerRows.length}행 · 기준 ${asOfDate}`);

  const ledgerResult = await upsertLedgerImport(ledgerRows, asOfDate, actor);
  console.log(
    `원장 잔액: 갱신 ${ledgerResult.updated} · 신규 ${ledgerResult.inserted} · 유지 ${ledgerResult.preserved}`,
  );

  // 상세 공문 위 차액만 붙이기
  const delta = await applyLedgerLetterDiffsForCodes(ledgerRows, asOfDate, actor);
  console.log(`원장반영(차액) 줄: ${delta.applied}건`);

  // 샘플 점검
  const db = getDb();
  const { listLetterLines } = await import('../lib/arrearsLetterDb');
  for (const q of ['%솔코리아%', '%팀코리아%']) {
    const hits = await db
      .select({
        companyName: arrearsEntries.companyName,
        balance: arrearsEntries.balance,
        letterDate: arrearsEntries.letterDate,
        id: arrearsEntries.id,
      })
      .from(arrearsEntries)
      .where(ilike(arrearsEntries.companyName, q))
      .limit(5);
    for (const h of hits) {
      const lines = await listLetterLines(h.id);
      console.log(
        `샘플 ${h.companyName}: 잔액=${h.balance}, 공문일=${h.letterDate || '-'}, 줄수=${lines.length}, 앞=${lines
          .slice(0, 3)
          .map(l => l.description)
          .join(' | ')}, 끝=${lines
          .slice(-2)
          .map(l => `${l.description}(+${l.amount}/-${l.paidAmount})`)
          .join(' | ')}`,
      );
    }
  }

  console.log('완료');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
