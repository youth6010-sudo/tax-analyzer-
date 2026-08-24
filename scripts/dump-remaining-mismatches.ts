/**
 * npx tsx scripts/dump-remaining-mismatches.ts
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

import { listLedgerBalanceMismatches, listLetterLines } from '../lib/arrearsLetterDb';
import { letterBalanceFromLines } from '../app/types/arrears';
import { parseLedgerDetailPdf } from '../lib/arrearsLedgerDetailParse';
import { DEFAULT_LEDGER_DETAIL_PDF } from '../lib/arrearsStackConfig';

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const byCode = new Map(detail.companies.map(c => [c.externalCode, c]));
  const mm = await listLedgerBalanceMismatches({ kind: 'mismatch' });
  console.log('count', mm.count);

  for (const m of mm.items) {
    const lines = await listLetterLines(m.entryId);
    const co = byCode.get(m.externalCode);
    const src: Record<string, number> = {};
    for (const l of lines) src[l.source] = (src[l.source] || 0) + 1;
    const letterOpen = letterBalanceFromLines(lines.filter(l => l.source === 'letter'));
    const pdfNet = co
      ? co.txs.reduce((s, t) => s + (t.kind === 'debit' ? t.amount : -t.amount), 0)
      : null;
    const last = lines.slice(-10).map(l => ({
      s: l.source,
      d: l.description.slice(0, 50),
      a: l.amount,
      p: l.paidAmount,
      pd: l.paidDate,
    }));
    const pdfAll = co
      ? co.txs.map(t => ({
          k: t.kind,
          d: (t.description || '').slice(0, 50),
          a: t.amount,
          dt: t.eventDate,
        }))
      : [];
    console.log(
      JSON.stringify(
        {
          code: m.externalCode,
          name: m.companyName,
          bal: m.ledgerBalance,
          open: m.linesOpen,
          diff: m.diff,
          letterOpen,
          pdfNet,
          src,
          last,
          pdfAll,
        },
        null,
        2,
      ),
    );
    console.log('=====');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
