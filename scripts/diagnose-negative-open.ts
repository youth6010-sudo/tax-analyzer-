/**
 * 음수 내역(open<0) 상위 업체 진단
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { asc, eq } from "drizzle-orm";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env.local", ".env"]) {
  const envPath = path.join(root, name);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

import { getDb } from "../db";
import { arrearsEntries, arrearsLetterLines } from "../db/schema";
import { listLedgerBalanceMismatches } from "../lib/arrearsLetterDb";
import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";

async function main() {
  const mm = await listLedgerBalanceMismatches();
  const neg = mm.items.filter((x) => x.linesOpen < 0).slice(0, 8);
  console.log("negative open count", mm.items.filter((x) => x.linesOpen < 0).length);

  const pdf = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const byCode = new Map(pdf.companies.map((c) => [c.externalCode, c]));
  const db = getDb();

  for (const x of neg) {
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, x.entryId))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    const by: Record<string, number> = {};
    let charge = 0;
    let paid = 0;
    let hasLetter = false;
    for (const l of lines) {
      by[l.source] = (by[l.source] || 0) + 1;
      charge += l.amount;
      paid += l.paidAmount;
      if (l.source === "letter") hasLetter = true;
    }
    const co = byCode.get(x.externalCode);
    const pdfDebit = co?.txs.filter((t) => t.kind === "debit").length ?? 0;
    const pdfCredit = co?.txs.filter((t) => t.kind === "credit").length ?? 0;
    console.log(
      `\n${x.externalCode} ${x.companyName} bal=${x.ledgerBalance} open=${x.linesOpen} hasLetter=${hasLetter}`,
    );
    console.log("  lines", by, "charge", charge, "paid", paid);
    console.log("  pdf txs debit", pdfDebit, "credit", pdfCredit);
    if (co) {
      for (const t of co.txs.slice(0, 12)) {
        console.log("   ", t.kind, t.eventDate, t.description, t.amount);
      }
      if (co.txs.length > 12) console.log("   …", co.txs.length - 12, "more");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
