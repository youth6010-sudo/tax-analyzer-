/**
 * 수동 확정 공문 패치 복구 + 스냅샷
 * node --import tsx scripts/ensure-frozen-letter-patches.mjs [--apply]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const patches = JSON.parse(
  fs.readFileSync(path.join(root, 'data/arrears-frozen-letter-patches.json'), 'utf8'),
);

const { getDb } = await import(pathToFileURL(path.join(root, 'db/index.ts')).href);
const { arrearsEntries } = await import(pathToFileURL(path.join(root, 'db/schema.ts')).href);
const { listLetterLines, replaceLetterLines } = await import(
  pathToFileURL(path.join(root, 'lib/arrearsLetterDb.ts')).href
);
const { letterBalanceFromLines } = await import(
  pathToFileURL(path.join(root, 'app/types/arrears.ts')).href
);
const { eq } = await import('drizzle-orm');

function norm(d) {
  return String(d || '').replace(/\s+/g, '');
}

function hasRule(lines, rule) {
  const m = rule.match || {};
  if (m.blankPay != null) {
    return lines.some(l => {
      const blankOk =
        !String(l.description || '').trim() || String(l.description || '').trim() === '입금';
      const payOk = Math.round(l.paidAmount || 0) === Math.round(m.blankPay);
      const dateOk = m.paidDateIncludes
        ? String(l.paidDate || '').replace(/\s+/g, '').includes(String(m.paidDateIncludes).replace(/\s+/g, ''))
        : true;
      return blankOk && payOk && dateOk;
    });
  }
  if (m.descriptionIncludes) {
    const needle = norm(m.descriptionIncludes);
    return lines.some(l => norm(l.description).includes(needle));
  }
  return false;
}

function toInput(l) {
  return {
    description: l.description || '',
    amount: Math.round(l.amount || 0),
    paidAmount: Math.round(l.paidAmount || 0),
    paidDate: l.paidDate || '',
    source: l.source || 'letter',
  };
}

function insertRule(lines, rule) {
  const row = {
    description: rule.description || '',
    amount: Math.round(rule.amount || 0),
    paidAmount: Math.round(rule.paidAmount || 0),
    paidDate: rule.paidDate || '',
    source: rule.source || 'ledger',
  };
  if (rule.position === 'first') {
    return [row, ...lines];
  }
  if (rule.position === 'after-corp-adjust-24') {
    const idx = lines.findIndex(l => /24년.*법인조정|법인조정.*24년/.test(norm(l.description)));
    if (idx >= 0) {
      const next = [...lines];
      next.splice(idx + 1, 0, row);
      return next;
    }
  }
  return [...lines, row];
}

const db = getDb();
const report = [];
const snapshot = { asOf: new Date().toISOString(), codes: {} };

for (const [code, cfg] of Object.entries(patches.codes || {})) {
  const [e] = await db.select().from(arrearsEntries).where(eq(arrearsEntries.externalCode, code)).limit(1);
  if (!e) {
    report.push({ code, name: cfg.name, error: 'entry not found' });
    continue;
  }
  let lines = (await listLetterLines(e.id)).map(toInput);
  const missing = [];
  for (const rule of cfg.rules || []) {
    if (hasRule(lines, rule)) continue;
    missing.push(rule.id);
    lines = insertRule(lines, rule);
  }

  // 선수금 first 정렬 (00176)
  if (code === '00176') {
    const adv = lines.filter(l => /선수금/.test(l.description || ''));
    const rest = lines.filter(l => !/선수금/.test(l.description || ''));
    if (adv.length) lines = [...adv, ...rest];
  }

  const open = letterBalanceFromLines(lines);
  const bal = Math.round(e.balance);
  const item = {
    code,
    name: cfg.name || e.clientName,
    missing,
    bal,
    open,
    match: open === bal,
    applied: false,
  };

  if (missing.length && APPLY) {
    await replaceLetterLines(e.id, 'ensure-frozen-letter-patches', lines, { syncBalance: false });
    item.applied = true;
    const verify = await listLetterLines(e.id);
    item.open = letterBalanceFromLines(verify);
    item.match = item.open === bal;
    lines = verify.map(toInput);
  }

  // snapshotOnly + lines: 공문이 비었으면 통째 복구 (오프라인 등)
  if (cfg.snapshotOnly && Array.isArray(cfg.lines) && lines.length === 0 && APPLY) {
    lines = cfg.lines.map(toInput);
    await replaceLetterLines(e.id, 'inactive-arrears-seed', lines, { syncBalance: false });
    item.applied = true;
    item.missing = ['snapshot-restore'];
    item.open = letterBalanceFromLines(lines);
    item.match = item.open === bal;
  }

  snapshot.codes[code] = {
    name: item.name,
    balance: bal,
    open: item.open,
    lines,
  };
  report.push(item);
  console.log(
    code,
    item.name,
    missing.length ? `MISSING ${missing.join(',')}` : 'ok',
    `bal=${bal} open=${item.open}`,
    APPLY && missing.length ? 'APPLIED' : '',
  );
}

fs.writeFileSync(
  path.join(root, 'data/arrears-frozen-letter-lines.json'),
  JSON.stringify(snapshot, null, 2),
  'utf8',
);
fs.writeFileSync(
  path.join(root, 'data/_ensure-frozen-letter-report.json'),
  JSON.stringify({ apply: APPLY, report }, null, 2),
  'utf8',
);
console.log('snapshot → data/arrears-frozen-letter-lines.json');
if (!APPLY && report.some(r => r.missing?.length)) {
  console.log('(dry-run) --apply 로 복구');
}
