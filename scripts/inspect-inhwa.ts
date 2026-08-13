/**
 * npx tsx scripts/inspect-inhwa.ts
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
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";

async function main() {
  const db = getDb();
  const rows = await db
    .select()
    .from(arrearsEntries)
    .where(like(arrearsEntries.companyName, "%인화%"));
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);

  for (const e of rows) {
    const lines = await listLetterLines(e.id);
    console.log(
      `\n=== ${e.externalCode} ${e.companyName} bal=${e.balance} open=${letterBalanceFromLines(lines)} ===`,
    );
    for (const l of lines) {
      console.log(
        `  ${l.source}\tamt=${l.amount}\tpaid=${l.paidAmount}\t${l.paidDate || ""}\t${l.description}`,
      );
    }
    const co = detail.companies.find((c) => c.externalCode === e.externalCode);
    console.log("--- PDF ---");
    if (!co) {
      console.log("  (no pdf)");
      continue;
    }
    for (const t of co.txs) {
      console.log(`  ${t.eventDate} ${t.kind} ${t.description} ${t.amount}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
