/**
 * 기장+기타 각각 입금된 날, PDF 합산입금(둘 합)이 또 있으면 중복 → payment 줄 제거
 * npx tsx scripts/fix-combined-fee-pay-dupes.ts [--apply] [--code=00611]
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
  listLetterLines,
  listLedgerBalanceMismatches,
  replaceLetterLines,
} from "../lib/arrearsLetterDb";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");
const codeArg = process.argv.find((a) => a.startsWith("--code="))?.slice(7);

type L = {
  description: string;
  amount: number;
  paidAmount: number;
  paidDate: string;
  source: string;
};

function normDate(d: string): string {
  return String(d || "")
    .replace(/\s+/g, "")
    .replace(/월/g, "월")
    .trim();
}

function isGijangCharge(desc: string): boolean {
  const d = desc.replace(/\s+/g, "");
  if (/기타/.test(d)) return false;
  // 2025년 7월 / 7월 기장수수료 / 기장료
  return (
    /기장/.test(d) ||
    /(?:20)?\d{2}년\d{1,2}월/.test(d) ||
    /^\d{1,2}월$/.test(d)
  );
}

function isGitaCharge(desc: string): boolean {
  const d = desc.replace(/\s+/g, "");
  return /기타/.test(d);
}

function findDupCombinedPayments(lines: L[]): L[] {
  // 같은 paidDate에 기장·기타가 각각 paidAmount>0 이고, 그 합과 같은 payment-only 줄이 있으면 중복
  const byDate = new Map<string, L[]>();
  for (const l of lines) {
    if (l.paidAmount <= 0 || !l.paidDate) continue;
    if (l.amount <= 0) continue; // charge lines with payment allocated
    const d = normDate(l.paidDate);
    const arr = byDate.get(d) ?? [];
    arr.push(l);
    byDate.set(d, arr);
  }

  const remove: L[] = [];
  const removeKeys = new Set<string>();

  for (const [date, charged] of byDate) {
    const gijang = charged.filter((l) => isGijangCharge(l.description));
    const gita = charged.filter((l) => isGitaCharge(l.description));
    if (!gijang.length || !gita.length) continue;

    // 같은 날짜에 기장 paid 합 + 기타 paid 합
    const sumG = gijang.reduce((s, l) => s + l.paidAmount, 0);
    const sumT = gita.reduce((s, l) => s + l.paidAmount, 0);
    const combined = sumG + sumT;
    if (combined <= 0) continue;

    // payment-only (또는 amount=0) on same date with paidAmount === combined
    for (const l of lines) {
      if (normDate(l.paidDate) !== date) continue;
      if (l.amount > 0) continue; // not payment-only
      if (l.paidAmount !== combined) continue;
      // letter empty-desc payment on same day for 법인 등 큰 금액은 combined가 330k 수준일 때
      const key = `${l.source}|${l.description}|${l.paidAmount}|${l.paidDate}`;
      if (removeKeys.has(key)) continue;
      removeKeys.add(key);
      remove.push(l);
    }
  }

  return remove;
}

async function main() {
  const db = getDb();
  const entries = codeArg
    ? await db
        .select()
        .from(arrearsEntries)
        .where(eq(arrearsEntries.externalCode, codeArg))
    : await db.select().from(arrearsEntries);

  const report: Array<Record<string, unknown>> = [];

  for (const e of entries) {
    const lines = await listLetterLines(e.id);
    if (lines.length < 3) continue;
    const dups = findDupCombinedPayments(lines);
    if (!dups.length) continue;

    const removeKeys = new Set(
      dups.map((l) => `${l.source}|${l.description}|${l.paidAmount}|${l.paidDate}`),
    );
    const next = lines.filter(
      (l) =>
        !removeKeys.has(
          `${l.source}|${l.description}|${l.paidAmount}|${l.paidDate}`,
        ),
    );
    const open = letterBalanceFromLines(lines);
    const openAfter = letterBalanceFromLines(next);
    const bal = Math.round(e.balance);
    report.push({
      code: e.externalCode,
      name: e.companyName,
      bal,
      open,
      openAfter,
      diff: bal - open,
      diffAfter: bal - openAfter,
      remove: dups.map((l) => `${l.paidDate} ${l.paidAmount} [${l.source}] ${l.description || "입금"}`),
      improved: Math.abs(bal - openAfter) < Math.abs(bal - open),
    });

    if (APPLY) {
      await replaceLetterLines(
        e.id,
        "fix-combined-fee-pay",
        next.map((l) => ({
          description: l.description,
          amount: l.amount,
          paidAmount: l.paidAmount,
          paidDate: l.paidDate || "",
          source: l.source as ArrearsLetterLineSource,
        })),
        { syncBalance: false },
      );
    }
  }

  report.sort((a, b) => Math.abs(Number(b.diff)) - Math.abs(Number(a.diff)));
  console.log("found", report.length, "apply", APPLY);
  for (const r of report) {
    console.log(
      `\n${r.code} ${r.name} ${r.diff}→${r.diffAfter} improved=${r.improved}`,
    );
    console.log("  remove:", (r.remove as string[]).join(" | "));
  }

  if (APPLY) {
    // 합산입금 제거 후 빠진 PDF 청구(예: 7월 기타수수료) 보충, 합산입금은 재적용 안 됨
    const { parseLedgerDetailPdf } = await import("../lib/arrearsLedgerDetailParse");
    const { applyLedgerDetailTxs } = await import("../lib/arrearsLetterDb");
    const { DEFAULT_LEDGER_DETAIL_PDF } = await import("../lib/arrearsStackConfig");
    if (fs.existsSync(DEFAULT_LEDGER_DETAIL_PDF)) {
      const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
      const codes = new Set(report.map((r) => String(r.code)));
      const subset = detail.companies.filter((c) => codes.has(c.externalCode));
      if (subset.length) {
        const applied = await applyLedgerDetailTxs(subset, "fix-combined-fee-pay");
        console.log("pdf reapply subset", applied);
      }
    }

    // 심데코 등 재확인
    for (const code of report.map((r) => String(r.code))) {
      const [e] = await db
        .select()
        .from(arrearsEntries)
        .where(eq(arrearsEntries.externalCode, code));
      if (!e) continue;
      const lines = await listLetterLines(e.id);
      const open = letterBalanceFromLines(lines);
      console.log(
        "verify",
        code,
        e.companyName,
        "bal",
        e.balance,
        "open",
        open,
        "diff",
        e.balance - open,
      );
    }

    const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
    console.log("\nmismatch after", mm.count);
  } else {
    console.log("\n(dry-run) --apply 로 반영");
  }

  fs.writeFileSync(
    path.join(root, "scripts", ".fix-combined-fee-pay.json"),
    JSON.stringify({ apply: APPLY, report }, null, 2),
    "utf8",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
