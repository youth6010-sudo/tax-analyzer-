/**
 * 2026 PDF에 전기이월이 있는데 DB에 없으면 letter 유지 후 ledger/payment 재반영
 * npx tsx scripts/reapply-missing-pdf-carry.ts [--apply] [--code=00621]
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

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const db = getDb();

  const report: Array<Record<string, unknown>> = [];
  const targets = [];

  for (const co of detail.companies) {
    if (codeArg && co.externalCode !== codeArg) continue;
    const carryTx = co.txs.find(
      (t) => t.kind === "debit" && /^전기이월/.test(t.description),
    );
    if (!carryTx && !codeArg) continue;

    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, co.externalCode));
    if (!e) continue;

    const lines = await listLetterLines(e.id);
    const hasCarry = lines.some(
      (l) => l.source === "ledger" && /^전기이월/.test(l.description),
    );
    const hasLetter = lines.some((l) => l.source === "letter");
    const open = letterBalanceFromLines(lines);
    const bal = Math.round(e.balance);
    const pdfCarry = carryTx ? Math.round(carryTx.amount) : 0;

    // 이미 일치하면 건너뜀 (강제 코드 제외)
    if (!codeArg && bal === open) continue;
    if (!codeArg && hasCarry) continue;

    // 공문 있는 불일치: 전기이월만 넣어서 맞아떨어질 때만
    let mode: "full" | "carry-only" | "skip" = "skip";
    if (codeArg) mode = "full";
    else if (!hasLetter) mode = "full";
    else if (!hasCarry && pdfCarry > 0 && open + pdfCarry === bal) mode = "carry-only";
    else mode = "skip";

    if (mode === "skip") continue;

    targets.push({ co, mode, pdfCarry });
    report.push({
      code: co.externalCode,
      name: e.companyName,
      bal,
      open,
      diff: bal - open,
      pdfCarry,
      hasCarry,
      hasLetter,
      mode,
    });
  }

  report.sort((a, b) => Math.abs(Number(b.diff)) - Math.abs(Number(a.diff)));
  console.log("targets", report.length, "apply", APPLY);
  for (const r of report.slice(0, 50)) {
    console.log(
      `${r.code} ${r.name} bal=${r.bal} open=${r.open} diff=${r.diff} pdfCarry=${r.pdfCarry} letter=${r.hasLetter} mode=${r.mode}`,
    );
  }

  if (!APPLY) {
    console.log("\n(dry-run) --apply 로 반영");
    return;
  }

  const fullCos = [];
  for (const t of targets) {
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, t.co.externalCode));
    if (!e) continue;
    const existing = await listLetterLines(e.id);

    if (t.mode === "carry-only") {
      const next = [
        {
          description: "전기이월",
          amount: t.pdfCarry,
          paidAmount: 0,
          paidDate: "",
          source: "ledger" as ArrearsLetterLineSource,
        },
        ...existing.map((l) => ({
          description: l.description,
          amount: l.amount,
          paidAmount: l.paidAmount,
          paidDate: l.paidDate || "",
          source: l.source as ArrearsLetterLineSource,
        })),
      ];
      await replaceLetterLines(e.id, "reapply-missing-carry", next, {
        syncBalance: false,
      });
      continue;
    }

    const letters = existing.filter((l) => l.source === "letter");
    await replaceLetterLines(
      e.id,
      "reapply-missing-carry",
      letters.map((l) => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate || "",
        source: "letter" as ArrearsLetterLineSource,
      })),
      { syncBalance: false },
    );
    fullCos.push(t.co);
  }

  if (fullCos.length) {
    const applied = await applyLedgerDetailTxs(fullCos, "reapply-missing-carry");
    console.log("full reapply", applied);
  }

  // 하라 확인
  for (const code of codeArg ? [codeArg] : ["00621"]) {
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
