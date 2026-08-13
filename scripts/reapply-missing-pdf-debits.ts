/**
 * PDF 미반영 청구(특히 7월 부가세 등) 일괄 보충
 * npx tsx scripts/reapply-missing-pdf-debits.ts [--apply]
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
  ledgerDetailChargeDedupKey,
  inheritYearForMonthFeeDesc,
} from "../lib/arrearsLedgerDetailParse";
import {
  listLetterLines,
  applyLedgerDetailTxs,
  listLedgerBalanceMismatches,
} from "../lib/arrearsLetterDb";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const db = getDb();
  const missingReport: Array<Record<string, unknown>> = [];

  for (const co of detail.companies) {
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, co.externalCode));
    if (!e) continue;
    const existing = await listLetterLines(e.id);
    const chargeKeys = new Set<string>();
    const undatedVatRemain = new Map<string, number>();
    for (let i = 0; i < existing.length; i++) {
      const l = existing[i];
      if (Math.round(l.amount) <= 0) continue;
      const prev = i > 0 ? existing[i - 1].description : "";
      const desc = inheritYearForMonthFeeDesc(l.description, prev);
      const key = ledgerDetailChargeDedupKey(desc, l.amount);
      chargeKeys.add(key);
      if (/^부가세\|/.test(key)) {
        undatedVatRemain.set(key, (undatedVatRemain.get(key) || 0) + 1);
      }
    }

    const missing = [];
    for (const tx of co.txs) {
      if (tx.kind !== "debit" || tx.amount <= 0) continue;
      if (/^전기이월/.test(tx.description)) continue;
      const key = ledgerDetailChargeDedupKey(tx.description, tx.amount, tx.eventDate);
      if (chargeKeys.has(key)) continue;
      const undatedVat = key.replace(/^부가세:\d{4}-\d{2}/, "부가세");
      if (
        undatedVat !== key &&
        /^부가세\|/.test(undatedVat) &&
        (undatedVatRemain.get(undatedVat) || 0) > 0
      ) {
        undatedVatRemain.set(undatedVat, (undatedVatRemain.get(undatedVat) || 0) - 1);
        chargeKeys.add(key);
        continue;
      }
      missing.push(`${tx.eventDate} ${tx.description} ${tx.amount}`);
      chargeKeys.add(key);
    }
    if (!missing.length) continue;
    missingReport.push({
      code: co.externalCode,
      name: e.companyName,
      bal: e.balance,
      open: letterBalanceFromLines(existing),
      missing,
    });
  }

  missingReport.sort((a, b) => (b.missing as string[]).length - (a.missing as string[]).length);
  console.log("companies with missing PDF debits", missingReport.length, "apply", APPLY);
  for (const r of missingReport.slice(0, 50)) {
    console.log(
      `${r.code} ${r.name} bal=${r.bal} open=${r.open} missing=${(r.missing as string[]).join(" | ")}`,
    );
  }

  if (!APPLY) {
    console.log("(dry-run) --apply");
    return;
  }

  const codes = new Set(missingReport.map((r) => String(r.code)));
  const subset = detail.companies.filter((c) => codes.has(c.externalCode));
  const applied = await applyLedgerDetailTxs(subset, "reapply-missing-pdf-debits");
  console.log("applied", applied);

  for (const code of ["01957"]) {
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, code));
    if (!e) continue;
    const lines = await listLetterLines(e.id);
    console.log(
      "\nverify",
      code,
      e.companyName,
      "bal",
      e.balance,
      "open",
      letterBalanceFromLines(lines),
    );
    for (const l of lines) {
      console.log(`  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount} ${l.paidDate || ""}`);
    }
  }

  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log("\nmismatch", mm.count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
