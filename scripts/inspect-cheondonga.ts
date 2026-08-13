/**
 * npx tsx scripts/inspect-cheondonga.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { eq, like, or } from "drizzle-orm";

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

async function dumpEntry(codeOrName: string, label: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(arrearsEntries)
    .where(
      or(
        eq(arrearsEntries.externalCode, codeOrName),
        like(arrearsEntries.companyName, `%${codeOrName}%`),
      ),
    );
  for (const e of rows) {
    const lines = await listLetterLines(e.id);
    console.log(`\n=== ${label} ${e.externalCode} ${e.companyName} bal=${e.balance} open=${letterBalanceFromLines(lines)} ===`);
    for (const l of lines) {
      console.log(
        `  ${l.source}\tamt=${l.amount}\tpaid=${l.paidAmount}\t${l.paidDate || ""}\t${l.description}`,
      );
    }
  }
}

async function main() {
  await dumpEntry("01418", "01418");
  await dumpEntry("양수도", "양수도검색");
  await dumpEntry("천돈가", "천돈가검색");

  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const hits = detail.companies.filter(
    (c) =>
      c.externalCode === "01418" ||
      /천돈가|양수도/.test(c.companyName),
  );
  console.log("\n=== PDF companies ===");
  for (const co of hits) {
    console.log(`\n--- PDF ${co.externalCode} ${co.companyName} ---`);
    for (const t of co.txs) {
      console.log(`  ${t.eventDate} ${t.kind} ${t.description} ${t.amount}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
