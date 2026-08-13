/**
 * 우리펌프카: 7/24 220만 입금 2건 중 1건 누락 보충
 * npx tsx scripts/fix-uripump.ts [--apply]
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
const CODE = "00213";

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const co = detail.companies.find((c) => c.externalCode === CODE);
  if (!co) throw new Error("pdf missing");
  const db = getDb();
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, CODE));
  const before = await listLetterLines(e.id);
  console.log("bal", e.balance, "open before", letterBalanceFromLines(before));
  const jul24 = before.filter(
    (l) =>
      Math.round(l.paidAmount) === 2200000 &&
      String(l.paidDate || "").includes("7월 24일"),
  );
  console.log("existing 7/24 220만 payments", jul24.length);
  console.log(
    "PDF 7/24 credits",
    co.txs.filter(
      (t) => t.eventDate === "2026-07-24" && t.kind === "credit" && t.amount === 2200000,
    ).length,
  );

  if (!APPLY) {
    console.log("(dry-run) --apply");
    return;
  }

  await applyLedgerDetailTxs([co], "fix-uripump");
  const after = await listLetterLines(e.id);
  console.log("open after", letterBalanceFromLines(after), "bal", e.balance);
  for (const l of after.filter((x) => String(x.paidDate || "").includes("7월 24"))) {
    console.log(`  ${l.source} paid=${l.paidAmount} ${l.paidDate} ${l.description}`);
  }
  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log("mismatch", mm.count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
