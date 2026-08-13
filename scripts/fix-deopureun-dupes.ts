/**
 * 더푸른(00165): 세무조정료↔법인조정료 중복, 부가세 스테이s 중복 제거
 * npx tsx scripts/fix-deopureun-dupes.ts
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
} from "../lib/arrearsLetterDb";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";
import { ledgerDetailChargeDedupKey } from "../lib/arrearsLedgerDetailParse";

async function main() {
  const db = getDb();
  const [e] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, "00165"));
  if (!e) throw new Error("00165 not found");

  const existing = await listLetterLines(e.id);
  const before = letterBalanceFromLines(existing);
  console.log("before bal", e.balance, "open", before, "diff", e.balance - before);

  // 공문 세무조정료 유지, PDF 25년 법인조정료 제거
  // 부가세 신고 - 스테이s스터디카폐(7월 중복) 제거 — 1월 스테이S·공문 합산과 중복
  const removed: string[] = [];
  const kept = existing.filter((l) => {
    const desc = l.description || "";
    // PDF「25년 법인조정료」— 공문「세무조정료」와 동일
    if (l.source === "ledger" && /법인조정/.test(desc) && l.amount === 1100000) {
      removed.push(`법인조정료 ${l.amount}`);
      return false;
    }
    // PDF 7월「부가세 신고 - 스테이s스터디카폐」(카폐 오탈자) — 1월 스테이S와 중복
    if (l.source === "ledger" && /스테이/i.test(desc) && /카폐/.test(desc) && l.amount === 55000) {
      removed.push(`부가세스테이s중복 ${l.amount} (${desc})`);
      return false;
    }
    return true;
  });

  // 안전: 세무조정료·법인조정 키가 둘 다 있으면 ledger 쪽만 추가 제거
  const keys = new Map<string, typeof kept>();
  const deduped = [];
  for (const l of kept) {
    if (l.amount <= 0) {
      deduped.push(l);
      continue;
    }
    const key = ledgerDetailChargeDedupKey(l.description, l.amount);
    const prev = keys.get(key);
    if (!prev) {
      keys.set(key, [l]);
      deduped.push(l);
      continue;
    }
    // letter 우선 유지
    if (l.source !== "letter" && prev.some((p) => p.source === "letter")) {
      removed.push(`dedup ${l.source}:${l.description}:${l.amount}`);
      continue;
    }
    keys.get(key)!.push(l);
    deduped.push(l);
  }

  const after = letterBalanceFromLines(deduped);
  console.log("removed", removed);
  console.log("after open", after, "diff", e.balance - after);

  await replaceLetterLines(
    e.id,
    "fix-deopureun",
    deduped.map((l) => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || "",
      source: l.source as ArrearsLetterLineSource,
    })),
    { syncBalance: false },
  );

  const verify = await listLetterLines(e.id);
  console.log("verify open", letterBalanceFromLines(verify), "lines", verify.length);
  for (const l of verify) {
    console.log(`  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
