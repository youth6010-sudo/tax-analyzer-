/**
 * 핑고·김군과플랫폼 줄 상태 확인
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

async function show(code: string) {
  const db = getDb();
  const e = (
    await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, code)).limit(1)
  )[0];
  if (!e) {
    console.log(code, "missing");
    return;
  }
  const lines = await db
    .select()
    .from(arrearsLetterLines)
    .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
    .orderBy(asc(arrearsLetterLines.sortOrder));
  console.log("\n", code, e.companyName, "bal", e.balance, "n", lines.length);
  for (const l of lines) {
    console.log(`  [${l.source}] ${JSON.stringify(l.description)} +${l.amount} -${l.paidAmount}`);
  }
}

async function main() {
  await show("01979");
  await show("00135");
  await show("00203");
  await show("00149");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
