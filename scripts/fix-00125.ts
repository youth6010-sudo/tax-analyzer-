/**
 * 00125: PDF 1/9 입금 495,000 누락 보충 + 전기이월 분해 유지
 * npx tsx scripts/fix-00125.ts [--apply]
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
  listLedgerBalanceMismatches,
} from "../lib/arrearsLetterDb";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");

async function main() {
  const db = getDb();
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, "00125"));
  const lines = await listLetterLines(e.id);
  console.log("bal", e.balance, "open before", letterBalanceFromLines(lines));

  const has = lines.some(
    (l) =>
      Math.round(l.paidAmount) === 495000 &&
      String(l.paidDate || "").includes("1월 9일"),
  );
  if (has) {
    console.log("already has 1/9 495k");
    return;
  }

  const next = [
    ...lines.map((l) => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || "",
      source: l.source as ArrearsLetterLineSource,
    })),
    {
      description: "입금",
      amount: 0,
      paidAmount: 495000,
      paidDate: "1월 9일",
      source: "payment" as ArrearsLetterLineSource,
    },
  ];
  console.log("open after", letterBalanceFromLines(next));
  if (!APPLY) {
    console.log("(dry-run)");
    return;
  }
  await replaceLetterLines(e.id, "fix-00125-jan9", next, { syncBalance: false });
  const after = await listLetterLines(e.id);
  console.log("applied open", letterBalanceFromLines(after), "bal", e.balance);
  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log("mismatch", mm.count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
