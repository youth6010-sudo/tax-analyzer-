/**
 * npx tsx scripts/inspect-samyang-counsel.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { eq, or, like } from "drizzle-orm";

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
import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";

const CODES = ["00232", "00233", "01966"];
const NAME_Q = ["삼양", "상담", "김영균"];

async function main() {
  const db = getDb();
  for (const code of CODES) {
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, code));
    if (!e) {
      console.log("missing", code);
      continue;
    }
    const lines = await listLetterLines(e.id);
    console.log(
      `\n=== ${e.externalCode} ${e.companyName} bal=${e.balance} open=${letterBalanceFromLines(lines)} ===`,
    );
    for (const l of lines) {
      console.log(
        `  ${l.source}\tamt=${l.amount}\tpaid=${l.paidAmount}\t${l.paidDate || ""}\t${l.description}`,
      );
    }
  }

  // also search by name
  for (const q of NAME_Q) {
    const rows = await db
      .select()
      .from(arrearsEntries)
      .where(like(arrearsEntries.companyName, `%${q}%`));
    for (const e of rows) {
      if (CODES.includes(e.externalCode || "")) continue;
      const lines = await listLetterLines(e.id);
      console.log(
        `\n=== name ${e.externalCode} ${e.companyName} bal=${e.balance} open=${letterBalanceFromLines(lines)} ===`,
      );
      for (const l of lines.slice(0, 30)) {
        console.log(
          `  ${l.source}\tamt=${l.amount}\tpaid=${l.paidAmount}\t${l.paidDate || ""}\t${l.description}`,
        );
      }
    }
  }

  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const hits = detail.companies.filter(
    (c) =>
      CODES.includes(c.externalCode) ||
      /삼양|상담|김영균|김장현|김정애/.test(c.companyName),
  );
  console.log("\n=== PDF ===");
  for (const co of hits) {
    console.log(`\n--- ${co.externalCode} ${co.companyName} ---`);
    for (const t of co.txs) {
      console.log(`  ${t.eventDate} ${t.kind} ${t.description} ${t.amount}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
