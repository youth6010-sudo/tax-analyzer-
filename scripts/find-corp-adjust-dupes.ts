/**
 * 공문 법인세·세무조정 등과 PDF 법인조정료 중복 후보 탐지
 * npx tsx scripts/find-corp-adjust-dupes.ts [--apply]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { asc, eq, inArray } from "drizzle-orm";

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
import { arrearsEntries, arrearsLetterLines } from "../db/schema";
import {
  listLedgerBalanceMismatches,
  listLetterLines,
  replaceLetterLines,
} from "../lib/arrearsLetterDb";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";
import { ledgerDetailChargeDedupKey } from "../lib/arrearsLedgerDetailParse";

const APPLY = process.argv.includes("--apply");

type L = {
  id?: string;
  description: string;
  amount: number;
  paidAmount: number;
  paidDate: string;
  source: string;
};

function isLetterCorpFee(desc: string): boolean {
  const d = desc.replace(/\s+/g, "");
  // 공문 쪽: 세무조정료, 법인세 신고/성실/조정 수수료 등
  if (/세무조정/.test(d)) return true;
  if (/법인세/.test(d) && /(신고|성실|조정|수수료)/.test(d)) return true;
  if (/법인조정/.test(d)) return true;
  return false;
}

function isLedgerCorpAdjust(desc: string): boolean {
  const d = desc.replace(/\s+/g, "");
  return /법인조정/.test(d) || (/25년|26년/.test(d) && /법인조정/.test(d));
}

async function main() {
  const db = getDb();
  // 불일치 + 전체에서 letter 법인성 수수료 + ledger 법인조정 동시 보유
  const entries = await db
    .select({
      id: arrearsEntries.id,
      externalCode: arrearsEntries.externalCode,
      companyName: arrearsEntries.companyName,
      balance: arrearsEntries.balance,
    })
    .from(arrearsEntries);

  const mm = await listLedgerBalanceMismatches({ kind: "all" });
  const mmById = new Map(mm.items.map((i) => [i.entryId, i]));

  const candidates: Array<{
    code: string;
    name: string;
    bal: number;
    open: number;
    diff: number;
    letterFees: string[];
    ledgerFees: string[];
    remove: string[];
    openAfter: number;
    diffAfter: number;
    fixesDiff: boolean;
  }> = [];

  for (const e of entries) {
    const lines = await listLetterLines(e.id);
    if (!lines.length) continue;
    const letterFees = lines.filter(
      (l) => l.source === "letter" && l.amount > 0 && isLetterCorpFee(l.description),
    );
    const ledgerFees = lines.filter(
      (l) => l.source === "ledger" && l.amount > 0 && isLedgerCorpAdjust(l.description),
    );
    if (!letterFees.length || !ledgerFees.length) continue;

    // 금액이 공문 법인성 수수료 합/개별과 맞거나, dedup키가 겹치면 중복
    const letterKeys = new Set(
      letterFees.map((l) => ledgerDetailChargeDedupKey(l.description, l.amount)),
    );
    const letterAmts = new Set(letterFees.map((l) => l.amount));
    const letterSum = letterFees.reduce((s, l) => s + l.amount, 0);

    const toRemove: typeof lines = [];
    for (const lf of ledgerFees) {
      const key = ledgerDetailChargeDedupKey(lf.description, lf.amount);
      const amtMatch =
        letterAmts.has(lf.amount) ||
        letterKeys.has(key) ||
        // 공문에 신고+성실 등으로 쪼개져 있고 합이 법인조정과 같은 경우
        letterSum === lf.amount ||
        // 공문 중 일부가 같은 금액
        letterFees.some((x) => x.amount === lf.amount);
      // 세무조정/법인조정 키 통일 후 공문에 법인조정 키가 있으면 중복
      const keyClash =
        key.startsWith("법인조정|") &&
        letterFees.some(
          (x) => ledgerDetailChargeDedupKey(x.description, x.amount) === key,
        );
      // 공문에 세무조정·법인세* 있고 원장에 같은 금액 법인조정
      const softClash =
        letterFees.some((x) => /세무조정|법인세|법인조정/.test(x.description.replace(/\s+/g, ""))) &&
        letterAmts.has(lf.amount);

      if (keyClash || softClash || (amtMatch && letterFees.length > 0)) {
        // 너무 공격적일 수 있음: softClash만으로 금액 동일한 다른 수수료 제거 위험
        // → keyClash 우선, 아니면 softClash + (세무조정 있거나 법인세신고/성실)
        if (
          keyClash ||
          (softClash &&
            letterFees.some((x) =>
              /세무조정|법인세.*(신고|성실|조정)|법인조정/.test(
                x.description.replace(/\s+/g, ""),
              ),
            ))
        ) {
          toRemove.push(lf);
        }
      }
    }

    if (!toRemove.length) continue;

    const removeIds = new Set(toRemove.map((l) => `${l.description}|${l.amount}|${l.source}`));
    const kept = lines.filter(
      (l) => !removeIds.has(`${l.description}|${l.amount}|${l.source}`) || l.source === "letter",
    );
    // only remove ledger copies
    const kept2 = lines.filter((l) => {
      if (l.source !== "ledger") return true;
      return !toRemove.some(
        (r) => r.description === l.description && r.amount === l.amount,
      );
    });

    const open = letterBalanceFromLines(lines);
    const openAfter = letterBalanceFromLines(kept2);
    const bal = Math.round(e.balance);
    candidates.push({
      code: e.externalCode,
      name: e.companyName,
      bal,
      open,
      diff: bal - open,
      letterFees: letterFees.map((l) => `${l.description}:${l.amount}`),
      ledgerFees: ledgerFees.map((l) => `${l.description}:${l.amount}`),
      remove: toRemove.map((l) => `${l.description}:${l.amount}`),
      openAfter,
      diffAfter: bal - openAfter,
      fixesDiff: Math.abs(bal - openAfter) < Math.abs(bal - open),
    });
  }

  candidates.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  console.log("candidates", candidates.length, "apply", APPLY);
  for (const c of candidates) {
    console.log(
      `\n${c.code} ${c.name} bal=${c.bal} open=${c.open}→${c.openAfter} diff=${c.diff}→${c.diffAfter} fix=${c.fixesDiff}`,
    );
    console.log("  letter:", c.letterFees.join(" | "));
    console.log("  ledger:", c.ledgerFees.join(" | "));
    console.log("  remove:", c.remove.join(" | "));
  }

  // 에스티오코아·코아*·더푸른 강제 출력
  for (const code of ["01406", "01405", "01404", "00165"]) {
    const c = candidates.find((x) => x.code === code);
    if (!c) {
      const [e] = await db
        .select()
        .from(arrearsEntries)
        .where(eq(arrearsEntries.externalCode, code));
      if (!e) continue;
      const lines = await listLetterLines(e.id);
      console.log(`\n(미검출) ${code} ${e.companyName}`);
      for (const l of lines.filter((x) => x.amount >= 100000)) {
        console.log(`  [${l.source}] ${l.description} +${l.amount}`);
      }
    }
  }

  if (!APPLY) {
    console.log("\n(dry-run) --apply 시 diff 개선되는 건만 반영");
    return;
  }

  let applied = 0;
  for (const c of candidates) {
    if (!c.fixesDiff && c.diffAfter !== 0) {
      // diffAfter===0 이면 무조건, fixesDiff면 적용
      if (c.diffAfter !== 0) continue;
    }
    if (!c.fixesDiff && Math.abs(c.diffAfter) >= Math.abs(c.diff)) continue;

    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, c.code));
    if (!e) continue;
    const lines = await listLetterLines(e.id);
    const removeSet = new Set(c.remove);
    const next = lines.filter((l) => {
      if (l.source !== "ledger") return true;
      const tag = `${l.description}:${l.amount}`;
      return !removeSet.has(tag);
    });
    await replaceLetterLines(
      e.id,
      "fix-corp-adjust-dupes",
      next.map((l) => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate || "",
        source: l.source as ArrearsLetterLineSource,
      })),
      { syncBalance: false },
    );
    applied += 1;
    console.log("applied", c.code, c.name, c.diff, "→", c.diffAfter);
  }
  console.log("applied count", applied);

  const after = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log("mismatch after", after.count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
