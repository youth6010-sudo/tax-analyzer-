/**
 * npx tsx scripts/inspect-igigyun.ts
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
    .where(eq(arrearsEntries.externalCode, "01640"));
  const lines = await listLetterLines(e.id);
  console.log("bal", e.balance, "open", letterBalanceFromLines(lines));
  for (const l of lines) {
    console.log(l.source, l.description, "amt", l.amount, "paid", l.paidAmount, l.paidDate);
  }
  const co = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF).companies.find(
    (c) => c.externalCode === "01640",
  );
  console.log("--- PDF ---");
  for (const t of co!.txs) {
    console.log(t.eventDate, t.kind, t.description, t.amount);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
