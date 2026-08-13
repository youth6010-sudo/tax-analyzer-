/**
 * 잔액불일치 전수 — 원인 분류용
 * npx tsx scripts/classify-mismatches.ts
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

type SrcCount = Record<string, number>;

async function main() {
  const db = getDb();
  const mm = await listLedgerBalanceMismatches();
  const pdf = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const byCode = new Map(pdf.companies.map((c) => [c.externalCode, c]));

  const letterOnly = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(arrearsEntries)
    .where(like(arrearsEntries.externalCode, "letter:%"));
  console.log("연결필요 letter:", letterOnly[0]?.n);
  console.log("불일치 건수:", mm.count);
  console.log("");

  for (const x of mm.items) {
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, x.entryId))
      .orderBy(asc(arrearsLetterLines.sortOrder));

    const by: SrcCount = {};
    let charge = 0;
    let paid = 0;
    let letterCharge = 0;
    let letterPaid = 0;
    let ledgerCharge = 0;
    let payOnly = 0;
    for (const l of lines) {
      by[l.source] = (by[l.source] || 0) + 1;
      charge += l.amount;
      paid += l.paidAmount;
      if (l.source === "letter") {
        letterCharge += l.amount;
        letterPaid += l.paidAmount;
      }
      if (l.source === "ledger") ledgerCharge += l.amount;
      if (l.source === "payment") payOnly += l.paidAmount;
    }

    const co = byCode.get(x.externalCode);
    let pdfDebit = 0;
    let pdfCredit = 0;
    let pdfDebitN = 0;
    let pdfCreditN = 0;
    if (co) {
      for (const t of co.txs) {
        if (t.kind === "debit") {
          pdfDebit += t.amount;
          pdfDebitN += 1;
        } else {
          pdfCredit += t.amount;
          pdfCreditN += 1;
        }
      }
    }

    const hasLetter = (by.letter || 0) > 0;
    const reasons: string[] = [];

    if (x.externalCode === "00234") {
      reasons.push("회생채권 분리코드(광주 00170과 별도, 범위밖)");
    }
    if (!hasLetter && x.linesOpen === 0 && x.ledgerBalance !== 0) {
      reasons.push("공문없음+PDF미반영/내역0 — 원장잔액만 존재");
    }
    if (!hasLetter && pdfCreditN > pdfDebitN * 2 && pdfCredit > pdfDebit) {
      reasons.push("PDF대변>차변(반환·중복입금·인명입금)");
    }
    if (hasLetter && payOnly > 0 && x.linesOpen < x.ledgerBalance - 1000) {
      // open too low = too much payment or missing charge
    }
    if (x.linesOpen < 0) {
      reasons.push("내역음수=입금과다/청구미반영");
    }
    if (hasLetter && Math.abs(x.diff) > 0) {
      const letterOpen = letterCharge - letterPaid;
      // historical letter vs ledger carry gap
      if (Math.abs(letterOpen + ledgerCharge - payOnly - x.ledgerBalance) < Math.abs(x.diff) + 1) {
        /* noop */
      }
      if (letterOpen !== 0 && Math.abs(x.ledgerBalance - letterOpen) > Math.abs(x.diff)) {
        reasons.push(`공문단독open=${letterOpen.toLocaleString("ko-KR")}(원장과 역사갭)`);
      }
    }
    if (co && Math.abs(pdfDebit - pdfCredit) > 0 && !hasLetter) {
      const pdfNet = pdfDebit - pdfCredit;
      if (Math.abs(pdfNet - x.linesOpen) < 2 && Math.abs(x.ledgerBalance - pdfNet) === Math.abs(x.diff)) {
        reasons.push(`PDF순액=${pdfNet.toLocaleString("ko-KR")}≈내역, 전기이월/과거미포함`);
      }
    }
    if ((by.tax || 0) > 0) reasons.push("tax줄포함");
    if (!co) reasons.push("PDF상세없음");
    if (reasons.length === 0) {
      if (x.diff > 0) reasons.push("원장>내역(청구부족또는입금과다)");
      else reasons.push("내역>원장(공문·PDF청구과다또는입금미반영)");
    }

    console.log(
      [
        x.externalCode,
        x.companyName,
        `원장=${x.ledgerBalance}`,
        `내역=${x.linesOpen}`,
        `차=${x.diff}`,
        `줄=${JSON.stringify(by)}`,
        `pdf차대=${pdfDebitN}/${pdfCreditN}(${pdfDebit}/${pdfCredit})`,
        `원인=${reasons.join("; ")}`,
      ].join(" | "),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
