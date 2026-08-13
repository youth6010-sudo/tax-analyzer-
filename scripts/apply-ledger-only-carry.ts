/**
 * 원장만 전기이월 적용 (재구성 없이)
 * npx tsx scripts/apply-ledger-only-carry.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env.local", ".env"]) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

import {
  applyLedgerOnlyCarryIn,
  listLedgerBalanceMismatches,
  stripLedgerSyncLetterLines,
} from "../lib/arrearsLetterDb";

async function main() {
  const before = await listLedgerBalanceMismatches({ kind: "all" });
  console.log(
    "before mismatch",
    before.mismatchCount,
    "ledgerOnly",
    before.ledgerOnlyCount,
  );

  // 기존 전기이월/원장반영 플러그 정리 후 원장만 전기이월
  const stripped = await stripLedgerSyncLetterLines("ledger-only-carry");
  console.log("stripped", stripped);

  const carry = await applyLedgerOnlyCarryIn("ledger-only-carry", "2026-08-13");
  console.log("carry", carry);

  const after = await listLedgerBalanceMismatches({ kind: "all" });
  console.log(
    "after mismatch",
    after.mismatchCount,
    "ledgerOnly",
    after.ledgerOnlyCount,
  );

  const samples = ["00234", "00162", "00223", "00178"];
  for (const code of samples) {
    const hit = after.items.find((i) => i.externalCode === code);
    console.log(code, hit ? `${hit.kind} diff=${hit.diff}` : "matched(ok)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
