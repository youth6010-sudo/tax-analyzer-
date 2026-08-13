/**
 * 더좋은사람들(01407): 공문만으로 잔액 일치 → 전기이월·PDF취소 중복 제거
 * + 동일 패턴 자동 정리 (letter open == bal 인데 ledger/payment 있음)
 *
 * npx tsx scripts/fix-letter-covers-balance.ts [--apply] [--code=01407]
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
  replaceLetterLines,
  listLedgerBalanceMismatches,
} from "../lib/arrearsLetterDb";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");
const codeArg = process.argv.find((a) => a.startsWith("--code="))?.slice(7);

async function main() {
  const db = getDb();
  const entries = codeArg
    ? await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, codeArg))
    : await db.select().from(arrearsEntries);

  const report: Array<Record<string, unknown>> = [];

  for (const e of entries) {
    const lines = await listLetterLines(e.id);
    const letters = lines.filter((l) => l.source === "letter");
    if (!letters.length) continue;
    const extras = lines.filter((l) => l.source !== "letter");
    if (!extras.length) continue;

    const letterOpen = letterBalanceFromLines(letters);
    const fullOpen = letterBalanceFromLines(lines);
    const bal = Math.round(e.balance);

    // 공문만으로 잔액이 맞는데 PDF/이월이 붙어 어긋난 경우
    if (letterOpen === bal && fullOpen !== bal) {
      report.push({
        code: e.externalCode,
        name: e.companyName,
        bal,
        letterOpen,
        fullOpen,
        extras: extras.map((l) => `${l.source}:${l.description}:${l.amount}/${l.paidAmount}`),
      });
      if (APPLY) {
        await replaceLetterLines(
          e.id,
          "fix-letter-covers",
          letters.map((l) => ({
            description: l.description,
            amount: l.amount,
            paidAmount: l.paidAmount,
            paidDate: l.paidDate || "",
            source: "letter" as ArrearsLetterLineSource,
          })),
          { syncBalance: false },
        );
      }
    }
  }

  console.log("targets", report.length, "apply", APPLY);
  for (const r of report) {
    console.log(
      `\n${r.code} ${r.name} bal=${r.bal} letterOpen=${r.letterOpen} fullOpen=${r.fullOpen}`,
    );
    console.log("  remove:", (r.extras as string[]).join(" | "));
  }

  if (APPLY) {
    for (const code of report.map((r) => String(r.code))) {
      const [e] = await db
        .select()
        .from(arrearsEntries)
        .where(eq(arrearsEntries.externalCode, code));
      if (!e) continue;
      const lines = await listLetterLines(e.id);
      console.log(
        "verify",
        code,
        e.companyName,
        "bal",
        e.balance,
        "open",
        letterBalanceFromLines(lines),
        "lines",
        lines.length,
      );
    }
    const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
    console.log("mismatch", mm.count);
  } else {
    console.log("\n(dry-run) --apply");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
