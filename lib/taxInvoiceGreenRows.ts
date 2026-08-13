/**
 * 로컬에서만: xlrd(python)로 세금계산서 발급 xls 녹색 행 탐지.
 * Vercel 등 python 미설치 환경에서는 빈 Set.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

export function detectTaxInvoiceGreenRows(
  buffer: Buffer,
  filename = 'invoice.xls',
): Set<number> {
  const ext = path.extname(filename || '').toLowerCase() || '.xls';
  if (ext !== '.xls') return new Set();

  const tmp = path.join(
    os.tmpdir(),
    `tax-inv-green-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`,
  );
  try {
    fs.writeFileSync(tmp, buffer);
    const script = path.join(process.cwd(), 'scripts', 'parse-tax-invoice-green.py');
    if (!fs.existsSync(script)) return new Set();
    const r = spawnSync('python', [script, tmp], {
      encoding: 'utf-8',
      timeout: 20_000,
    });
    if (r.status !== 0) return new Set();
    const j = JSON.parse(r.stdout || '{}') as { greenRows?: number[] };
    return new Set(j.greenRows ?? []);
  } catch {
    return new Set();
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}
