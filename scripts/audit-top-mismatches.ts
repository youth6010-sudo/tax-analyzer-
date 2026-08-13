/**
 * 상위 불일치 건을 라인·연도PDF 기준으로 원인 분류
 * npx tsx scripts/audit-top-mismatches.ts
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
import { listLedgerBalanceMismatches } from "../lib/arrearsLetterDb";

type YearCo = {
  externalCode: string;
  openingCarry: number | null;
  endingBalance: number | null;
};
type YearFile = { year?: number; companies?: YearCo[] };

async function main() {
  const jsonPath = path.join(root, ".tmp-year-balances.json");
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
  console.log("mismatch count", mm.count);

  const top = [...mm.items].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 20);
  const codes = top.map((m) => m.externalCode);
  // also verify 올바릇
  if (!codes.includes("01206")) codes.push("01206");

  const db = getDb();
  const ents = await db
    .select()
    .from(arrearsEntries)
    .where(inArray(arrearsEntries.externalCode, codes));
  const entByCode = new Map(ents.map((e) => [e.externalCode, e]));

  for (const m of top) {
    const e = entByCode.get(m.externalCode);
    const lines = e
      ? await db
          .select()
          .from(arrearsLetterLines)
          .where(eq(arrearsLetterLines.arrearsEntryId, e.id))
          .orderBy(asc(arrearsLetterLines.sortOrder))
      : [];
    const paySum = lines.reduce((s, l) => s + l.paidAmount, 0);
    const chargeSum = lines.reduce((s, l) => s + l.amount, 0);
    const letterOpen = lines
      .filter((l) => l.source === "letter")
      .reduce((s, l) => s + l.amount - l.paidAmount, 0);
    const ledgerOpen = lines
      .filter((l) => l.source === "ledger" || l.source === "payment")
      .reduce((s, l) => s + l.amount - l.paidAmount, 0);
    const pays = lines
      .filter((l) => l.paidAmount > 0)
      .map((l) => `${l.paidDate || "?"}:${l.paidAmount}:${(l.description || "").slice(0, 20)}`)
      .slice(0, 12);
    const charges = lines
      .filter((l) => l.amount >= 100000)
      .map((l) => `${l.source}:${(l.description || "").slice(0, 24)}:${l.amount}/${l.paidAmount}`)
      .slice(0, 10);

    const hist = byCode.get(m.externalCode) ?? {};
    const y26 = hist[2026];
    const y25 = hist[2025];
    const y24 = hist[2024];
    const y23 = hist[2023];
    const y22 = hist[2022];

    let cls = "기타";
    if (m.ledgerBalance === 0 && m.linesOpen < 0) {
      cls = "원장0·내역음수 → 입금이 청구보다 많음(반환/중복입금/공문청구누락)";
    } else if (m.ledgerBalance === 0 && m.linesOpen > 0) {
      cls = "원장0·내역양수 → 원장은 청산됐는데 공문/내역 청구가 남음";
    } else if (m.linesOpen > m.ledgerBalance && letterOpen > 0) {
      cls = "내역>원장 → 공문 미회수분이 원장보다 큼(입금누락 또는 공문과대)";
    } else if (m.linesOpen < m.ledgerBalance) {
      cls = "내역<원장 → 청구누락 또는 입금과다";
    }

    // 차이 금액이 특정 입금/청구와 일치하는지
    const absDiff = Math.abs(m.diff);
    const matchPay = lines.find((l) => l.paidAmount === absDiff);
    const matchChg = lines.find((l) => l.amount === absDiff);
    const tip: string[] = [];
    if (matchPay) tip.push(`차이=입금 ${matchPay.paidDate} ${matchPay.description}`);
    if (matchChg) tip.push(`차이=청구 ${matchChg.source} ${matchChg.description}`);
    if (y26?.endingBalance != null && Math.round(y26.endingBalance) === m.ledgerBalance) {
      tip.push("PDF26기말=원장OK");
    }
    if (y25?.endingBalance != null && y26?.openingCarry != null && y25.endingBalance === y26.openingCarry) {
      tip.push("25기말=26이월OK");
    }

    console.log("\n====", m.externalCode, m.companyName);
    console.log(`  bal=${m.ledgerBalance} open=${m.linesOpen} diff=${m.diff}`);
    console.log(
      `  PDF22=${y22?.endingBalance ?? "—"} PDF23=${y23?.endingBalance ?? "—"} PDF24=${y24?.endingBalance ?? "—"} PDF25=${y25?.endingBalance ?? "—"} PDF26e=${y26?.endingBalance ?? "—"} PDF26c=${y26?.openingCarry ?? "—"}`,
    );
    console.log(`  charge=${chargeSum} pay=${paySum} letterOpen=${letterOpen} ledgerNet=${ledgerOpen}`);
    console.log(`  class: ${cls}`);
    if (tip.length) console.log(`  tip: ${tip.join("; ")}`);
    console.log(`  pays: ${pays.join(" | ") || "(없음)"}`);
    console.log(`  charges: ${charges.join(" | ") || "(없음)"}`);
  }

  const ol = entByCode.get("01206");
  if (ol) {
    const lines = await db
      .select()
      .from(arrearsLetterLines)
      .where(eq(arrearsLetterLines.arrearsEntryId, ol.id))
      .orderBy(asc(arrearsLetterLines.sortOrder));
    const open = lines.reduce((s, l) => s + l.amount - l.paidAmount, 0);
    const jul31 = lines.filter((l) => l.paidAmount === 3000000);
    console.log("\n==== 올바릇 01206");
    console.log(`  bal=${ol.balance} open=${open} diff=${ol.balance - open}`);
    console.log(
      "  3M pays:",
      jul31.map((l) => `${l.source}|${l.paidDate}|${l.paidAmount}|${l.description}`).join(" ; "),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
