/**
 * 1) 팀코리아-회생채권: 전기이월 → 2022-12-31 외상매출금 9,085,750
 * 2) 「전기이월」표기 전부 → 연도원장 미결제 분해(없으면 연·일자 라벨)
 *
 * npx tsx scripts/fix-carry-labels.ts [--apply]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { eq, sql } from "drizzle-orm";

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
  parseLedgerDetailPdf,
  type LedgerDetailCompany,
  type LedgerDetailTx,
} from "../lib/arrearsLedgerDetailParse";
import {
  listLetterLines,
  replaceLetterLines,
  listLedgerBalanceMismatches,
} from "../lib/arrearsLetterDb";
import { YEAR_LEDGER_DETAIL_PDFS } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");

type OpenItem = { description: string; amount: number; eventDate: string };

function isCarryDesc(desc: string): boolean {
  return /^전기이월/.test(String(desc || "").trim());
}

function labelPrior(tx: LedgerDetailTx): string {
  const y = tx.eventDate.slice(0, 4);
  const d = (tx.description || "").trim();
  if (!d || d === "입금" || d === "외상매출") {
    const md = tx.eventDate.slice(5); // MM-DD
    return `${y}년 ${md.replace("-", "월 ")}일 외상매출금`;
  }
  if (/전기이월/.test(d)) return `${y}년 미수`;
  if (/(20\d{2})년/.test(d) || /^\d{4}/.test(d)) return d;
  return `${y}년 ${d}`;
}

function computeOpenItems(
  yearCompanies: Map<number, Map<string, LedgerDetailCompany>>,
  code: string,
  throughYear: number,
  endingByYear?: Map<number, number | null>,
): OpenItem[] {
  const open: Array<OpenItem & { left: number }> = [];
  for (let y = 2022; y <= throughYear; y++) {
    const co = yearCompanies.get(y)?.get(code);
    if (!co) continue;
    for (const t of co.txs) {
      if (t.kind === "debit" && /^전기이월/.test(t.description)) continue;
      const amt = Math.round(t.amount);
      if (amt <= 0) continue;
      if (t.kind === "debit") {
        open.push({
          description: labelPrior(t),
          amount: amt,
          eventDate: t.eventDate,
          left: amt,
        });
      } else {
        let remain = amt;
        for (const o of open) {
          if (remain <= 0) break;
          if (o.left <= 0) continue;
          const use = Math.min(o.left, remain);
          o.left -= use;
          remain -= use;
        }
      }
    }
    if (endingByYear?.get(y) === 0) {
      for (const o of open) o.left = 0;
    }
  }
  return open
    .filter((o) => o.left > 0)
    .map((o) => ({
      description: o.description,
      amount: o.left,
      eventDate: o.eventDate,
    }));
}

function trimToAmount(items: OpenItem[], need: number): OpenItem[] {
  if (need <= 0) return [];
  let left = need;
  const out: OpenItem[] = [];
  for (let i = items.length - 1; i >= 0 && left > 0; i--) {
    const o = items[i];
    const use = Math.min(o.amount, left);
    out.unshift({ ...o, amount: use });
    left -= use;
  }
  if (left > 0) {
    out.unshift({
      description: "원장이월 잔여",
      amount: left,
      eventDate: "2026-01-01",
    });
  }
  return out;
}

async function main() {
  const yearPdfs = YEAR_LEDGER_DETAIL_PDFS.filter((p) => fs.existsSync(p));
  const yearCompanies = new Map<number, Map<string, LedgerDetailCompany>>();
  for (const p of yearPdfs) {
    const ym = path.basename(p).match(/(20\d{2})/);
    const year = ym ? Number(ym[1]) : 0;
    if (!year) continue;
    console.log("parsing", year);
    const detail = parseLedgerDetailPdf(p);
    const m = new Map<string, LedgerDetailCompany>();
    for (const c of detail.companies) m.set(c.externalCode, c);
    yearCompanies.set(year, m);
  }

  const endingByYear = new Map<number, Map<string, number | null>>();
  const balPath = path.join(root, ".tmp-year-balances.json");
  if (fs.existsSync(balPath)) {
    const raw = JSON.parse(fs.readFileSync(balPath, "utf8")) as {
      years: Array<{
        year?: number;
        companies?: Array<{ externalCode: string; endingBalance: number | null }>;
      }>;
    };
    for (const yf of raw.years || []) {
      if (yf.year == null) continue;
      const m = new Map<string, number | null>();
      for (const c of yf.companies || []) m.set(c.externalCode, c.endingBalance);
      endingByYear.set(yf.year, m);
    }
  }
  const endMapFor = (code: string) => {
    const m = new Map<number, number | null>();
    for (const [y, cmap] of endingByYear) m.set(y, cmap.get(code) ?? null);
    return m;
  };

  const db = getDb();
  const carryRows = await db
    .select({
      entryId: arrearsLetterLines.arrearsEntryId,
    })
    .from(arrearsLetterLines)
    .where(sql`${arrearsLetterLines.description} like '전기이월%'`);
  const entryIds = [...new Set(carryRows.map((r) => r.entryId))];
  console.log("entries with 전기이월", entryIds.length, "apply", APPLY);

  for (const id of entryIds) {
    const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.id, id));
    if (!e) continue;
    const lines = await listLetterLines(e.id);
    const carryAmt = lines
      .filter((l) => isCarryDesc(l.description) && Math.round(l.amount) > 0)
      .reduce((s, l) => s + Math.round(l.amount), 0);
    const keep = lines.filter((l) => !isCarryDesc(l.description));

    let replacements: OpenItem[] = [];

    // 회생채권: 원장 그대로 2022-12-31
    if (e.externalCode === "00234" || /회생채권/.test(e.companyName)) {
      replacements = [
        {
          description: "2022년 12월 31일 외상매출금",
          amount: carryAmt || 9085750,
          eventDate: "2022-12-31",
        },
      ];
    } else {
      const openPrior = computeOpenItems(
        yearCompanies,
        e.externalCode,
        2025,
        endMapFor(e.externalCode),
      );
      const sum = openPrior.reduce((s, o) => s + o.amount, 0);
      if (carryAmt > 0 && sum > 0) {
        replacements =
          sum === carryAmt ? openPrior : trimToAmount(openPrior, carryAmt);
      } else if (carryAmt > 0) {
        // 연도원장에서 못 찾으면 잔액 기준 라벨만 교체
        const y26 = yearCompanies.get(2026)?.get(e.externalCode);
        const pdfCarry = y26?.txs.find(
          (t) => t.kind === "debit" && /^전기이월/.test(t.description),
        );
        replacements = [
          {
            description: pdfCarry
              ? `2025년 말 미수 (${carryAmt.toLocaleString("ko-KR")})`
              : `원장이월 (${carryAmt.toLocaleString("ko-KR")})`,
            amount: carryAmt,
            eventDate: "2026-01-01",
          },
        ];
      }
    }

    const nextOpen = letterBalanceFromLines([
      ...keep.map((l) => ({ amount: l.amount, paidAmount: l.paidAmount })),
      ...replacements.map((r) => ({ amount: r.amount, paidAmount: 0 })),
    ]);
    console.log(
      `${e.externalCode} ${e.companyName} carry=${carryAmt} → ${replacements.map((r) => `${r.description}=${r.amount}`).join(" | ")} open ${letterBalanceFromLines(lines)}→${nextOpen} bal=${e.balance}`,
    );

    if (!APPLY || !replacements.length) continue;

    await replaceLetterLines(
      e.id,
      "fix-carry-labels",
      [
        ...keep.map((l) => ({
          description: l.description,
          amount: l.amount,
          paidAmount: l.paidAmount,
          paidDate: l.paidDate || "",
          source: l.source as ArrearsLetterLineSource,
        })),
        ...replacements.map((r) => ({
          description: r.description,
          amount: r.amount,
          paidAmount: 0,
          paidDate: "",
          source: "ledger" as ArrearsLetterLineSource,
        })),
      ],
      { syncBalance: false },
    );
  }

  if (!APPLY) {
    console.log("(dry-run) --apply");
    return;
  }

  // 남은 전기이월 확인
  const left = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(arrearsLetterLines)
    .where(sql`${arrearsLetterLines.description} like '전기이월%'`);
  console.log("remaining 전기이월 lines", left[0]?.n ?? 0);
  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log("mismatch", mm.count);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
