/**
 * 에스와이메탈: 2025 선수금 대체 분개(-220,000) 대변 반영 → 잔액 일치
 * npx tsx scripts/fix-sy-metal-advance.ts [--apply]
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
const CODE = "00176";
const AMT = 220000;

async function main() {
  const db = getDb();
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, CODE));
  const lines = await listLetterLines(e.id);
  const open = letterBalanceFromLines(lines);
  console.log("bal", e.balance, "open", open, "diff", e.balance - open);

  const has = lines.some(
    (l) =>
      /선수금\s*대체/.test(l.description || "") &&
      (Math.round(l.paidAmount) === AMT || Math.round(l.amount) === -AMT),
  );
  if (has) {
    console.log("already has 선수금 대체");
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
      description: "선수금 대체 분개",
      amount: 0,
      paidAmount: AMT,
      paidDate: "25년 1월 1일",
      source: "ledger" as ArrearsLetterLineSource,
    },
  ];
  console.log("open after", letterBalanceFromLines(next));
  if (!APPLY) {
    console.log("(dry-run) --apply");
    return;
  }
  await replaceLetterLines(e.id, "fix-sy-metal-advance", next, {
    syncBalance: false,
  });
  const after = await listLetterLines(e.id);
  console.log("applied open", letterBalanceFromLines(after), "bal", e.balance);
  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log("mismatch", mm.count);
  if (mm.count) {
    for (const r of mm.rows || []) {
      console.log(r.externalCode, r.companyName, r.balance, r.open);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
