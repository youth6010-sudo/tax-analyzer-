/**
 * 기담향방 + 7월 세금계산서 반영 여부
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
import { DEFAULT_LEDGER_DETAIL_PDF, TAX_INVOICE_DIR, TAX_INVOICE_FILES } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";
import { parseTaxInvoiceIssuanceXls } from "../lib/taxInvoiceIssuanceParse";

async function main() {
  const db = getDb();
  const hits = await db
    .select()
    .from(arrearsEntries)
    .where(ilike(arrearsEntries.companyName, "%기담%"));
  for (const e of hits) {
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    console.log(
      "DB",
      e.externalCode,
      e.companyName,
      "bal",
      e.balance,
      "open",
      letterBalanceFromLines(lines),
    );
    for (const l of lines) {
      console.log(`  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount} ${l.paidDate || ""}`);
    }
  }

  const pdf = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  for (const co of pdf.companies.filter((c) => /기담/.test(c.companyName))) {
    console.log("\nPDF", co.externalCode, co.companyName);
    for (const t of co.txs) console.log(t.kind, t.eventDate, t.description, t.amount);
  }

  console.log("\n=== tax july files ===");
  for (const f of TAX_INVOICE_FILES.filter((x) => /2607|7월/.test(x))) {
    const p = path.join(TAX_INVOICE_DIR, f);
    console.log(f, fs.existsSync(p));
    if (!fs.existsSync(p)) continue;
    const rows = parseTaxInvoiceIssuanceXls(p);
    const hit = rows.filter((r) => /기담/.test(r.companyName || r.buyerName || ""));
    console.log("  rows", rows.length, "기담", hit.length);
    for (const r of hit.slice(0, 10)) {
      console.log(" ", r.eventDate, r.companyName || r.buyerName, r.description, r.amount, r.hint);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
