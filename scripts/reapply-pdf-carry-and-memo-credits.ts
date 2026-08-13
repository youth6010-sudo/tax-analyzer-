/**
 * PDF 파서 수정분 반영: ledger/payment 줄 교체(공문 letter 유지)
 * — 전기이월 누락 · 이름+신고 입금이 청구로 잡힌 업체
 *
 * npx tsx scripts/reapply-pdf-carry-and-memo-credits.ts [--apply] [--code=00135]
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

function isMemoCredit(desc: string, kind: string): boolean {
  if (kind !== "credit") return false;
  const d = desc.replace(/\s+/g, "");
  if (d.endsWith("부가세신고") && !d.startsWith("부가세")) return true;
  if (/다산신고$/.test(d)) return true;
  return false;
}

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const targets = detail.companies.filter((c) => {
    if (codeArg) return c.externalCode === codeArg;
    // 이름+부가세신고 입금 오분류 업체 + 김군/다산
    if (["00135", "01192"].includes(c.externalCode)) return true;
    return c.txs.some((t) => isMemoCredit(t.description, t.kind));
  });

  console.log(
    "targets",
    targets.length,
    targets
      .slice(0, 20)
      .map((c) => c.externalCode)
      .join(","),
    APPLY,
  );

  // preview 김군/다산
  for (const code of ["00135", "01192"]) {
    const co = detail.companies.find((c) => c.externalCode === code);
    if (!co) continue;
    console.log(
      `\nPDF ${code}`,
      co.txs
        .filter((t) => /이월|신고|부가/.test(t.description) || t.kind === "credit")
        .map((t) => `${t.kind} ${t.eventDate} ${t.description} ${t.amount}`)
        .join(" | "),
    );
  }

  if (!APPLY) {
    console.log("\n(dry-run) --apply 로 letter 유지·ledger/payment 교체");
    return;
  }

  const db = getDb();
  let n = 0;
  for (const co of targets) {
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, co.externalCode));
    if (!e) continue;
    const existing = await listLetterLines(e.id);
    const letters = existing.filter((l) => l.source === "letter");
    await replaceLetterLines(
      e.id,
      "reapply-pdf-carry-memo",
      letters.map((l) => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate || "",
        source: "letter" as ArrearsLetterLineSource,
      })),
      { syncBalance: false },
    );
    n += 1;
  }

  const applied = await applyLedgerDetailTxs(targets, "reapply-pdf-carry-memo");
  console.log("stripped", n, "applied", applied);

  for (const code of codeArg ? [codeArg] : ["00135", "01192"]) {
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, code));
    if (!e) continue;
    const lines = await listLetterLines(e.id);
    const open = letterBalanceFromLines(lines);
    console.log(
      `\nverify ${code} ${e.companyName} bal=${e.balance} open=${open} diff=${e.balance - open}`,
    );
    for (const l of lines) {
      console.log(
        `  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount} ${l.paidDate || ""}`,
      );
    }
  }

  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log("\nmismatch", mm.count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
