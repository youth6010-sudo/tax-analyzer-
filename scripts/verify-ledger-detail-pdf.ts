/**
 * PDF 00170 파싱 + 잔액불일치 요약
 * npx tsx scripts/verify-ledger-detail-pdf.ts
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

import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import { listLedgerBalanceMismatches } from "../lib/arrearsLetterDb";

async function main() {
  const pdf = DEFAULT_LEDGER_DETAIL_PDF;
  console.log("pdf", pdf, "exists", fs.existsSync(pdf));
  const r = parseLedgerDetailPdf(pdf);
  console.log(
    "parse companies",
    r.companyCount,
    "txs",
    r.txCount,
    "debit",
    r.debitCount,
    "credit",
    r.creditCount,
  );

  const co = r.companies.find((c) => c.externalCode === "00170");
  if (!co) {
    console.log("00170 not found in PDF");
  } else {
    console.log("\n=== 00170", co.companyName, "txs", co.txs.length, "===");
    let debit = 0;
    let credit = 0;
    for (const t of co.txs) {
      console.log(t.kind, t.eventDate, t.description, t.amount);
      if (t.kind === "debit") debit += t.amount;
      else credit += t.amount;
    }
    console.log("sum debit", debit, "credit", credit, "net", debit - credit);
  }

  const mm = await listLedgerBalanceMismatches();
  console.log("\nmismatch count", mm.count);
  console.log("top 15:");
  for (const x of mm.items.slice(0, 15)) {
    console.log(
      `  ${x.externalCode} ${x.companyName} bal=${x.ledgerBalance.toLocaleString("ko-KR")} open=${x.linesOpen.toLocaleString("ko-KR")} diff=${x.diff.toLocaleString("ko-KR")}`,
    );
  }

  const tk = mm.items.find((x) => x.externalCode === "00170");
  console.log("\n00170 in mismatch?", tk ? JSON.stringify(tk) : "no (matched or absent)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
