/**
 * 잘못 제거된 연·월 부가세 청구 복구
 * npx tsx scripts/restore-stripped-vat-charges.ts [--apply]
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
import { listLetterLines, replaceLetterLines } from "../lib/arrearsLetterDb";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");

const RESTORE: Record<
  string,
  Array<{ description: string; amount: number; source?: ArrearsLetterLineSource }>
> = {
  "00645": [
    { description: "24년 7월 부가세신고", amount: 55000, source: "ledger" },
    { description: "25년 1월 부가세신고", amount: 55000, source: "ledger" },
  ],
  "01405": [{ description: "25년 1월 부가세신고", amount: 55000, source: "ledger" }],
  "01406": [{ description: "25년 1월 부가세신고", amount: 55000, source: "ledger" }],
  "01404": [{ description: "25년 1월 부가세신고", amount: 55000, source: "ledger" }],
  "01188": [{ description: "26.1월 부가세 신고", amount: 110000, source: "ledger" }],
};

async function main() {
  const db = getDb();
  for (const [code, adds] of Object.entries(RESTORE)) {
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, code));
    if (!e) {
      console.log("missing entry", code);
      continue;
    }
    const lines = await listLetterLines(e.id);
    const need = adds.filter((a) => {
      const d = a.description.replace(/\s+/g, "");
      return !lines.some(
        (l) =>
          (l.description || "").replace(/\s+/g, "") === d &&
          Math.round(l.amount) === a.amount,
      );
    });
    console.log(
      code,
      e.companyName,
      "bal",
      e.balance,
      "open",
      letterBalanceFromLines(lines),
      "need",
      need.length,
      need.map((n) => n.description).join(","),
    );
    if (!APPLY || !need.length) continue;
    await replaceLetterLines(
      e.id,
      "restore-vat-charges",
      [
        ...lines.map((l) => ({
          description: l.description,
          amount: l.amount,
          paidAmount: l.paidAmount,
          paidDate: l.paidDate || "",
          source: l.source as ArrearsLetterLineSource,
        })),
        ...need.map((n) => ({
          description: n.description,
          amount: n.amount,
          paidAmount: 0,
          paidDate: "",
          source: (n.source || "ledger") as ArrearsLetterLineSource,
        })),
      ],
      { syncBalance: false },
    );
    const after = await listLetterLines(e.id);
    console.log("restored", code, "open", letterBalanceFromLines(after));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
