/**
 * PDF 대변 누락분 강제 보충 (잔액 불일치 업체 우선)
 * npx tsx scripts/force-missing-pdf-credits.ts [--apply]
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
import {
  listLetterLines,
  replaceLetterLines,
  listLedgerBalanceMismatches,
} from "../lib/arrearsLetterDb";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");

/** 의도적으로 스킵하는 대변(공문 합산입금·반환차변화 등) */
function skipCredit(desc: string): boolean {
  const d = desc.replace(/\s+/g, "");
  if (/취소$/.test(d) && /기장수수료/.test(d)) return true;
  if (/반환/.test(d)) return true;
  return false;
}

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const db = getDb();
  const report = [];

  for (const co of detail.companies) {
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, co.externalCode));
    if (!e) continue;
    const lines = await listLetterLines(e.id);
    const bal = Math.round(e.balance);
    const open = letterBalanceFromLines(lines);
    if (bal === open) continue; // 이미 일치면 스킵

    const missing = [];
    for (const t of co.txs) {
      if (t.kind !== "credit" || t.amount <= 0) continue;
      if (skipCredit(t.description)) continue;
      const paidDate = ledgerDetailPaidDateLabel(t.eventDate);
      const amt = Math.round(t.amount);
      const has = lines.some(
        (l) =>
          Math.round(l.paidAmount) === amt &&
          String(l.paidDate || "").trim() === paidDate,
      );
      if (!has) {
        missing.push({
          description: t.description || "입금",
          amount: 0,
          paidAmount: amt,
          paidDate,
          source: "payment" as ArrearsLetterLineSource,
        });
      }
    }
    if (!missing.length) continue;
    const nextOpen = open - missing.reduce((s, m) => s + m.paidAmount, 0);
    report.push({
      code: co.externalCode,
      name: e.companyName,
      bal,
      open,
      nextOpen,
      improves: Math.abs(bal - nextOpen) < Math.abs(bal - open),
      missing: missing.map((m) => `${m.paidDate} ${m.description} ${m.paidAmount}`),
      adds: missing,
    });
  }

  report.sort((a, b) => Math.abs(b.open as number) - Math.abs(a.open as number));
  console.log("mismatch with missing credits", report.length, "apply", APPLY);
  for (const r of report) {
    console.log(
      `${r.code} ${r.name} ${r.open}→${r.nextOpen} (bal=${r.bal}) improve=${r.improves} · ${(r.missing as string[]).join(" | ")}`,
    );
  }

  if (!APPLY) {
    console.log("(dry-run)");
    return;
  }

  for (const r of report) {
    if (!r.improves && r.nextOpen !== r.bal) continue;
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, String(r.code)));
    if (!e) continue;
    const lines = await listLetterLines(e.id);
    await replaceLetterLines(
      e.id,
      "force-missing-credits",
      [
        ...lines.map((l) => ({
          description: l.description,
          amount: l.amount,
          paidAmount: l.paidAmount,
          paidDate: l.paidDate || "",
          source: l.source as ArrearsLetterLineSource,
        })),
        ...(r.adds as Array<{
          description: string;
          amount: number;
          paidAmount: number;
          paidDate: string;
          source: ArrearsLetterLineSource;
        }>),
      ],
      { syncBalance: false },
    );
    const after = await listLetterLines(e.id);
    console.log(
      "applied",
      r.code,
      r.name,
      "open",
      letterBalanceFromLines(after),
      "bal",
      e.balance,
    );
  }

  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log("mismatch", mm.count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
