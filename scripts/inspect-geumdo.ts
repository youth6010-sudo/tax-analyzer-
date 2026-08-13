/**
 * 금도건설(00123) DB·2026 PDF·연도원장 점검
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { asc, eq } from "drizzle-orm";
import { spawnSync } from "child_process";

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
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, "00123"));
  if (!e) throw new Error("not found");
  const lines = await db
    .select()
    .from(arrearsLetterLines)
    .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
    .orderBy(asc(arrearsLetterLines.sortOrder));
  const open = letterBalanceFromLines(lines);
  console.log("DB", e.externalCode, e.companyName, "bal", e.balance, "open", open, "diff", e.balance - open);
  for (const l of lines) {
    console.log(`  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount} ${l.paidDate || ""}`);
  }

  const pdf = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const co = pdf.companies.find((c) => c.externalCode === "00123");
  console.log("\nPDF2026 txs", co?.txs.length);
  let d = 0;
  let c = 0;
  for (const t of co?.txs ?? []) {
    console.log(t.kind, t.eventDate, t.description, t.amount);
    if (t.kind === "debit") d += t.amount;
    else c += t.amount;
  }
  console.log("sum D", d, "C", c, "net", d - c);

  // raw pages for 00123 across years
  const { PdfReader } = await import("pdfjs-dist/legacy/build/pdf.mjs").catch(() => ({ PdfReader: null }));
  void PdfReader;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
