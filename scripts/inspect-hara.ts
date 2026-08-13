/**
 * 하라(00621) + 연도 PDF 전기이월 점검
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { asc, eq, ilike, or } from "drizzle-orm";
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

import { getDb } from "../db";
import { arrearsEntries, arrearsLetterLines } from "../db/schema";
import { parseLedgerDetailPdf } from "../lib/arrearsLedgerDetailParse";
import {
  DEFAULT_LEDGER_DETAIL_PDF,
  YEAR_LEDGER_DETAIL_PDFS,
} from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";

async function main() {
  const jsonPath = path.join(root, ".tmp-year-balances.json");
  const pdfs = YEAR_LEDGER_DETAIL_PDFS.filter((p) => fs.existsSync(p));
  console.log(
    "year pdfs",
    pdfs.map((p) => path.basename(p)),
  );
  const py = path.join(root, "scripts", "parse-ledger-year-balances.py");
  const r = spawnSync("python", ["-X", "utf8", py, jsonPath, ...pdfs], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "year parse fail");
  console.log(r.stdout?.trim());

  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as {
    years: Array<{
      year?: number;
      companies?: Array<{
        externalCode: string;
        companyName: string;
        openingCarry: number | null;
        endingBalance: number | null;
      }>;
    }>;
  };

  const db = getDb();
  const hits = await db
    .select()
    .from(arrearsEntries)
    .where(
      or(eq(arrearsEntries.externalCode, "00621"), ilike(arrearsEntries.companyName, "%하라%")),
    );

  for (const e of hits) {
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    const open = letterBalanceFromLines(lines);
    console.log(
      "\n=== DB",
      e.externalCode,
      e.companyName,
      "bal",
      e.balance,
      "open",
      open,
      "diff",
      e.balance - open,
    );
    for (const l of lines) {
      console.log(
        `  [${l.source}] ${l.description} +${l.amount} -${l.paidAmount} ${l.paidDate || ""}`,
      );
    }

    console.log("year history:");
    for (const yf of raw.years) {
      const c = yf.companies?.find((x) => x.externalCode === e.externalCode);
      console.log(
        `  ${yf.year}: carry=${c?.openingCarry ?? "—"} end=${c?.endingBalance ?? "—"} ${c?.companyName ?? ""}`,
      );
    }
  }

  const pdf = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const co = pdf.companies.find(
    (c) => c.externalCode === "00621" || /하라/.test(c.companyName),
  );
  console.log("\nPDF2026", co?.externalCode, co?.companyName, "txs", co?.txs.length);
  for (const t of co?.txs ?? []) {
    console.log(t.kind, t.eventDate, t.description, t.amount);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
