/**
 * PDF 음수(취소) 반영 — letter·이전연도 분해줄 유지, 2026 ledger/payment 재적용
 * npx tsx scripts/reapply-negative-cancels.ts [--apply] [--code=00139]
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
import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import {
  listLetterLines,
  replaceLetterLines,
  applyLedgerDetailTxs,
  listLedgerBalanceMismatches,
} from "../lib/arrearsLetterDb";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");
const codeArg = process.argv.find((a) => a.startsWith("--code="))?.slice(7);

function isPriorYearLedger(desc: string): boolean {
  return /^(20\d{2})년/.test(String(desc || "").trim());
}

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const targets = detail.companies.filter((c) => {
    if (codeArg) return c.externalCode === codeArg;
    return c.txs.some((t) => /취소/.test(t.description));
  });

  console.log("cancel targets", targets.length, "apply", APPLY);
  for (const c of targets) {
    const cancels = c.txs.filter((t) => /취소/.test(t.description));
    console.log(
      `${c.externalCode} ${c.companyName} · ${cancels.map((t) => `${t.eventDate} ${t.description} ${t.amount}`).join(" | ")}`,
    );
  }
  if (!APPLY) {
    console.log("(dry-run) --apply");
    return;
  }

  const db = getDb();
  for (const co of targets) {
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, co.externalCode));
    if (!e) continue;

    const existing = await listLetterLines(e.id);
    const keep = existing.filter(
      (l) => l.source === "letter" || (l.source === "ledger" && isPriorYearLedger(l.description)),
    );
    const hasPrior = keep.some((l) => l.source === "ledger" && isPriorYearLedger(l.description));

    await replaceLetterLines(
      e.id,
      "reapply-neg-cancel",
      keep.map((l) => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate || "",
        source: l.source as ArrearsLetterLineSource,
      })),
      { syncBalance: false },
    );

    const txs = hasPrior
      ? co.txs.filter((t) => !(t.kind === "debit" && /^전기이월/.test(t.description)))
      : co.txs;

    await applyLedgerDetailTxs([{ ...co, txs }], "reapply-neg-cancel");

    const after = await listLetterLines(e.id);
    const open = letterBalanceFromLines(after);
    const cancels = after.filter((l) => /취소/.test(l.description));
    console.log(
      `verify ${co.externalCode} ${e.companyName} bal=${e.balance} open=${open} diff=${e.balance - open} cancelLines=${cancels.length}`,
    );
    for (const l of cancels) {
      console.log(`  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount} ${l.paidDate || ""}`);
    }
  }

  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log("mismatch", mm.count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
