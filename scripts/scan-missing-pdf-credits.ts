/**
 * PDF 대변(입금)이 DB에 없는 업체 스캔
 * npx tsx scripts/scan-missing-pdf-credits.ts
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
import {
  parseLedgerDetailPdf,
  ledgerDetailPaidDateLabel,
} from "../lib/arrearsLedgerDetailParse";
import { listLetterLines } from "../lib/arrearsLetterDb";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const db = getDb();
  const rows = [];

  for (const co of detail.companies) {
    const credits = co.txs.filter((t) => t.kind === "credit" && t.amount > 0);
    if (!credits.length) continue;
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, co.externalCode));
    if (!e) continue;
    const lines = await listLetterLines(e.id);
    const missing = [];
    for (const t of credits) {
      const paidDate = ledgerDetailPaidDateLabel(t.eventDate);
      const amt = Math.round(t.amount);
      const has = lines.some(
        (l) =>
          Math.round(l.paidAmount) === amt &&
          (String(l.paidDate || "").trim() === paidDate ||
            (l.description || "").replace(/\s+/g, "") ===
              (t.description || "").replace(/\s+/g, "")),
      );
      if (!has) missing.push(`${t.eventDate} ${t.description} ${amt}`);
    }
    if (!missing.length) continue;
    rows.push({
      code: co.externalCode,
      name: e.companyName,
      bal: e.balance,
      open: letterBalanceFromLines(lines),
      missing,
    });
  }

  rows.sort((a, b) => b.missing.length - a.missing.length);
  console.log("companies missing PDF credits", rows.length);
  for (const r of rows.slice(0, 40)) {
    console.log(
      `${r.code} ${r.name} bal=${r.bal} open=${r.open} · ${r.missing.join(" | ")}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
