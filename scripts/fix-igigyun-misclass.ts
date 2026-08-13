/**
 * 이기균부동산: 이름+부가세가 청구로 잘못 들어간 행 제거
 * npx tsx scripts/fix-igigyun-misclass.ts [--apply]
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
import { listLetterLines, replaceLetterLines } from "../lib/arrearsLetterDb";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");

async function main() {
  const db = getDb();
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, "01640"));
  if (!e) throw new Error("not found");
  const lines = await listLetterLines(e.id);
  const keep = lines.filter((l) => {
    const d = (l.description || "").replace(/\s+/g, "");
    // 청구로 잘못 들어간「이기균김유리부가세」(입금인데 amount>0)
    if (d === "이기균김유리부가세" && Math.round(l.amount) > 0 && Math.round(l.paidAmount) === 0) {
      return false;
    }
    return true;
  });
  console.log("before", lines.length, "after", keep.length, "bal", e.balance);
  console.log("open before", letterBalanceFromLines(lines), "after", letterBalanceFromLines(keep));
  if (!APPLY) {
    console.log("(dry-run)");
    return;
  }
  await replaceLetterLines(
    e.id,
    "fix-igigyun-misclass",
    keep.map((l) => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || "",
      source: l.source as ArrearsLetterLineSource,
    })),
    { syncBalance: false },
  );
  const after = await listLetterLines(e.id);
  console.log("applied open", letterBalanceFromLines(after), "bal", e.balance);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
