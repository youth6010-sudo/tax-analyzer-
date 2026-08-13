/**
 * 이름+기장료/부가세가 청구(amount>0)로 잘못 들어간 행 스캔
 * npx tsx scripts/scan-memo-misclass-charges.ts [--apply]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
import { eq } from "drizzle-orm";
import { listLetterLines, replaceLetterLines } from "../lib/arrearsLetterDb";
import { letterBalanceFromLines } from "../app/types/arrears";
import type { ArrearsLetterLineSource } from "../app/types/arrears";

const APPLY = process.argv.includes("--apply");

function isMisclassChargeDesc(desc: string): boolean {
  const d = String(desc || "").replace(/\s+/g, "");
  if (!d) return false;
  // 「24년 7월 부가세신고」「26.1월 부가세신고」는 정상 청구
  if (/^(\d{1,2}월|\d{2}년|\d{2}\.|20\d{2}|기타|부가|법인|개인|성실|세무|컨설팅)/.test(d)) {
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
  const db = getDb();
  const entries = await db.select().from(arrearsEntries);
  const hits = [];

  for (const e of entries) {
    const lines = await listLetterLines(e.id);
    const bad = lines.filter(
      (l) =>
        isMisclassChargeDesc(l.description) &&
        Math.round(l.amount) > 0 &&
        Math.round(l.paidAmount) === 0,
    );
    if (!bad.length) continue;
    hits.push({
      code: e.externalCode,
      name: e.companyName,
      bal: Math.round(e.balance),
      open: letterBalanceFromLines(lines),
      bad: bad.map((l) => `${l.description} ${l.amount}`),
      entryId: e.id,
      lines,
    });
  }

  console.log("misclassified memo charges", hits.length, "apply", APPLY);
  for (const h of hits) {
    console.log(`${h.code} ${h.name} bal=${h.bal} open=${h.open} · ${h.bad.join(" | ")}`);
  }

  if (!APPLY) return;

  for (const h of hits) {
    const keep = h.lines.filter(
      (l) =>
        !(
          isMisclassChargeDesc(l.description) &&
          Math.round(l.amount) > 0 &&
          Math.round(l.paidAmount) === 0
        ),
    );
    await replaceLetterLines(
      h.entryId,
      "strip-memo-misclass",
      keep.map((l) => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate || "",
        source: l.source as ArrearsLetterLineSource,
      })),
      { syncBalance: false },
    );
    const after = await listLetterLines(h.entryId);
    console.log("stripped", h.code, h.name, "open", letterBalanceFromLines(after));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
