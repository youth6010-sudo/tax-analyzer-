/**
 * 아이스테이션 조정료 중복 확인
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
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { ledgerDetailChargeDedupKey } from "../lib/arrearsLedgerDetailParse";

async function main() {
  const db = getDb();
  const hits = await db
    .select()
    .from(arrearsEntries)
    .where(ilike(arrearsEntries.companyName, "%아이스테이션%"));
  for (const e of hits) {
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    let open = 0;
    for (const l of lines) open += l.amount - l.paidAmount;
    console.log(
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
      if (/조정|성실|기장|25|26/.test(l.description) || l.source !== "letter") {
        const key = ledgerDetailChargeDedupKey(l.description, l.amount);
        console.log(
          `  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount} key=${key}`,
        );
      }
    }
  }

  const pdf = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const co = pdf.companies.find((c) => /아이스테이션/.test(c.companyName));
  console.log("\nPDF", co?.externalCode, co?.companyName);
  if (co) {
    for (const t of co.txs) {
      console.log(
        t.kind,
        t.eventDate,
        t.description,
        t.amount,
        "key",
        ledgerDetailChargeDedupKey(t.description, t.amount),
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
