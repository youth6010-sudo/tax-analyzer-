/**
 * 세금계산서 발급 엑셀 품목 파싱 검증 (+ 선택적 녹색=신규)
 *
 *   npx tsx scripts/verify-tax-invoice-issuance.ts
 *   npx tsx scripts/verify-tax-invoice-issuance.ts --dir "z:/00_관리&운영/세금계산서 발급"
 *
 * DB 반영·배포 없음.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { parseTaxInvoiceIssuanceWorkbook } from '../lib/taxInvoiceIssuanceParse';

const DEFAULT_DIR = String.raw`z:\00_관리&운영\세금계산서 발급`;

const TARGETS = [
  '세금계산서발급2606월.xls',
  '세금계산서발급2606월개인조정료.xls',
  '세금계산서발급2606월기타매출.xls',
  '세금계산서발급2606월신고대리.xls',
  '세금계산서발급2607월.xls',
  '세금계산서발급2607월기타매출.xls',
  '세금계산서발급2607월신고대리.xls',
];

function readGreenRows(filePath: string): Set<number> {
  const py = path.join(process.cwd(), 'scripts', 'parse-tax-invoice-green.py');
  const r = spawnSync('python', [py, filePath], { encoding: 'utf-8' });
  if (r.status !== 0) return new Set();
  try {
    const j = JSON.parse(r.stdout || '{}') as { greenRows?: number[] };
    return new Set(j.greenRows ?? []);
  } catch {
    return new Set();
  }
}

function main() {
  const dirArg = process.argv.find(a => a.startsWith('--dir='));
  const dirIdx = process.argv.indexOf('--dir');
  const dir =
    dirArg?.slice('--dir='.length) ||
    (dirIdx >= 0 ? process.argv[dirIdx + 1] : DEFAULT_DIR);

  for (const name of TARGETS) {
    const filePath = path.join(dir, name);
    if (!fs.existsSync(filePath)) {
      console.log(`MISS ${name}`);
      continue;
    }
    const buf = fs.readFileSync(filePath);
    const greenRows = readGreenRows(filePath);
    const lines = parseTaxInvoiceIssuanceWorkbook(buf, name, { greenRows });
    const byItem = new Map<string, number>();
    let newCount = 0;
    let sum = 0;
    for (const line of lines) {
      byItem.set(line.itemName, (byItem.get(line.itemName) ?? 0) + 1);
      sum += line.supplyAmount;
      if (line.isNew) newCount += 1;
    }
    const top = [...byItem.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => `${k}×${v}`)
      .join(', ');
    console.log(
      `${name}: lines=${lines.length} new=${newCount} sum=${sum.toLocaleString('ko-KR')} | ${top}`,
    );
    if (lines[0]) {
      console.log(
        `  sample: ${lines[0].companyName} / ${lines[0].itemName} / ${lines[0].supplyAmount}` +
          (lines[0].isNew ? ' [신규]' : ''),
      );
    }
  }
}

main();
