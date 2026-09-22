/**
 * 7월(+기타) 미수 + 8월 입금(지급-only) + 8월(+기타) 패턴 → 입금 부착
 * node --import tsx scripts/fix-all-etc-fee-pay-attach.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

function loadEnv(p) {
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, 'utf8').split(/\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) o[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return o;
}
const env = { ...loadEnv(path.join(root, '.env')), ...loadEnv(path.join(root, '.env.local')) };

for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

import { getDb } from '../db/index.ts';
import { arrearsEntries } from '../db/schema.ts';
import { listLetterLines, replaceLetterLines } from '../lib/arrearsLetterDb.ts';
import { letterBalanceFromLines } from '../app/types/arrears.ts';
import { formatArrearsReasonSummary } from '../lib/arrearsReasonSummary.ts';
import { eq } from 'drizzle-orm';

const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 25 });
const db = getDb();

// already fixed
const SKIP = new Set(['00647', '01972', '00149', '01812', '01070', '00180', '02184', '00162']);

function attachPaymentOnlyFifo(lines) {
  const out = lines.map(l => ({
    description: l.description || '',
    amount: Math.round(l.amount || 0),
    paidAmount: Math.round(l.paidAmount || 0),
    paidDate: l.paidDate || '',
    source: l.source || 'letter',
  }));
  const remove = new Set();

  for (let i = 0; i < out.length; i++) {
    const pay = out[i];
    if (pay.paidAmount <= 0 || pay.amount !== 0) continue;
    let remain = pay.paidAmount;
    const pd = pay.paidDate || '';

    for (let j = 0; j < i && remain > 0; j++) {
      if (remove.has(j)) continue;
      const ch = out[j];
      const open = ch.amount - ch.paidAmount;
      if (open <= 0 || ch.amount <= 0) continue;
      if (open === remain || ch.amount === remain) {
        const use = Math.min(open, remain);
        out[j] = { ...ch, paidAmount: ch.paidAmount + use, paidDate: ch.paidDate || pd };
        remain -= use;
      }
    }
    for (let j = 0; j < i && remain > 0; j++) {
      if (remove.has(j)) continue;
      const ch = out[j];
      const open = ch.amount - ch.paidAmount;
      if (open <= 0 || ch.amount <= 0) continue;
      const use = Math.min(open, remain);
      out[j] = { ...ch, paidAmount: ch.paidAmount + use, paidDate: ch.paidDate || pd };
      remain -= use;
    }
    if (remain === 0) remove.add(i);
    else out[i] = { ...pay, paidAmount: remain };
  }
  return out.filter((_, idx) => !remove.has(idx));
}

function looksLikeEtcPattern(lines) {
  const hasEtc = lines.some(l => /기타/.test(String(l.description || '')));
  const hasPayOnly = lines.some(
    l => Math.round(l.amount || 0) === 0 && Math.round(l.paidAmount || 0) > 0,
  );
  if (!hasEtc || !hasPayOnly) return false;
  // 지급-only 앞에 미수 청구가 있고, 뒤에 또 청구가 있음
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!(Math.round(l.amount || 0) === 0 && Math.round(l.paidAmount || 0) > 0)) continue;
    const beforeOpen = lines
      .slice(0, i)
      .some(x => Math.round(x.amount || 0) - Math.round(x.paidAmount || 0) > 0);
    const afterCharge = lines.slice(i + 1).some(x => Math.round(x.amount || 0) > 0);
    if (beforeOpen && afterCharge) return true;
  }
  return false;
}

const candidates = await sql`
  SELECT e.id, e.external_code, e.company_name, e.balance, e.as_of_date, e.letter_date
  FROM arrears_entries e
  WHERE EXISTS (
    SELECT 1 FROM arrears_letter_lines l
    WHERE l.arrears_entry_id = e.id AND l.description ILIKE '%기타%'
  )
  AND EXISTS (
    SELECT 1 FROM arrears_letter_lines l
    WHERE l.arrears_entry_id = e.id AND l.amount = 0 AND l.paid_amount > 0
  )
  ORDER BY e.external_code
`;

const report = [];
for (const e of candidates) {
  if (SKIP.has(e.external_code)) continue;
  const before = await listLetterLines(e.id);
  if (!looksLikeEtcPattern(before)) continue;
  const next = attachPaymentOnlyFifo(before);
  if (next.length === before.length && JSON.stringify(next) === JSON.stringify(before.map(l => ({
    description: l.description || '',
    amount: Math.round(l.amount || 0),
    paidAmount: Math.round(l.paidAmount || 0),
    paidDate: l.paidDate || '',
    source: l.source || 'letter',
  })))) continue;

  const beforeOpen = letterBalanceFromLines(before);
  const afterOpen = letterBalanceFromLines(next);
  const reasonBefore = formatArrearsReasonSummary(before, { asOfDate: e.as_of_date || e.letter_date });
  const reasonAfter = formatArrearsReasonSummary(next, { asOfDate: e.as_of_date || e.letter_date });
  console.log(
    e.external_code,
    e.company_name,
    `n ${before.length}→${next.length}`,
    afterOpen === Math.round(e.balance) ? 'MATCH' : `diff ${Math.round(e.balance) - afterOpen}`,
    `| ${reasonBefore} → ${reasonAfter}`,
  );
  if (APPLY && afterOpen === beforeOpen) {
    await replaceLetterLines(e.id, 'fix-all-etc-fee-pay-attach', next, { syncBalance: false });
  }
  report.push({
    code: e.external_code,
    name: e.company_name,
    beforeOpen,
    afterOpen,
    reasonBefore,
    reasonAfter,
    applied: APPLY && afterOpen === beforeOpen,
  });
}

fs.writeFileSync(
  path.join(root, 'data/_fix-all-etc-fee-pay-attach.json'),
  JSON.stringify({ at: new Date().toISOString(), apply: APPLY, report }, null, 2),
);
console.log('done', report.length, APPLY ? 'APPLIED' : 'DRY-RUN');
await sql.end({ timeout: 5 });
