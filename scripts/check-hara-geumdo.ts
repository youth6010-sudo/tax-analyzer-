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
import { letterBalanceFromLines } from "../app/types/arrears";

async function main() {
  const db = getDb();
  for (const code of ["00621", "00123", "00135"]) {
    const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, code));
    if (!e) continue;
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    const open = letterBalanceFromLines(lines);
    console.log(code, e.companyName, "bal", e.balance, "open", open, "lines", lines.length);
    for (const l of lines) console.log(`  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount}`);
  }
}
main();
