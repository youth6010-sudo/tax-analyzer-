/**
 * 00170 공문 줄 중 금액 큰 항목 / 2026 관련
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

  let charge = 0;
  let paid = 0;
  for (const l of lines) {
    charge += l.amount;
    paid += l.paidAmount;
  }
  console.log("total charge", charge, "paid", paid, "open", charge - paid);

  const big = lines
    .filter((l) => l.amount >= 300000 || l.paidAmount >= 300000)
    .map((l) => ({
      src: l.source,
      d: l.description,
      a: l.amount,
      p: l.paidAmount,
      pd: l.paidDate,
    }));
  console.log("big lines", big.length);
  for (const b of big) console.log(JSON.stringify(b));

  const y26 = lines.filter(
    (l) =>
      /26|2026|6월|7월|8월|1월|2월|3월|4월|5월/.test(l.description) ||
      /법인|조정|성실|기장/.test(l.description),
  );
  console.log("\nkeyword lines", y26.length);
  for (const l of y26) {
    console.log(l.source, l.description, "+", l.amount, "-", l.paidAmount, l.paidDate || "");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
