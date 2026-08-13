/**
 * 00170 팀코리아(광주) 내역 상세
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
  )[0];
  if (!e) {
    console.log("not found");
    return;
  }
  const lines = await db
    .select()
    .from(arrearsLetterLines)
    .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
    .orderBy(asc(arrearsLetterLines.sortOrder));
  const by: Record<string, number> = {};
  let open = 0;
  let letterOpen = 0;
  for (const l of lines) {
    by[l.source] = (by[l.source] || 0) + 1;
    const o = l.amount - l.paidAmount;
    open += o;
    if (l.source === "letter") letterOpen += o;
  }
  console.log("balance", e.balance, "open", open, "letterOpen", letterOpen, "by", by);
  for (const l of lines.filter((x) => x.source === "ledger" || x.source === "payment")) {
    console.log(l.source, l.description, "+", l.amount, "-", l.paidAmount, l.paidDate || "");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
