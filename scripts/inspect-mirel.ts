/**
 * 미르엘 DB vs PDF 파싱 결과
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
import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";

async function main() {
  const db = getDb();
  const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, "01960"));
  const lines = await db
    .select()
    .from(arrearsLetterLines)
    .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
    .orderBy(asc(arrearsLetterLines.sortOrder));
  console.log("DB bal", e.balance, "open", letterBalanceFromLines(lines));
  for (const l of lines) console.log(`  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount}`);

  const pdf = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const co = pdf.companies.find((c) => c.externalCode === "01960");
  console.log("\nPDF");
  for (const t of co?.txs ?? []) console.log(t.kind, t.eventDate, t.description, t.amount);
}
main();
