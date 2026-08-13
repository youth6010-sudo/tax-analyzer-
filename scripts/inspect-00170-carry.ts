/**
 * 00170 공문 줄 — 이월·990000 관련
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { asc, eq } from "drizzle-orm";

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

async function main() {
  const db = getDb();
  const e = (
    await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, "00170")).limit(1)
  )[0]!;
  const lines = await db
    .select()
    .from(arrearsLetterLines)
    .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
    .orderBy(asc(arrearsLetterLines.sortOrder));

  console.log("balance", e.balance);
  let open = 0;
  for (const l of lines) open += l.amount - l.paidAmount;
  console.log("open", open, "diff", e.balance - open, "n", lines.length);

  console.log("\n--- 이월 / 2021 / 990 ---");
  for (const l of lines) {
    if (
      /이월|2021|990/.test(l.description) ||
      Math.round(l.amount) === 990000 ||
      Math.round(l.paidAmount) === 990000
    ) {
      console.log(
        JSON.stringify({
          src: l.source,
          d: l.description,
          a: l.amount,
          p: l.paidAmount,
          pd: l.paidDate,
          i: l.sortOrder,
        }),
      );
    }
  }

  console.log("\n--- first 8 lines ---");
  for (const l of lines.slice(0, 8)) {
    console.log(l.sortOrder, l.source, l.description, "+", l.amount, "-", l.paidAmount, l.paidDate);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
