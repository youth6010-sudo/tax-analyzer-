/**
 * 김군과플랫폼(00135) DB·PDF 점검
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { asc, eq, ilike, or } from "drizzle-orm";

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
    .where(
      or(
        eq(arrearsEntries.externalCode, "00135"),
        ilike(arrearsEntries.companyName, "%김군%"),
        ilike(arrearsEntries.companyName, "%다산%"),
      ),
    );
  for (const e of hits) {
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    const open = letterBalanceFromLines(lines);
    console.log(
      "\n===",
      e.externalCode,
      e.companyName,
      "bal",
      e.balance,
      "open",
      open,
      "diff",
      e.balance - open,
    );
    for (const l of lines) {
      console.log(
        `  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount} ${l.paidDate || ""}`,
      );
    }
  }

  const pdf = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  for (const co of pdf.companies.filter(
    (c) =>
      c.externalCode === "00135" ||
      c.externalCode === "01192" ||
      /김군|다산/.test(c.companyName),
  )) {
    console.log("\nPDF", co.externalCode, co.companyName, "txs", co.txs.length);
    let d = 0;
    let c = 0;
    for (const t of co.txs) {
      console.log(t.kind, t.eventDate, t.description, t.amount);
      if (t.kind === "debit") d += t.amount;
      else c += t.amount;
    }
    console.log("sum debit", d, "credit", c, "net", d - c);
    console.log("openingCarry", co.openingCarry, "ending", co.endingBalance);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
