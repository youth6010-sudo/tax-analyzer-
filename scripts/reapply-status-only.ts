import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

import { applyStatusImport } from '../lib/arrearsImportApply';

async function main() {
  const buf = fs.readFileSync(
    'z:/10_미수관리/미수금 공문 - 26년/미수수수료 거래처(잔액)현황_26.08.31.xls',
  );
  const r = await applyStatusImport(buf, 'fix-balance-col', '2026.08.31');
  console.log(r);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
