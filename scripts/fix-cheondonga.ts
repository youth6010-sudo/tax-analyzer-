/**
 * 천돈가(윤삼식) 01418 정리
 * - 공문「천돈가 양수도」는 원장상 구계정(00637)에 잔액이 남아 있어 01418 PDF와 이중 → 제거
 * - 01-10 220k는 이미 12월 기장/기타 입금으로 반영됨
 * - 2025년 7·8월 기장+기타(원장에 있음) 누락분 추가
 *
 * npx tsx scripts/fix-cheondonga.ts [--apply]
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
const CODE = "01418";

async function main() {
  const db = getDb();
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, CODE));
  if (!e) throw new Error("not found");
  const lines = await listLetterLines(e.id);

  const withoutYang = lines.filter((l) => {
    const d = (l.description || "").replace(/\s+/g, "");
    return d !== "천돈가양수도";
  });

  const hasJul = withoutYang.some((l) =>
    /2025년\s*7월\s*기장/.test(l.description || ""),
  );
  const extras: Array<{
    description: string;
    amount: number;
    paidAmount: number;
    paidDate: string;
    source: ArrearsLetterLineSource;
  }> = [];
  if (!hasJul) {
    for (const month of [7, 8]) {
      extras.push({
        description: `2025년 ${month}월 기장료`,
        amount: 165000,
        paidAmount: 0,
        paidDate: "",
        source: "ledger",
      });
      extras.push({
        description: `2025년 ${month}월 기타수수료`,
        amount: 55000,
        paidAmount: 0,
        paidDate: "",
        source: "ledger",
      });
    }
  }

  const next = [
    ...withoutYang.map((l) => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || "",
      source: l.source as ArrearsLetterLineSource,
    })),
    ...extras,
  ];

  const openBefore = letterBalanceFromLines(lines);
  const openAfter = letterBalanceFromLines(
    next.map((l, i) => ({
      id: String(i),
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate,
      source: l.source,
    })),
  );

  console.log("bal", e.balance);
  console.log("open before", openBefore, "after", openAfter);
  console.log("removed 양수도", lines.length - withoutYang.length);
  console.log(
    "added",
    extras.map((x) => `${x.description} ${x.amount}`).join(" | ") || "(none)",
  );
  console.log(
    "Jan10 payment on letter:",
    lines
      .filter((l) => String(l.paidDate || "").includes("1월 10일"))
      .map((l) => `${l.description} paid=${l.paidAmount}`)
      .join(" | "),
  );

  if (!APPLY) {
    console.log("(dry-run) --apply");
    return;
  }

  await replaceLetterLines(e.id, "fix-cheondonga", next, { syncBalance: false });
  const after = await listLetterLines(e.id);
  console.log("applied open", letterBalanceFromLines(after), "bal", e.balance);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
