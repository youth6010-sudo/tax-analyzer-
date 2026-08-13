/**
 * 2026 PDF에 전기이월이 없는데 이전연도 분해줄이 남은 업체 정리
 * + expand 로직 버그 수정용 재적용 가드
 *
 * npx tsx scripts/strip-spurious-prior-when-no-carry.ts [--apply] [--code=01805]
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
  listLedgerBalanceMismatches,
} from "../lib/arrearsLetterDb";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");
const codeArg = process.argv.find((a) => a.startsWith("--code="))?.slice(7);

function isPriorYearLedger(desc: string): boolean {
  // 2025년 … / 2024년 … (전기이월 분해로 넣은 줄)
  return /^(20\d{2})년/.test(String(desc || "").trim());
}

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const noCarry = new Set(
    detail.companies
      .filter((c) => !c.txs.some((t) => t.kind === "debit" && /^전기이월/.test(t.description)))
      .map((c) => c.externalCode),
  );

  const yearBal = JSON.parse(
    fs.readFileSync(path.join(root, ".tmp-year-balances.json"), "utf8"),
  ) as {
    years: Array<{
      year?: number;
      companies?: Array<{ externalCode: string; endingBalance: number | null }>;
    }>;
  };
  const end2025 = new Map<string, number | null>();
  for (const yf of yearBal.years || []) {
    if (yf.year !== 2025) continue;
    for (const c of yf.companies || []) end2025.set(c.externalCode, c.endingBalance);
  }

  const db = getDb();
  const entries = codeArg
    ? await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, codeArg))
    : await db.select().from(arrearsEntries);

  const report: Array<Record<string, unknown>> = [];

  for (const e of entries) {
    if (!noCarry.has(e.externalCode) && !codeArg) continue;
    const lines = await listLetterLines(e.id);
    const priors = lines.filter(
      (l) => l.source === "ledger" && isPriorYearLedger(l.description),
    );
    if (!priors.length) continue;

    // 2025 기말 0 이거나 2026에 전기이월 없음 → 이전연도 분해줄 제거
    const e25 = end2025.get(e.externalCode);
    const shouldStrip =
      noCarry.has(e.externalCode) || e25 === 0 || e25 == null;

    if (!shouldStrip && !codeArg) continue;

    const next = lines.filter(
      (l) => !(l.source === "ledger" && isPriorYearLedger(l.description)),
    );
    const before = letterBalanceFromLines(lines);
    const after = letterBalanceFromLines(next);
    const bal = Math.round(e.balance);
    report.push({
      code: e.externalCode,
      name: e.companyName,
      bal,
      before,
      after,
      diffAfter: bal - after,
      end2025: e25 ?? "—",
      noCarry: noCarry.has(e.externalCode),
      remove: priors.map((l) => `${l.description}:${l.amount}`),
    });

    if (APPLY) {
      await replaceLetterLines(
        e.id,
        "strip-spurious-prior",
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

  report.sort((a, b) => Math.abs(Number(b.before)) - Math.abs(Number(a.before)));
  console.log("targets", report.length, "apply", APPLY);
  for (const r of report.slice(0, 40)) {
    console.log(
      `${r.code} ${r.name} bal=${r.bal} ${r.before}→${r.after} (diffAfter=${r.diffAfter}) end25=${r.end2025} remove=${(r.remove as string[]).join(", ")}`,
    );
  }

  if (APPLY) {
    const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
    console.log("mismatch", mm.count);
    if (codeArg || report.some((r) => r.code === "01805")) {
      const [e] = await db
        .select()
        .from(arrearsEntries)
        .where(eq(arrearsEntries.externalCode, "01805"));
      if (e) {
        const lines = await listLetterLines(e.id);
        console.log(
          "verify 01805",
          e.companyName,
          "bal",
          e.balance,
          "open",
          letterBalanceFromLines(lines),
        );
        for (const l of lines) {
          console.log(`  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount}`);
        }
      }
    }
  } else console.log("(dry-run) --apply");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
