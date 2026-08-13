/**
 * 잔액 일치 여부와 무관하게 letter 법인세/세무조정 + ledger 법인조정 동액 잔존 여부
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
import { isLetterCorpFeeDescription } from "../lib/arrearsLedgerDetailParse";

async function main() {
  const db = getDb();
  const entries = await db.select().from(arrearsEntries);
  let left = 0;
  for (const e of entries) {
    const lines = await listLetterLines(e.id);
    const letterAmts = new Set(
      lines
        .filter((l) => l.source === "letter" && isLetterCorpFeeDescription(l.description) && l.amount > 0)
        .map((l) => l.amount),
    );
    if (!letterAmts.size) continue;
    const dups = lines.filter(
      (l) => l.source === "ledger" && /법인조정/.test(l.description.replace(/\s+/g, "")) && letterAmts.has(l.amount),
    );
    if (!dups.length) continue;
    left += 1;
    console.log(e.externalCode, e.companyName, dups.map((d) => `${d.description}:${d.amount}`).join(", "));
  }
  console.log("remaining same-amount corp dupes", left);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
