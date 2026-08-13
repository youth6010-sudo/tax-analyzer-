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

import { listLedgerBalanceMismatches } from "../lib/arrearsLetterDb";

async function main() {
  const all = await listLedgerBalanceMismatches({ kind: "all" });
  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  const lo = await listLedgerBalanceMismatches({ kind: "ledger_only" });
  console.log("all", all.count, "mismatch", mm.count, "ledgerOnly", lo.count);
  console.log("00234", all.items.find((i) => i.externalCode === "00234"));
  console.log("00162", all.items.find((i) => i.externalCode === "00162"));
  console.log("00170", mm.items.find((i) => i.externalCode === "00170"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
