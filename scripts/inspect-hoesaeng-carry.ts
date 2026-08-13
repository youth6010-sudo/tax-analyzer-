/**
 * npx tsx scripts/inspect-hoesaeng-carry.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { eq, like, or, sql } from "drizzle-orm";

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
import { listLetterLines } from "../lib/arrearsLetterDb";
import { letterBalanceFromLines } from "../app/types/arrears";

async function main() {
  const db = getDb();

  console.log("=== 회생/팀코리아 ===");
  const rows = await db
    .select()
    .from(arrearsEntries)
    .where(
      or(
        like(arrearsEntries.companyName, "%회생%"),
        like(arrearsEntries.companyName, "%팀코리아%"),
        eq(arrearsEntries.externalCode, "00234"),
        eq(arrearsEntries.externalCode, "00170"),
      ),
    );
  for (const e of rows) {
    const lines = await listLetterLines(e.id);
    console.log(
      `\n${e.externalCode} ${e.companyName} bal=${e.balance} open=${letterBalanceFromLines(lines)}`,
    );
    for (const l of lines.slice(0, 40)) {
      console.log(
        `  ${l.source}\tamt=${l.amount}\tpaid=${l.paidAmount}\t${l.paidDate || ""}\t${l.description}`,
      );
    }
    if (lines.length > 40) console.log(`  ... +${lines.length - 40}`);
  }

  console.log("\n=== 전기이월 라인 있는 업체 ===");
  const carryLines = await db
    .select({
      entryId: arrearsLetterLines.arrearsEntryId,
      desc: arrearsLetterLines.description,
      amount: arrearsLetterLines.amount,
      paid: arrearsLetterLines.paidAmount,
    })
    .from(arrearsLetterLines)
    .where(sql`${arrearsLetterLines.description} like '%전기이월%'`);

  const byEntry = new Map<string, typeof carryLines>();
  for (const l of carryLines) {
    const arr = byEntry.get(l.entryId) || [];
    arr.push(l);
    byEntry.set(l.entryId, arr);
  }
  for (const [id, ls] of byEntry) {
    const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.id, id));
    if (!e) continue;
    const all = await listLetterLines(e.id);
    console.log(
      `${e.externalCode} ${e.companyName} bal=${e.balance} open=${letterBalanceFromLines(all)} · 전기이월×${ls.length} ${ls.map((x) => `${x.desc}=${x.amount}`).join(" | ")}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
