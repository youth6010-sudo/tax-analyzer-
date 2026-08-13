/**
 * 올바릇(01206) DB 내역 + PDF 파싱 결과
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { asc, eq, ilike } from "drizzle-orm";

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
import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";

async function main() {
  console.log("detail pdf", DEFAULT_LEDGER_DETAIL_PDF, fs.existsSync(DEFAULT_LEDGER_DETAIL_PDF));
  const db = getDb();
  const hits = await db
    .select()
    .from(arrearsEntries)
    .where(ilike(arrearsEntries.companyName, "%올바릇%"));
  for (const e of hits) {
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    let open = 0;
    for (const l of lines) open += l.amount - l.paidAmount;
    console.log(e.externalCode, e.companyName, "bal", e.balance, "open", open, "diff", e.balance - open);
    for (const l of lines) {
      console.log(`  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount} ${l.paidDate || ""}`);
    }
  }

  const pdf = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const co = pdf.companies.find((c) => c.externalCode === "01206" || /올바릇/.test(c.companyName));
  console.log("\nPDF company", co?.externalCode, co?.companyName, "txs", co?.txs.length);
  if (co) {
    let d = 0;
    let c = 0;
    for (const t of co.txs) {
      console.log(t.kind, t.eventDate, t.description, t.amount);
      if (t.kind === "debit") d += t.amount;
      else c += t.amount;
    }
    console.log("sum debit", d, "credit", c, "net", d - c);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
