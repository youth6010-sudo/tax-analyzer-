/**
 * 더좋은사람들(01407) DB vs PDF
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
import {
  DEFAULT_LEDGER_DETAIL_PDF,
  YEAR_LEDGER_DETAIL_PDFS,
} from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";

async function main() {
  const db = getDb();
  const hits = await db
    .select()
    .from(arrearsEntries)
    .where(ilike(arrearsEntries.companyName, "%더좋은%"));
  for (const e of hits) {
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    const open = letterBalanceFromLines(lines);
    console.log(
      "DB",
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
  const co = pdf.companies.find((c) => c.externalCode === "01407");
  console.log("\nPDF2026", co?.txs.length);
  for (const t of co?.txs ?? []) {
    console.log(t.kind, t.eventDate, t.description, t.amount);
  }

  // year ends
  const raw = JSON.parse(
    fs.readFileSync(path.join(root, ".tmp-year-balances.json"), "utf8"),
  );
  for (const yf of raw.years || []) {
    const c = (yf.companies || []).find((x: any) => x.externalCode === "01407");
    console.log(
      `year ${yf.year}: carry=${c?.openingCarry ?? "—"} end=${c?.endingBalance ?? "—"}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
