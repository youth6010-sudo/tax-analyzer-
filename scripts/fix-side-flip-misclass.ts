/**
 * 월계 보정 후 삼양/상담/신고대리 재반영
 * npx tsx scripts/fix-side-flip-misclass.ts [--apply]
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
  replaceLetterLines,
  applyLedgerDetailTxs,
  listLedgerBalanceMismatches,
} from "../lib/arrearsLetterDb";
import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");
const CODES = ["00232", "00233", "01600", "01966"];

function isPriorYearLedger(desc: string): boolean {
  return /^(20\d{2})년/.test(String(desc || "").trim());
}

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const db = getDb();

  for (const code of CODES) {
    const co = detail.companies.find((c) => c.externalCode === code);
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, code));
    if (!e || !co) {
      console.log("skip missing", code);
      continue;
    }
    console.log(`\n=== ${code} ${e.companyName} ===`);
    for (const t of co.txs) {
      console.log(`  PDF ${t.eventDate} ${t.kind} ${t.description} ${t.amount}`);
    }
    const lines = await listLetterLines(e.id);
    console.log("bal", e.balance, "open before", letterBalanceFromLines(lines));
    if (!APPLY) continue;

    // letter + prior-year keep, replace 2026 ledger/payment from PDF
    const keep = lines.filter(
      (l) =>
        l.source === "letter" ||
        (l.source === "ledger" && isPriorYearLedger(l.description)),
    );
    await replaceLetterLines(
      e.id,
      "fix-side-flip",
      keep.map((l) => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate || "",
        source: l.source as ArrearsLetterLineSource,
      })),
      { syncBalance: false },
    );
    await applyLedgerDetailTxs([{ ...co }], "fix-side-flip");
    const after = await listLetterLines(e.id);
    console.log("open after", letterBalanceFromLines(after), "bal", e.balance);
    for (const l of after) {
      console.log(
        `  ${l.source} amt=${l.amount} paid=${l.paidAmount} ${l.paidDate || ""} | ${l.description}`,
      );
    }
  }

  if (!APPLY) {
    console.log("\n(dry-run) --apply");
    return;
  }
  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log("\nmismatch", mm.count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
