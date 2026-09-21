/**
 * 현황표 잔액 = 거래처별 말잔인 업체만 공문합 맞춤 (이미 업로드된 9/20 파일 기준)
 * node --import tsx scripts/align-letters-to-sep20-endings.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const { parseArrearsClientDetailEndings } = await import('../lib/arrearsClientDetailParse.ts');
const {
  alignLettersToMatchingEndings,
  reconcileLetterOpenToTarget,
} = await import('../lib/arrearsImportApply.ts');
const { getDb } = await import('../db/index.ts');
const { arrearsEntries, arrearsLetterLines } = await import('../db/schema.ts');
const { sql, inArray, eq } = await import('drizzle-orm');
const { classifyBalanceDiff } = await import('../lib/arrearsBalanceDiff.ts');
const { letterBalanceFromLines } = await import('../app/types/arrears.ts');
const { listLetterLines } = await import('../lib/arrearsLetterDb.ts');

const detailPath = 'C:/Users/ADMIN/Downloads/거래처별 현황_20260920.xlsx';
const endings = parseArrearsClientDetailEndings(fs.readFileSync(detailPath));

// 창동처럼 이미 맞았는데 9월 입금만 들어가 어긋난 건:
// 맞춤 줄 넣기 전에, ending===bal 이고 최근 payment만으로 어긋난 경우 되돌리진 않고
// alignLettersToMatchingEndings가 처리.
const aligned = await alignLettersToMatchingEndings('align-sep20-endings', endings);
console.log('aligned', aligned);

const db = getDb();
const entries = await db.select().from(arrearsEntries);
const ids = entries.map(e => e.id);
const openBy = new Map();
const letterBy = new Map();
for (let i = 0; i < ids.length; i += 200) {
  const slice = ids.slice(i, i + 200);
  const rows = await db
    .select({
      id: arrearsLetterLines.arrearsEntryId,
      total: sql`coalesce(sum(${arrearsLetterLines.amount} - ${arrearsLetterLines.paidAmount}), 0)`,
      hasLetter: sql`bool_or(${arrearsLetterLines.source} = 'letter')`,
    })
    .from(arrearsLetterLines)
    .where(inArray(arrearsLetterLines.arrearsEntryId, slice))
    .groupBy(arrearsLetterLines.arrearsEntryId);
  for (const r of rows) {
    openBy.set(r.id, Math.round(Number(r.total) || 0));
    letterBy.set(r.id, Boolean(r.hasLetter));
  }
}

let shouldLeft = 0;
let excelMis = 0;
let zeroLeft = 0;
let ok = 0;
let ledgerOnly = 0;
const leftSamples = [];
for (const e of entries) {
  const bal = Math.round(e.balance);
  const open = openBy.get(e.id) ?? 0;
  const end = endings[e.externalCode];
  const kind = classifyBalanceDiff({
    ledgerBalance: bal,
    linesOpen: open,
    hasLetter: letterBy.get(e.id) === true,
  });
  const diff = bal - open;
  if (kind === 'ok' || diff === 0) {
    ok++;
    continue;
  }
  if (kind === 'ledger_only') {
    ledgerOnly++;
    continue;
  }
  if (end != null && Math.round(end) === bal) {
    shouldLeft++;
    leftSamples.push({ code: e.externalCode, name: e.companyName, bal, open, diff });
  } else if (bal === 0) zeroLeft++;
  else excelMis++;
}
leftSamples.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
console.log(
  JSON.stringify(
    {
      ok,
      ledgerOnly,
      shouldMatchStillBroken: shouldLeft,
      excelMismatchRemain: excelMis,
      zeroStatusLeftover: zeroLeft,
      leftSamples: leftSamples.slice(0, 10),
    },
    null,
    2,
  ),
);

// spot-check
for (const code of ['00170', '00212', '01206']) {
  const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, code)).limit(1);
  if (!e) continue;
  const lines = await listLetterLines(e.id);
  console.log(code, 'bal', e.balance, 'open', letterBalanceFromLines(lines), 'end', endings[code]);
}
