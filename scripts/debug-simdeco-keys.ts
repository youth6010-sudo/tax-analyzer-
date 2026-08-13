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
import {
  ledgerDetailChargeDedupKey,
  inheritYearForMonthFeeDesc,
  parseLedgerDetailPdf,
} from "../lib/arrearsLedgerDetailParse";
import { listLetterLines } from "../lib/arrearsLetterDb";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";

async function main() {
  const db = getDb();
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, "00611"));
  const existing = await listLetterLines(e.id);
  const chargeKeys = new Set<string>();
  for (let i = 0; i < existing.length; i++) {
    const l = existing[i];
    if (Math.round(l.amount) <= 0) continue;
    const prev = i > 0 ? existing[i - 1].description : "";
    const desc = inheritYearForMonthFeeDesc(l.description, prev);
    const key = ledgerDetailChargeDedupKey(desc, l.amount);
    chargeKeys.add(key);
    if (/기타|7월/.test(l.description)) {
      console.log(`LETTER [${l.description}] prev=[${prev}] → [${desc}] key=${key}`);
    }
  }

  const pdf = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const co = pdf.companies.find((c) => c.externalCode === "00611");
  for (const t of co?.txs ?? []) {
    if (t.kind !== "debit") continue;
    if (!/기타|7월/.test(t.description)) continue;
    const key = ledgerDetailChargeDedupKey(t.description, t.amount, t.eventDate);
    console.log(
      `PDF ${t.eventDate} [${t.description}] key=${key} hit=${chargeKeys.has(key)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
