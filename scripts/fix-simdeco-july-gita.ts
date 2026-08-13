/**
 * 심데코 PDF 청구만 재반영 (합산입금은 스킵됨)
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
import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import { applyLedgerDetailTxs, listLetterLines } from "../lib/arrearsLetterDb";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const co = detail.companies.filter((c) => c.externalCode === "00611");
  const r = await applyLedgerDetailTxs(co, "fix-simdeco-기타");
  console.log(r);
  const db = getDb();
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, "00611"));
  const lines = await listLetterLines(e.id);
  const open = letterBalanceFromLines(lines);
  console.log("bal", e.balance, "open", open, "diff", e.balance - open);
  for (const l of lines.filter((x) => /7월|기타|입금/.test(x.description) || x.paidAmount >= 300000)) {
    console.log(`  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount} ${l.paidDate || ""}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
