import {
  listLedgerBalanceMismatches,
} from "../lib/arrearsLetterDb";
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

async function main() {
  const mm = await listLedgerBalanceMismatches({ kind: "mismatch" });
  console.log("mismatch", mm.count);
  for (const m of mm.items) {
    console.log(
      `${m.externalCode}\t${m.companyName}\tbal=${m.ledgerBalance}\topen=${m.linesOpen}\tdiff=${m.diff}`,
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
