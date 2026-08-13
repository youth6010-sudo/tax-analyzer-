/**
 * 미르엘형: 이름+기장료 / 이름+부가세 입금이 DB에 누락된 업체
 * npx tsx scripts/scan-memo-style-missing-credits.ts
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
  ledgerDetailPaidDateLabel,
} from "../lib/arrearsLedgerDetailParse";
import { listLetterLines } from "../lib/arrearsLetterDb";
import { DEFAULT_LEDGER_DETAIL_PDF } from "../lib/arrearsStackConfig";
import { letterBalanceFromLines } from "../app/types/arrears";

/** 송원미1월기장료 / 이기균김유리부가세 류 */
function isMemoStyleCredit(desc: string, kind: string): boolean {
  if (kind !== "credit") return false;
  const d = desc.replace(/\s+/g, "");
  if (
    /^(\d{1,2}월|\d{2}년|\d{2}\.|기타|부가|법인|개인|성실|세무|컨설팅|20\d{2}|입금|외상|현금)/.test(
      d,
    )
  ) {
    return false;
  }
  if (d.endsWith("부가세신고") && !d.startsWith("부가세")) return true;
  if (d.endsWith("부가세") && !d.startsWith("부가세")) return true;
  if (/.+다산신고$/.test(d)) return true;
  if (/\d{1,2}월기장/.test(d) || /(기장료|기장수수료)$/.test(d)) {
    if (/^[가-힣A-Za-z(]/.test(d)) return true;
  }
  return false;
}

async function main() {
  const detail = parseLedgerDetailPdf(DEFAULT_LEDGER_DETAIL_PDF);
  const db = getDb();
  const rows = [];

  for (const co of detail.companies) {
    const memo = co.txs.filter((t) => isMemoStyleCredit(t.description, t.kind));
    if (!memo.length) continue;
    const [e] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, co.externalCode));
    if (!e) continue;
    const lines = await listLetterLines(e.id);
    const missing = [];
    const present = [];
    for (const t of memo) {
      const paidDate = ledgerDetailPaidDateLabel(t.eventDate);
      const amt = Math.round(t.amount);
      const has = lines.some(
        (l) =>
          Math.round(l.paidAmount) === amt &&
          (String(l.paidDate || "").trim() === paidDate ||
            (l.description || "").replace(/\s+/g, "") ===
              (t.description || "").replace(/\s+/g, "")),
      );
      const label = `${t.eventDate} ${t.description} ${amt}`;
      if (has) present.push(label);
      else missing.push(label);
    }
    if (!missing.length && !present.length) continue;
    rows.push({
      code: co.externalCode,
      name: e.companyName,
      bal: Math.round(e.balance),
      open: letterBalanceFromLines(lines),
      missing,
      present,
    });
  }

  const withMissing = rows.filter((r) => r.missing.length);
  const ok = rows.filter((r) => !r.missing.length);
  console.log("memo-style credits: companies", rows.length);
  console.log("MISSING", withMissing.length);
  for (const r of withMissing) {
    console.log(
      `${r.code} ${r.name} bal=${r.bal} open=${r.open} · 누락: ${r.missing.join(" | ")}`,
    );
  }
  console.log("OK (already in DB)", ok.length);
  for (const r of ok.slice(0, 15)) {
    console.log(`${r.code} ${r.name} · ${r.present.join(" | ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
