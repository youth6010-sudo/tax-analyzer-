/**
 * 불일치 자동보정 (안전 규칙만)
 * 1) 적요에「반환」인 입금줄 → 차변으로 뒤집어 AR 복구
 * 2) (보정 후) 원장−내역 = PDF 26이월 또는 25기말 이면 전기이월 차변 보강
 *
 * npx tsx scripts/auto-fix-mismatches.ts [--apply]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

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

import {
  listLetterLines,
  listLedgerBalanceMismatches,
  replaceLetterLines,
  applyLedgerOnlyCarryIn,
} from "../lib/arrearsLetterDb";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";
import { YEAR_LEDGER_DETAIL_PDFS } from "../lib/arrearsStackConfig";

const APPLY = process.argv.includes("--apply");
const JSON_PATH = path.join(root, ".tmp-year-balances.json");

type YearCo = {
  externalCode: string;
  openingCarry: number | null;
  endingBalance: number | null;
};
type YearFile = { year?: number; companies?: YearCo[] };

function isReturnPayment(desc: string, paid: number, amt: number): boolean {
  if (amt !== 0 || paid <= 0) return false;
  return /반환/.test(desc);
}

function ensureYearJson() {
  const pdfs = YEAR_LEDGER_DETAIL_PDFS.filter((p) => fs.existsSync(p));
  const py = path.join(root, "scripts", "parse-ledger-year-balances.py");
  const r = spawnSync("python", ["-X", "utf8", py, JSON_PATH, ...pdfs], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "year parse fail");
  console.log(r.stdout?.trim());
}

function histByCode(years: YearFile[]) {
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

function carryMatchesNeed(
  need: number,
  hist?: Record<number, YearCo>,
): { ok: boolean; desc: string } {
  if (need <= 0) return { ok: false, desc: "" };
  const y26 = hist?.[2026];
  const y25 = hist?.[2025];
  const c26 = y26?.openingCarry != null ? Math.round(y26.openingCarry) : null;
  const e25 = y25?.endingBalance != null ? Math.round(y25.endingBalance) : null;
  if (c26 != null && c26 === need) {
    return { ok: true, desc: "전기이월 (자동·2026 PDF 전기이월)" };
  }
  if (e25 != null && e25 === need) {
    return { ok: true, desc: "전기이월 (자동·2025 PDF 기말)" };
  }
  return { ok: false, desc: "" };
}

type LineIn = {
  description: string;
  amount: number;
  paidAmount: number;
  paidDate: string;
  source: ArrearsLetterLineSource;
};

async function main() {
  ensureYearJson();
  const raw = JSON.parse(fs.readFileSync(JSON_PATH, "utf8")) as { years: YearFile[] };
  const histMap = histByCode(raw.years);

  const before = await listLedgerBalanceMismatches({ kind: "all" });
  console.log(
    `before mismatch=${before.mismatchCount} ledger_only=${before.ledgerOnlyCount} apply=${APPLY}`,
  );

  const { items } = await listLedgerBalanceMismatches({ kind: "mismatch" });
  const report: Array<Record<string, unknown>> = [];

  let returnFlipped = 0;
  let carryAdded = 0;
  let fixedToZero = 0;
  let skipped = 0;

  for (const m of items) {
    const hist = histMap.get(m.externalCode);
    const existing = await listLetterLines(m.entryId);

    // 1) 반환 입금 → 차변
    let lines: LineIn[] = existing.map((l) => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate || "",
      source: l.source as ArrearsLetterLineSource,
    }));

    let flippedHere = 0;
    lines = lines.map((l) => {
      if (!isReturnPayment(l.description, l.paidAmount, l.amount)) return l;
      flippedHere += 1;
      return {
        description: /반환/.test(l.description)
          ? l.description.includes("차변보정")
            ? l.description
            : `${l.description} (차변보정)`
          : `반환 (차변보정)`,
        amount: l.paidAmount,
        paidAmount: 0,
        paidDate: "",
        source: "ledger" as ArrearsLetterLineSource,
      };
    });

    // 이전 자동 전기이월만 제거(재산정). 수동/원장만 이월은 유지.
    lines = lines.filter(
      (l) =>
        !(
          l.source === "ledger" &&
          /^전기이월/.test(l.description) &&
          /자동/.test(l.description)
        ),
    );

    let open = letterBalanceFromLines(lines);
    const bal = Math.round(m.ledgerBalance);
    let need = bal - open;

    const actions: string[] = [];
    if (flippedHere > 0) {
      actions.push(`반환차변×${flippedHere}`);
      returnFlipped += flippedHere;
    }

    // 2) PDF 이월/기말과 need 일치 시 전기이월 보강
    const match = carryMatchesNeed(need, hist);
    if (match.ok) {
      const existingCarry = lines
        .filter((l) => l.source === "ledger" && /^전기이월/.test(l.description))
        .reduce((s, l) => s + l.amount - l.paidAmount, 0);
      if (existingCarry === need) {
        actions.push("전기이월이미있음");
      } else {
        lines = [
          {
            description: match.desc,
            amount: need,
            paidAmount: 0,
            paidDate: "",
            source: "ledger",
          },
          ...lines,
        ];
        actions.push(`전기이월+${need}`);
        carryAdded += 1;
        need = 0;
        open = letterBalanceFromLines(lines);
      }
    }

    const finalOpen = letterBalanceFromLines(lines);
    const finalDiff = bal - finalOpen;
    const improved = Math.abs(finalDiff) < Math.abs(bal - m.linesOpen);

    if (actions.length === 0 || (actions.length === 1 && actions[0] === "전기이월이미있음")) {
      skipped += 1;
      continue;
    }

    // 반환만 했는데 더 나빠지면 롤백(적용 안 함)
    if (!improved && finalDiff !== 0 && flippedHere > 0 && !match.ok) {
      report.push({
        code: m.externalCode,
        name: m.companyName,
        skip: "반환보정후악화",
        before: m.diff,
        after: finalDiff,
      });
      skipped += 1;
      continue;
    }

    report.push({
      code: m.externalCode,
      name: m.companyName,
      bal,
      openBefore: m.linesOpen,
      openAfter: finalOpen,
      diffBefore: m.diff,
      diffAfter: finalDiff,
      actions: actions.join(","),
      pdf26Carry: hist?.[2026]?.openingCarry ?? null,
      pdf25End: hist?.[2025]?.endingBalance ?? null,
    });

    if (finalDiff === 0) fixedToZero += 1;

    if (APPLY) {
      await replaceLetterLines(m.entryId, "auto-fix-mismatch", lines, {
        syncBalance: false,
      });
    }
  }

  // 원장만 장기미수도 재적용
  let ledgerOnly: { applied: number; entryCount: number; totalAmount: number } | null =
    null;
  if (APPLY) {
    ledgerOnly = await applyLedgerOnlyCarryIn("auto-fix-mismatch", "2026-08-13");
  }

  const after = APPLY
    ? await listLedgerBalanceMismatches({ kind: "all" })
    : before;

  report.sort(
    (a, b) => Math.abs(Number(b.diffBefore) || 0) - Math.abs(Number(a.diffBefore) || 0),
  );

  console.log("\n=== 자동보정 대상 ===");
  for (const r of report.slice(0, 40)) {
    console.log(
      `${r.code} ${r.name} ${r.diffBefore}→${r.diffAfter} · ${r.actions} (pdfC=${r.pdf26Carry})`,
    );
  }

  const out = path.join(root, "scripts", ".auto-fix-mismatches.json");
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        apply: APPLY,
        returnFlipped,
        carryAdded,
        fixedToZero,
        skipped,
        targets: report.length,
        ledgerOnly,
        before: {
          mismatch: before.mismatchCount,
          ledgerOnly: before.ledgerOnlyCount,
        },
        after: APPLY
          ? { mismatch: after.mismatchCount, ledgerOnly: after.ledgerOnlyCount }
          : null,
        report,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(
    `\ntargets=${report.length} returnFlip=${returnFlipped} carry+=${carryAdded} fixed0=${fixedToZero} skipped=${skipped}`,
  );
  if (APPLY) {
    console.log(
      `after mismatch=${after.mismatchCount} ledger_only=${after.ledgerOnlyCount}`,
      ledgerOnly,
    );
  } else {
    console.log("(dry-run) --apply 로 반영");
  }
  console.log("wrote", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
