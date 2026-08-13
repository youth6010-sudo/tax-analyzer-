/**
 * npx tsx scripts/inspect-uripump.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";

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
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, "00213"));
  const lines = await listLetterLines(e.id);
  console.log("bal", e.balance, "open", letterBalanceFromLines(lines), e.companyName);
  for (const l of lines) {
    console.log(
      `  ${l.source}\tamt=${l.amount}\tpaid=${l.paidAmount}\t${l.paidDate || ""}\t${l.description}`,
    );
  }
  const co = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF).companies.find(
    (c) => c.externalCode === "00213",
  );
  console.log("\n--- PDF ---");
  for (const t of co!.txs) {
    console.log(`  ${t.eventDate} ${t.kind} ${t.description} ${t.amount}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
