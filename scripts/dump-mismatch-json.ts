/**
 * 잔액불일치 JSON 덤프
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { asc, eq, like, sql } from "drizzle-orm";

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
import { listLedgerBalanceMismatches } from "../lib/arrearsLetterDb";
import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";

async function main() {
  const db = getDb();
  const mm = await listLedgerBalanceMismatches();
  const pdf = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const byCode = new Map(pdf.companies.map((c) => [c.externalCode, c]));
  const [letterOnly] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(arrearsEntries)
    .where(like(arrearsEntries.externalCode, "letter:%"));

  const items = [];
  for (const x of mm.items) {
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, x.entryId))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    const by: Record<string, number> = {};
    let letterOpen = 0;
    for (const l of lines) {
      by[l.source] = (by[l.source] || 0) + 1;
      if (l.source === "letter") letterOpen += l.amount - l.paidAmount;
    }
    const co = byCode.get(x.externalCode);
    let pdfDebit = 0;
    let pdfCredit = 0;
    let pdfDebitN = 0;
    let pdfCreditN = 0;
    const pdfSample: string[] = [];
    if (co) {
      for (const t of co.txs) {
        if (t.kind === "debit") {
          pdfDebit += t.amount;
          pdfDebitN += 1;
        } else {
          pdfCredit += t.amount;
          pdfCreditN += 1;
        }
        if (pdfSample.length < 6) {
          pdfSample.push(`${t.kind} ${t.eventDate} ${t.description} ${t.amount}`);
        }
      }
    }
    const hasLetter = (by.letter || 0) > 0;
    let category = "";
    if (x.externalCode === "00234") category = "A_회생채권분리";
    else if (!hasLetter && x.linesOpen === 0 && x.ledgerBalance !== 0)
      category = "B_원장잔액만_내역순0";
    else if (!co && hasLetter) category = "C_공문만_PDF없음";
    else if (x.linesOpen < 0 && pdfCredit > pdfDebit) category = "D_PDF대변과다_반환중복";
    else if (!hasLetter && Math.abs(x.linesOpen - (pdfDebit - pdfCredit)) < 2)
      category = "E_PDF2026만_전기이월미포함";
    else if (hasLetter && Math.abs(x.diff) >= 440000) category = "F_공문역사갭_또는이중";
    else if (Math.abs(x.diff) === 110000 || Math.abs(x.diff) === 165000 || Math.abs(x.diff) === 220000 || Math.abs(x.diff) === 275000 || Math.abs(x.diff) === 330000 || Math.abs(x.diff) === 440000)
      category = "G_월수수료1개월분갭";
    else category = "H_기타";

    items.push({
      code: x.externalCode,
      name: x.companyName,
      ledger: x.ledgerBalance,
      open: x.linesOpen,
      diff: x.diff,
      sources: by,
      letterOpen,
      pdfDebitN,
      pdfCreditN,
      pdfDebit,
      pdfCredit,
      pdfNet: pdfDebit - pdfCredit,
      category,
      pdfSample,
    });
  }

  const byCat: Record<string, number> = {};
  for (const i of items) byCat[i.category] = (byCat[i.category] || 0) + 1;

  const out = {
    letterOnly: letterOnly?.n ?? 0,
    mismatchCount: mm.count,
    byCategory: byCat,
    items,
  };
  const outPath = path.join(root, "scripts", ".mismatch-classify.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log("wrote", outPath, "count", mm.count, JSON.stringify(byCat));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
