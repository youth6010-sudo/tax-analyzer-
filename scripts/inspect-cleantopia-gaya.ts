/**
 * 크린토피아 부산가야태화현대점 점검
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { asc, eq, ilike, and } from "drizzle-orm";

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
  const hits = await db
    .select()
    .from(arrearsEntries)
    .where(ilike(arrearsEntries.companyName, "%크린토피아%가야%"));
  const hits2 = hits.length
    ? hits
    : await db
        .select()
        .from(arrearsEntries)
        .where(ilike(arrearsEntries.companyName, "%크린토피아%"));
  for (const e of hits2) {
    if (!/가야|태화/.test(e.companyName) && hits.length === 0) continue;
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    const open = letterBalanceFromLines(lines);
    console.log(
      "\nDB",
      e.externalCode,
      e.companyName,
      "bal",
      e.balance,
      "open",
      open,
      "diff",
      e.balance - open,
      "lines",
      lines.length,
    );
    for (const l of lines) {
      console.log(
        `  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount} ${l.paidDate || ""}`,
      );
    }
  }

  const pdf = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  for (const co of pdf.companies.filter((c) => /크린토피아/.test(c.companyName) && /가야|태화/.test(c.companyName))) {
    console.log("\nPDF", co.externalCode, co.companyName, "txs", co.txs.length);
    for (const t of co.txs) console.log(t.kind, t.eventDate, t.description, t.amount);
  }

  const raw = JSON.parse(fs.readFileSync(path.join(root, ".tmp-year-balances.json"), "utf8"));
  for (const yf of raw.years || []) {
    for (const c of yf.companies || []) {
      if (/크린토피아/.test(c.companyName) && /가야|태화/.test(c.companyName)) {
        console.log(`year ${yf.year} ${c.externalCode} carry=${c.openingCarry} end=${c.endingBalance}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
