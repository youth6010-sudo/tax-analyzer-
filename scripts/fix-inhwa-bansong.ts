/**
 * 인화칼국수-반송: 같은 날 재송·반송 165k 중 반송 누락 보충
 * npx tsx scripts/fix-inhwa-bansong.ts [--apply]
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
import {
  listLetterLines,
  applyLedgerDetailTxs,
  listLedgerBalanceMismatches,
} from "../lib/arrearsLetterDb";
import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");
const CODE = "01975";

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const co = detail.companies.find((c) => c.externalCode === CODE);
  if (!co) throw new Error("pdf missing");

  console.log("--- PDF ---");
  for (const t of co.txs) {
    console.log(`  ${t.eventDate} ${t.kind} ${t.description} ${t.amount}`);
  }

  const db = getDb();
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, CODE));
  const before = await listLetterLines(e.id);
  console.log("\nbal", e.balance, "open before", letterBalanceFromLines(before));

  if (!APPLY) {
    console.log("(dry-run) --apply");
    return;
  }

  await applyLedgerDetailTxs([co], "fix-inhwa-bansong");
  const after = await listLetterLines(e.id);
  console.log("open after", letterBalanceFromLines(after), "bal", e.balance);
  for (const l of after) {
    console.log(
      `  ${l.source} amt=${l.amount} paid=${l.paidAmount} ${l.paidDate || ""} | ${l.description}`,
    );
  }
  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log("mismatch", mm.count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
