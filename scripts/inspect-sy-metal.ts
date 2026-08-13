/**
 * npx tsx scripts/inspect-sy-metal.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { eq, like } from "drizzle-orm";

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
import { arrearsEntries } from "../db/schema";
import { listLetterLines } from "../lib/arrearsLetterDb";
import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import {
  DEFAULT_LEDGER_DETAIL_PDF,
  YEAR_LEDGER_DETAIL_PDFS,
} from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";

async function main() {
  const db = getDb();
  const rows = await db
    .select()
    .from(arrearsEntries)
    .where(like(arrearsEntries.companyName, "%에스와이%"));
  for (const e of rows) {
    const lines = await listLetterLines(e.id);
    console.log(
      `\n=== ${e.externalCode} ${e.companyName} bal=${e.balance} open=${letterBalanceFromLines(lines)} diff=${e.balance - letterBalanceFromLines(lines)} ===`,
    );
    for (const l of lines) {
      console.log(
        `  ${l.source}\tamt=${l.amount}\tpaid=${l.paidAmount}\t${l.paidDate || ""}\t${l.description}`,
      );
    }
  }

  for (const pdf of [DEFAULT_LEDGER_DETAIL_PDF, ...YEAR_LEDGER_DETAIL_PDFS.filter((p) => p.includes("2025"))]) {
    const detail = parseLedgerDetailPdf(pdf);
    const hits = detail.companies.filter(
      (c) => /에스와이|00176/.test(c.companyName + c.externalCode),
    );
    console.log(`\n--- PDF ${pdf} ---`);
    for (const co of hits) {
      console.log(co.externalCode, co.companyName);
      for (const t of co.txs) {
        console.log(`  ${t.eventDate} ${t.kind} ${t.description} ${t.amount}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
