/**
 * 해밀한의원: 「반환」입금 → 차변 청구로 보정
 * npx tsx scripts/fix-haemil-return.ts [--apply]
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
const CODE = "01220";

async function main() {
  const db = getDb();
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, CODE));
  const lines = await listLetterLines(e.id);
  console.log("bal", e.balance, "open before", letterBalanceFromLines(lines));

  const next = lines.map((l) => {
    const d = (l.description || "").replace(/\s+/g, "");
    const paid = Math.round(l.paidAmount);
    const amt = Math.round(l.amount);
    if (/반환/.test(d) && paid > 0 && amt === 0) {
      return {
        description: l.description,
        amount: paid,
        paidAmount: 0,
        paidDate: "",
        source: "ledger" as ArrearsLetterLineSource,
      };
    }
    return {
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || "",
      source: l.source as ArrearsLetterLineSource,
    };
  });

  console.log("open after", letterBalanceFromLines(next));
  if (!APPLY) {
    console.log("(dry-run) --apply");
    return;
  }
  await replaceLetterLines(e.id, "fix-haemil-return", next, { syncBalance: false });
  const after = await listLetterLines(e.id);
  console.log("applied open", letterBalanceFromLines(after), "bal", e.balance);
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
