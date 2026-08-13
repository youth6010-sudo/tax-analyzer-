/**
 * 대표 불일치 업체 PDF·내역 상세
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
import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";

const CODES = [
  "00206",
  "00212",
  "00170",
  "01418",
  "00123",
  "01206",
  "00611",
  "00213",
  "01551",
  "00162",
  "00188",
  "00165",
  "00205",
];

async function main() {
  const db = getDb();
  const pdf = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const byCode = new Map(pdf.companies.map((c) => [c.externalCode, c]));
  const out: Record<string, unknown> = {};

  for (const code of CODES) {
    const e = (
      await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, code)).limit(1)
    )[0];
    if (!e) {
      out[code] = { missing: true };
      continue;
    }
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    const open = lines.reduce((s, l) => s + l.amount - l.paidAmount, 0);
    const co = byCode.get(code);
    out[code] = {
      name: e.companyName,
      balance: e.balance,
      open,
      diff: e.balance - open,
      lines: lines.map((l) => ({
        s: l.source,
        d: l.description,
        a: l.amount,
        p: l.paidAmount,
        pd: l.paidDate,
      })),
      pdfTxs: co?.txs ?? [],
    };
  }

  fs.writeFileSync(
    path.join(root, "scripts", ".mismatch-samples.json"),
    JSON.stringify(out, null, 2),
    "utf8",
  );
  console.log("ok", Object.keys(out).length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
