/**
 * 2026 PDF 상세만 재반영 (wipe 없음) + 불일치 vs 연도 PDF 대조
 * npx tsx scripts/reapply-pdf-and-audit-mismatches.ts
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

import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import {
  applyLedgerDetailTxs,
  listLedgerBalanceMismatches,
} from "../lib/arrearsLetterDb";
import {
  DEFAULT_LEDGER_DETAIL_PDF,
  YEAR_LEDGER_DETAIL_PDFS,
} from "../lib/arrearsStackConfig";

type YearCo = {
  externalCode: string;
  openingCarry: number | null;
  endingBalance: number | null;
  companyName: string;
};
type YearFile = { year?: number; companies?: YearCo[] };

async function main() {
  const pdfPath = DEFAULT_LEDGER_DETAIL_PDF;
  console.log("PDF", pdfPath, fs.existsSync(pdfPath));
  const detail = parseLedgerDetailPdf(pdfPath);
  console.log("companies", detail.companyCount, "txs", detail.txCount);

  const ol = detail.companies.find((c) => c.externalCode === "01206");
  console.log(
    "올바릇 credits",
    ol?.txs.filter((t) => t.kind === "credit").map((t) => `${t.eventDate} ${t.amount}`),
  );

  const applied = await applyLedgerDetailTxs(detail.companies, "pdf-reapply");
  console.log("applied", applied);

  const jsonPath = path.join(root, ".tmp-year-balances.json");
  const yearPdfs = YEAR_LEDGER_DETAIL_PDFS.filter((p) => fs.existsSync(p));
  const py = path.join(root, "scripts", "parse-ledger-year-balances.py");
  const r = spawnSync("python", ["-X", "utf8", py, jsonPath, ...yearPdfs], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "parse fail");
  console.log(r.stdout?.trim());

  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { years: YearFile[] };
  const byCode = new Map<string, Record<number, YearCo>>();
  for (const yf of raw.years) {
    const y = yf.year;
    if (y == null || !yf.companies) continue;
    for (const c of yf.companies) {
      const rec = byCode.get(c.externalCode) ?? {};
      rec[y] = c;
      byCode.set(c.externalCode, rec);
    }
  }

  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log("\nmismatch", mm.count);

  const rows = [];
  for (const m of mm.items) {
    const hist = byCode.get(m.externalCode) ?? {};
    const y26 = hist[2026];
    const y25 = hist[2025];
    const hint: string[] = [];
    if (y26?.endingBalance != null && Math.round(y26.endingBalance) === m.ledgerBalance) {
      hint.push("PDF26기말=원장");
    }
    if (y26?.endingBalance != null && Math.round(y26.endingBalance) === m.linesOpen) {
      hint.push("PDF26기말=내역");
    }
    if (y26?.openingCarry != null) hint.push(`PDF26이월=${y26.openingCarry}`);
    if (Math.abs(m.diff) === 3000000) hint.push("차3백만(입금누락?)");
    if (y25?.endingBalance != null) hint.push(`PDF25기말=${y25.endingBalance}`);
    rows.push({
      code: m.externalCode,
      name: m.companyName,
      bal: m.ledgerBalance,
      open: m.linesOpen,
      diff: m.diff,
      pdf26End: y26?.endingBalance ?? null,
      pdf26Carry: y26?.openingCarry ?? null,
      hint: hint.join("; ") || "—",
    });
  }

  console.log("\n=== 불일치 vs PDF ===");
  for (const r of rows.slice(0, 40)) {
    console.log(
      `${r.code} ${r.name} bal=${r.bal} open=${r.open} diff=${r.diff} pdfE=${r.pdf26End} pdfC=${r.pdf26Carry} · ${r.hint}`,
    );
  }

  const olb = rows.find((r) => r.code === "01206");
  console.log("\n올바릇 after", olb ?? "불일치목록에 없음(일치)");

  fs.writeFileSync(
    path.join(root, "scripts", ".mismatch-vs-year-pdf.json"),
    JSON.stringify({ mismatchCount: mm.count, rows }, null, 2),
    "utf8",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
