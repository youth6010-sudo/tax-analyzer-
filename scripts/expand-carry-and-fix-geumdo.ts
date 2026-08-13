/**
 * 1) 음수 취소분 포함해 PDF 재반영
 * 2) 「전기이월」일괄 → 2022~2025 원장에서 FIFO로 남은 미결제 청구로 분해
 *
 * npx tsx scripts/expand-carry-and-fix-geumdo.ts [--apply] [--code=00123]
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
  type LedgerDetailCompany,
  type LedgerDetailTx,
} from "../lib/arrearsLedgerDetailParse";
import {
  listLetterLines,
  replaceLetterLines,
  applyLedgerDetailTxs,
  listLedgerBalanceMismatches,
} from "../lib/arrearsLetterDb";
import {
  DEFAULT_LEDGER_DETAIL_PDF,
  YEAR_LEDGER_DETAIL_PDFS,
} from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");
const codeArg = process.argv.find((a) => a.startsWith("--code="))?.slice(7);

type OpenItem = { description: string; amount: number; eventDate: string };

function labelPrior(tx: LedgerDetailTx): string {
  const y = tx.eventDate.slice(0, 4);
  const d = (tx.description || "").trim();
  if (!d) return `${y}년 미수`;
  if (/전기이월/.test(d)) return d;
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
      // 연도 PDF의 전기이월은 전년 미결제 요약 → 중복이므로 스킵
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
    // 해당 연도 기말잔액 0이면 미결제 없음(선입금 후청구 등 FIFO 왜곡 보정)
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

async function main() {
  const yearPdfs = YEAR_LEDGER_DETAIL_PDFS.filter((p) => fs.existsSync(p));
  console.log(
    "pdfs",
    yearPdfs.map((p) => path.basename(p)),
  );

  const yearCompanies = new Map<number, Map<string, LedgerDetailCompany>>();
  for (const p of yearPdfs) {
    const ym = path.basename(p).match(/(20\d{2})/);
    const year = ym ? Number(ym[1]) : 0;
    if (!year) continue;
    console.log("parsing", year, "...");
    const detail = parseLedgerDetailPdf(p);
    const m = new Map<string, LedgerDetailCompany>();
    for (const c of detail.companies) m.set(c.externalCode, c);
    yearCompanies.set(year, m);
    const g = m.get("00123");
    if (g) {
      const neg = g.txs.filter((t) => /취소/.test(t.description) || t.kind === "credit");
      console.log(
        `  00123 ${year}: txs=${g.txs.length} sampleCancel=`,
        g.txs.filter((t) => /취소|법인조정/.test(t.description)).map((t) => `${t.kind}:${t.description}:${t.amount}`),
      );
    }
  }

  const y26 = yearCompanies.get(2026);
  if (!y26) throw new Error("2026 pdf missing");

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

  // preview 금도
  const open00123 = computeOpenItems(yearCompanies, "00123", 2025, endMapFor("00123"));
  console.log("\n00123 open items end-2025:", open00123);
  const co26 = y26.get("00123");
  console.log(
    "00123 2026 txs with cancel:",
    co26?.txs
      .filter((t) => /법인조정|취소|전기이월/.test(t.description))
      .map((t) => `${t.kind} ${t.eventDate} ${t.description} ${t.amount}`),
  );

  if (!APPLY) {
    console.log("\n(dry-run) --apply 로 금도 재반영 + 전기이월 분해");
    return;
  }

  const db = getDb();
  let codes: string[];
  if (codeArg) {
    codes = [codeArg];
  } else {
    // DB에 「전기이월」만 있는 업체 + 강제 금도
    const all = await db.select().from(arrearsEntries);
    codes = [];
    for (const e of all) {
      const lines = await listLetterLines(e.id);
      if (lines.some((l) => l.source === "ledger" && /^전기이월/.test(l.description))) {
        codes.push(e.externalCode);
      }
    }
    if (!codes.includes("00123")) codes.push("00123");
  }
  console.log("expand targets", codes.length);

  let expanded = 0;
  let fixed = 0;

  for (const code of codes) {
    const co26 = y26.get(code);
    if (!co26) continue;
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, code));
    if (!e) continue;

    const existing = await listLetterLines(e.id);
    const letters = existing.filter((l) => l.source === "letter");
    const hadBareCarry = existing.some(
      (l) => l.source === "ledger" && /^전기이월/.test(l.description),
    );

    // 2026 PDF 거래 (전기이월 제외 — 아래 미결제로 대체)
    const pdfTxs = co26.txs.filter(
      (t) => !(t.kind === "debit" && /^전기이월/.test(t.description)),
    );
    const openPriorRaw = computeOpenItems(
      yearCompanies,
      code,
      2025,
      endMapFor(code),
    );
    const pdfCarry = co26.txs.find(
      (t) => t.kind === "debit" && /^전기이월/.test(t.description),
    );
    const carryAmt = pdfCarry ? Math.round(pdfCarry.amount) : 0;
    // 2026 원장에 전기이월이 없으면 이전연도 분해를 넣지 않음
    const openPrior = carryAmt > 0 ? openPriorRaw : [];
    const openSum = openPrior.reduce((s, o) => s + o.amount, 0);

    // 공문만 있고 PDF활동 거의 없으면 스킵(이미 공문으로 설명됨) — 단 강제 코드·불일치는 처리
    const openNow = letterBalanceFromLines(existing);
    const bal = Math.round(e.balance);
    const force = Boolean(codeArg) || code === "00123" || hadBareCarry;
    if (!force && bal === openNow) continue;
    if (!force && letters.length && bal === openNow) continue;

    // letter 유지 + prior open + 2026 pdf (전기이월 없이)
    const synthetic: LedgerDetailCompany = {
      externalCode: co26.externalCode,
      companyName: co26.companyName,
      txs: [
        ...openPrior.map((o) => ({
          eventDate: o.eventDate,
          description: o.description,
          amount: o.amount,
          kind: "debit" as const,
        })),
        // 분해 합이 원장 이월과 다르면 잔여만 전기이월로
        ...(carryAmt > 0 && openSum !== carryAmt
          ? [
              {
                eventDate: "2026-01-01",
                description:
                  openSum === 0
                    ? `2025년 말 미수 (${carryAmt.toLocaleString("ko-KR")})`
                    : `원장이월 잔여 (원장 ${carryAmt.toLocaleString("ko-KR")}·분해 ${openSum.toLocaleString("ko-KR")})`,
                amount: Math.max(0, carryAmt - openSum),
                kind: "debit" as const,
              },
            ].filter((t) => t.amount > 0)
          : []),
        ...pdfTxs,
      ],
    };

    // openSum > carryAmt 이면 분해가 과다 — 원장 이월 금액에 맞게 자르지 않고 일단 분해 우선, 잔여 음수는 스킵
    if (carryAmt > 0 && openSum > carryAmt && openPrior.length) {
      // 오래된 것부터 남기고 합=carryAmt 맞추기
      let need = carryAmt;
      const trimmed: OpenItem[] = [];
      for (let i = openPrior.length - 1; i >= 0 && need > 0; i--) {
        const o = openPrior[i];
        const use = Math.min(o.amount, need);
        trimmed.unshift({ ...o, amount: use });
        need -= use;
      }
      synthetic.txs = [
        ...trimmed.map((o) => ({
          eventDate: o.eventDate,
          description: o.description,
          amount: o.amount,
          kind: "debit" as const,
        })),
        ...pdfTxs,
      ];
    }

    await replaceLetterLines(
      e.id,
      "expand-carry",
      letters.map((l) => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate || "",
        source: "letter" as ArrearsLetterLineSource,
      })),
      { syncBalance: false },
    );
    await applyLedgerDetailTxs([synthetic], "expand-carry");
    expanded += 1;

    const after = await listLetterLines(e.id);
    const afterOpen = letterBalanceFromLines(after);
    if (afterOpen === bal) fixed += 1;
    if (force || code === "00123") {
      console.log(
        `\nverify ${code} ${e.companyName} bal=${bal} open=${afterOpen} diff=${bal - afterOpen} prior=${openSum} carry=${carryAmt}`,
      );
      for (const l of after) {
        console.log(
          `  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount} ${l.paidDate || ""}`,
        );
      }
    }
  }

  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log(`\nexpanded=${expanded} matched=${fixed} mismatch=${mm.count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
