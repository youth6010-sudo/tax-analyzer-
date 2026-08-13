/**
 * 원장만(공문없음·전기이월제외 open=0·잔액≠0)에만 PDF 검증 전기이월 반영.
 * 불일치(내역≠0) 업체에 억지로 맞추지 않음.
 *
 * npx tsx scripts/apply-carry-from-year-pdfs.ts [--apply]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sql } from "drizzle-orm";

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
import { replaceLetterLines, listLetterLines } from "../lib/arrearsLetterDb";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";
import { YEAR_LEDGER_DETAIL_PDFS } from "../lib/arrearsStackConfig";
import { spawnSync } from "child_process";

type YearCo = {
  externalCode: string;
  companyName: string;
  openingCarry: number | null;
  endingBalance: number | null;
};

type YearFile = { year?: number; companies?: YearCo[] };

const APPLY = process.argv.includes("--apply");
const JSON_PATH = path.join(root, ".tmp-year-balances.json");

function ensureYearJson() {
  const missing = YEAR_LEDGER_DETAIL_PDFS.filter((p) => !fs.existsSync(p));
  if (missing.length) {
    console.warn("missing PDFs", missing);
  }
  if (!fs.existsSync(JSON_PATH) || missing.length === 0) {
    const py = path.join(root, "scripts", "parse-ledger-year-balances.py");
    const r = spawnSync(
      "python",
      ["-X", "utf8", py, JSON_PATH, ...YEAR_LEDGER_DETAIL_PDFS.filter((p) => fs.existsSync(p))],
      { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
    );
    if (r.status !== 0) {
      throw new Error(r.stderr || r.stdout || `parse exit ${r.status}`);
    }
    console.log(r.stdout?.trim());
  }
}

function byCodeMap(years: YearFile[]): Map<string, Record<number, YearCo>> {
  const m = new Map<string, Record<number, YearCo>>();
  for (const yf of years) {
    const y = yf.year;
    if (y == null || !yf.companies) continue;
    for (const c of yf.companies) {
      const rec = m.get(c.externalCode) ?? {};
      rec[y] = c;
      m.set(c.externalCode, rec);
    }
  }
  return m;
}

function carryDesc(need: number, bal: number, hist?: Record<number, YearCo>) {
  const y26 = hist?.[2026];
  const pdfC = y26?.openingCarry;
  const pdfE = y26?.endingBalance;
  if (pdfC != null && Math.round(pdfC) === need) {
    return { desc: "전기이월 (2026 PDF 전기이월)", note: "PDF전기이월=반영액" };
  }
  if (pdfE != null && Math.round(pdfE) === bal && need === bal) {
    return { desc: "전기이월 (2026 PDF 기말=잔액)", note: "PDF기말=원장잔액" };
  }
  if (pdfC != null) {
    return {
      desc: `전기이월 (원장잔액·PDF이월 ${Math.round(pdfC).toLocaleString("ko-KR")})`,
      note: `PDF이월 ${pdfC}`,
    };
  }
  if (pdfE != null) {
    return {
      desc: `전기이월 (원장잔액·PDF기말 ${Math.round(pdfE).toLocaleString("ko-KR")})`,
      note: `PDF기말 ${pdfE}`,
    };
  }
  return { desc: "전기이월 (원장잔액)", note: "PDF미수록" };
}

async function main() {
  ensureYearJson();
  const raw = JSON.parse(fs.readFileSync(JSON_PATH, "utf8")) as { years: YearFile[] };
  const histMap = byCodeMap(raw.years);
  console.log(
    "PDF",
    raw.years.map((y) => `${y.year}:${y.companies?.length ?? 0}`).join(" "),
    "apply",
    APPLY,
  );

  const db = getDb();
  const entries = await db
    .select({
      id: arrearsEntries.id,
      externalCode: arrearsEntries.externalCode,
      companyName: arrearsEntries.companyName,
      balance: arrearsEntries.balance,
    })
    .from(arrearsEntries)
    .where(sql`${arrearsEntries.externalCode} not like 'letter:%'`);

  const letterFlags = await db
    .select({
      arrearsEntryId: arrearsLetterLines.arrearsEntryId,
      hasLetter: sql<boolean>`bool_or(${arrearsLetterLines.source} = 'letter')`,
    })
    .from(arrearsLetterLines)
    .groupBy(arrearsLetterLines.arrearsEntryId);
  const hasLetter = new Set(
    letterFlags.filter((r) => r.hasLetter).map((r) => r.arrearsEntryId),
  );

  let strippedExtra = 0;
  let applied = 0;
  let skippedMismatch = 0;
  let alreadyOk = 0;
  const report: Array<Record<string, unknown>> = [];

  for (const e of entries) {
    if (hasLetter.has(e.id)) continue;
    const bal = Math.round(e.balance);
    const hist = histMap.get(e.externalCode);
    const y26 = hist?.[2026];
    const existing = await listLetterLines(e.id);
    const keep = existing.filter(
      (l) => !(l.source === "ledger" && /^전기이월/.test(l.description)),
    );
    const openWithoutCarry = letterBalanceFromLines(keep);

    // 내역(이월 제외)이 0이 아니면 → 진짜 불일치/PDF활동. 전기이월로 억지 맞춤 금지.
    // 단, 이전에 잘못 넣은 전기이월은 제거.
    if (openWithoutCarry !== 0) {
      skippedMismatch += 1;
      if (APPLY && keep.length !== existing.length) {
        await replaceLetterLines(
          e.id,
          "year-pdf-carry",
          keep.map((l) => ({
            description: l.description,
            amount: l.amount,
            paidAmount: l.paidAmount,
            paidDate: l.paidDate,
            source: l.source as ArrearsLetterLineSource,
          })),
          { syncBalance: false },
        );
        strippedExtra += 1;
      }
      continue;
    }

    // openWithoutCarry === 0
    if (bal === 0) {
      alreadyOk += 1;
      if (APPLY && keep.length !== existing.length) {
        await replaceLetterLines(e.id, "year-pdf-carry", [], { syncBalance: false });
        strippedExtra += 1;
      }
      continue;
    }

    // 원장만 장기미수: 전기이월 = 잔액
    const need = bal;
    const { desc, note } = carryDesc(need, bal, hist);
    report.push({
      code: e.externalCode,
      name: e.companyName,
      balance: bal,
      pdf26Carry: y26?.openingCarry ?? null,
      pdf26End: y26?.endingBalance ?? null,
      need,
      note,
      desc,
    });

    if (APPLY) {
      await replaceLetterLines(
        e.id,
        "year-pdf-carry",
        [
          {
            description: desc,
            amount: need > 0 ? need : 0,
            paidAmount: need < 0 ? Math.abs(need) : 0,
            paidDate: "",
            source: "ledger" as ArrearsLetterLineSource,
          },
        ],
        { syncBalance: false },
      );
      applied += 1;
    }
  }

  report.sort((a, b) => Math.abs(Number(b.balance)) - Math.abs(Number(a.balance)));
  console.log("\n=== 원장만 전기이월 대상 ===");
  for (const r of report.slice(0, 30)) {
    console.log(
      `${r.code} ${r.name} bal=${Number(r.balance).toLocaleString("ko-KR")} pdfC=${r.pdf26Carry} pdfE=${r.pdf26End} · ${r.note}`,
    );
  }

  const outPath = path.join(root, "scripts", ".carry-from-year-pdfs.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        apply: APPLY,
        ledgerOnlyTargets: report.length,
        alreadyOk,
        skippedMismatch,
        strippedExtra,
        applied,
        report,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(
    `\nledgerOnly=${report.length} alreadyOk0=${alreadyOk} skippedMismatch=${skippedMismatch} strippedExtra=${strippedExtra} applied=${applied}`,
  );
  console.log("wrote", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
