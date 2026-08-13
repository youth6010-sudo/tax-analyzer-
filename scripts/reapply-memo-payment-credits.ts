/**
 * 이름+기장료 등 입금적요가 청구로 오분류·누락된 업체 재반영
 * npx tsx scripts/reapply-memo-payment-credits.ts [--apply]
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
import { ledgerDetailPaidDateLabel } from "../lib/arrearsLedgerDetailParse";

const APPLY = process.argv.includes("--apply");

function isMemoFeeCredit(desc: string, kind: string): boolean {
  if (kind !== "credit") return false;
  const d = desc.replace(/\s+/g, "");
  if (/^(\d{1,2}월|\d{2}년|\d{2}\.|기타|부가|법인|개인|성실|세무|컨설팅|20\d{2})/.test(d)) {
    return false;
  }
  if (d.endsWith("부가세신고") && !d.startsWith("부가세")) return true;
  if (d.endsWith("부가세") && !d.startsWith("부가세")) return true;
  if (/.+다산신고$/.test(d)) return true;
  return /\d{1,2}월기장/.test(d) || /(기장료|기장수수료)$/.test(d);
}

function isPriorYearLedger(desc: string): boolean {
  return /^(20\d{2})년/.test(String(desc || "").trim());
}

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const db = getDb();

  const targets = [];
  for (const co of detail.companies) {
    const memoCredits = co.txs.filter((t) => isMemoFeeCredit(t.description, t.kind));
    if (!memoCredits.length) continue;

    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, co.externalCode));
    if (!e) continue;
    const lines = await listLetterLines(e.id);

    const missing = [];
    for (const t of memoCredits) {
      const paidDate = ledgerDetailPaidDateLabel(t.eventDate);
      const has = lines.some(
        (l) =>
          Math.round(l.paidAmount) === Math.round(t.amount) &&
          (String(l.paidDate || "").trim() === paidDate ||
            (l.description || "").replace(/\s+/g, "") === t.description.replace(/\s+/g, "")),
      );
      if (!has) missing.push(`${t.eventDate} ${t.description} ${t.amount}`);
    }
    if (!missing.length) continue;
    targets.push({
      co,
      name: e.companyName,
      bal: e.balance,
      open: letterBalanceFromLines(lines),
      missing,
    });
  }

  console.log("missing memo-payment credits", targets.length, "apply", APPLY);
  for (const t of targets) {
    console.log(
      `${t.co.externalCode} ${t.name} bal=${t.bal} open=${t.open} · ${t.missing.join(" | ")}`,
    );
  }

  if (!APPLY) {
    console.log("(dry-run) --apply");
    return;
  }

  for (const t of targets) {
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, t.co.externalCode));
    if (!e) continue;
    const existing = await listLetterLines(e.id);
    // letter + prior-year 유지, 2026 ledger/payment 교체
    const keep = existing.filter(
      (l) =>
        l.source === "letter" ||
        (l.source === "ledger" && isPriorYearLedger(l.description)),
    );
    const hasPrior = keep.some((l) => l.source === "ledger" && isPriorYearLedger(l.description));
    await replaceLetterLines(
      e.id,
      "reapply-memo-pay",
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
      ? t.co.txs.filter((x) => !(x.kind === "debit" && /^전기이월/.test(x.description)))
      : t.co.txs;
    // letter covers skip 우회: 공문이 잔액을 맞춰도 이 케이스는 PDF 입금 누락 복구
    // applyLedgerDetailTxs가 letterOpen===bal 이면 skip → 강제 적용 위해 임시로 payment만 직접 추가할 수도
    await applyLedgerDetailTxs([{ ...t.co, txs }], "reapply-memo-pay");
  }

  // letter-covers로 스킵된 경우 누락 입금만 직접 추가
  for (const t of targets) {
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, t.co.externalCode));
    if (!e) continue;
    let lines = await listLetterLines(e.id);
    const stillMissing = [];
    for (const tx of t.co.txs.filter((x) => isMemoFeeCredit(x.description, x.kind))) {
      const paidDate = ledgerDetailPaidDateLabel(tx.eventDate);
      const has = lines.some(
        (l) =>
          Math.round(l.paidAmount) === Math.round(tx.amount) &&
          String(l.paidDate || "").trim() === paidDate,
      );
      if (!has) stillMissing.push(tx);
    }
    if (!stillMissing.length) continue;
    const next = [
      ...lines.map((l) => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate || "",
        source: l.source as ArrearsLetterLineSource,
      })),
      ...stillMissing.map((tx) => ({
        description: tx.description,
        amount: 0,
        paidAmount: Math.round(tx.amount),
        paidDate: ledgerDetailPaidDateLabel(tx.eventDate),
        source: "payment" as ArrearsLetterLineSource,
      })),
    ];
    await replaceLetterLines(e.id, "reapply-memo-pay-force", next, { syncBalance: false });
    lines = await listLetterLines(e.id);
    console.log(
      "forced",
      t.co.externalCode,
      t.name,
      "open",
      letterBalanceFromLines(lines),
      "added",
      stillMissing.length,
    );
  }

  for (const code of ["01960"]) {
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
  console.log("mismatch", mm.count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
