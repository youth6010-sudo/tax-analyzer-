/**
 * npx tsx scripts/inspect-singodaeri.ts
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
import { listLetterLines } from "../lib/arrearsLetterDb";
import { letterBalanceFromLines } from "../app/types/arrears";

async function main() {
  const db = getDb();
  for (const code of ["01600", "01966", "00232", "00233"]) {
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, code));
    if (!e) continue;
    const lines = await listLetterLines(e.id);
    console.log(
      `\n${code} ${e.companyName} bal=${e.balance} open=${letterBalanceFromLines(lines)}`,
    );
    for (const l of lines) {
      console.log(
        `  ${l.source} amt=${l.amount} paid=${l.paidAmount} ${l.paidDate || ""} | ${l.description}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
