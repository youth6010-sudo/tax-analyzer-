/**
 * 저번주 확정본 기준: 공문합이 08.31 현황보다 크면
 * 끝의 미납 월기장(7·8월 등)만 제거해 맞춤. 조정료·성실 등 비월 줄은 유지.
 *
 * Neon 통째 복원으로 생긴 초과분만 정리 — 부족한 쪽은 가짜 줄로 채우지 않음.
 *
 * node --import tsx scripts/trim-letter-open-to-aug31.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

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

const { parseArrearsStatusWorkbook } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsStatusParse.ts')).href
);
const { getDb } = await import(pathToFileURL(path.join(root, 'db/index.ts')).href);
const { arrearsEntries } = await import(pathToFileURL(path.join(root, 'db/schema.ts')).href);
const { listLetterLines, replaceLetterLines } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsLetterDb.ts')).href
);
const { letterBalanceFromLines } = await import(
  pathToFileURL(path.join(root, 'app/types/arrears.ts')).href
);
const { isArrearsLetterProtected } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsBalanceLock.ts')).href
);
const { hasUnpaidMonthBookkeepingOnLetter } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsImportApply.ts')).href
);

const augFile = 'C:/Users/ADMIN/Downloads/미수수수료 거래처(잔액)현황_26.08.31.xlsx';
const augParsed = parseArrearsStatusWorkbook(fs.readFileSync(augFile));
const aug = new Map(
  augParsed.rows.map(r => [String(r.externalCode).padStart(5, '0'), Math.round(r.balance)]),
);

function isTrimableMonthDesc(desc) {
  const d = String(desc || '').replace(/\s+/g, '');
  // Neon 복원으로 다시 붙은 가짜·초과 월만 — 2026년 7·8월(및 9월~)
  // 그 이전 월·조정료·성실 등은 저번주 확정본이므로 절대 제거하지 않음
  const m = d.match(/(20\d{2}|\d{2})년(?:기타수수료|기장료|기장수수료)?(\d{1,2})월/);
  if (!m) return false;
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  const mo = Number(m[2]);
  if (y > 2026) return true;
  if (y === 2026 && mo >= 7) return true;
  return false;
}

const db = getDb();
const entries = await db.select().from(arrearsEntries);
const report = [];
let trimmed = 0;

for (const e of entries) {
  const code = String(e.externalCode || '').padStart(5, '0');
  if (isArrearsLetterProtected(code)) continue;
  if (!aug.has(code)) continue;
  const target = aug.get(code);
  const lines = await listLetterLines(e.id);
  // 중간에 기장 미납이 있으면 7·8월 매출·입금 쌍을 지우면 안 됨 (도리F&B·훈테크형)
  if (hasUnpaidMonthBookkeepingOnLetter(lines)) continue;
  let open = letterBalanceFromLines(lines);
  if (open <= target) continue;

  const next = lines.map(l => ({
    description: l.description,
    amount: l.amount,
    paidAmount: l.paidAmount,
    paidDate: l.paidDate || '',
    source: l.source || 'letter',
  }));

  const removed = [];
  // 끝에서부터 미납 월기장만 제거
  for (let i = next.length - 1; i >= 0 && open > target; i--) {
    const l = next[i];
    const net = Math.round(Number(l.amount) || 0) - Math.round(Number(l.paidAmount) || 0);
    if (net <= 0) continue;
    if (!isTrimableMonthDesc(l.description)) continue;
    removed.push({ i, description: l.description, net });
    next.splice(i, 1);
    open -= net;
  }

  if (!removed.length) continue;
  report.push({
    code,
    name: e.companyName,
    target,
    before: letterBalanceFromLines(lines),
    after: open,
    removed: removed.map(r => `${r.description}(${r.net})`),
  });

  if (APPLY) {
    await replaceLetterLines(e.id, 'trim-to-aug31', next, { syncBalance: false });
    trimmed += 1;
  }
}

console.log(APPLY ? 'APPLY' : 'DRY-RUN', 'candidates', report.length, 'trimmed', trimmed);
for (const r of report.slice(0, 40)) {
  console.log(
    `${r.code} ${r.name} target=${r.target} ${r.before}→${r.after} -[${r.removed.join('; ')}]`,
  );
}
if (report.length > 40) console.log('... +', report.length - 40);

fs.writeFileSync(
  path.join(root, 'data/_trim-to-aug31.json'),
  JSON.stringify({ apply: APPLY, report }, null, 2),
  'utf8',
);
