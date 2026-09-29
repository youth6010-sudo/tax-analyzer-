/**
 * 청년들 ID — 원본(.env.youth-ids.value)에 있던 개인(owner) 항목 중 현재 DB에 없는 것만 되살림.
 * 현재 DB 항목(공용·찰리 수정분)은 그대로 유지.
 * node --import tsx scripts/restore-youth-ids-owner-entries.mjs [--apply]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
const APPLY = process.argv.includes('--apply');

const { loadYouthIdsAsync, saveYouthIdsAsync, parseYouthIdDoc } = await import('../lib/youthIdsDb.ts');

let raw = fs.readFileSync(path.join(root, '.env.youth-ids.value'), 'utf8').trim();
raw = raw.replace(/^YOUTH_IDS_JSON=/, '').replace(/^['"]|['"]$/g, '');
const original = parseYouthIdDoc(JSON.parse(raw));
const current = await loadYouthIdsAsync();

const backupDir = path.join(root, 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const backupPath = path.join(backupDir, `youth-ids-before-restore-${stamp}.json`);

const currentIds = new Set(current.categories.flatMap(c => c.entries.map(e => e.id)));
const next = current.categories.map(c => ({ ...c, entries: [...c.entries] }));
const added = {};
for (const oc of original.categories) {
  for (const e of oc.entries) {
    if (!e.owner || e.owner === '찰리' || currentIds.has(e.id)) continue;
    let cat = next.find(c => c.id === oc.id);
    if (!cat) {
      cat = { id: oc.id, label: oc.label, icon: oc.icon, entries: [] };
      next.push(cat);
    }
    cat.entries.push(e);
    added[e.owner] = (added[e.owner] ?? 0) + 1;
  }
}
const total = next.reduce((n, c) => n + c.entries.length, 0);
console.log('current', current.categories.reduce((n, c) => n + c.entries.length, 0), '-> next', total, 'added', JSON.stringify(added));

if (!APPLY) {
  console.log('dry-run — re-run with --apply');
  process.exit(0);
}
fs.writeFileSync(backupPath, JSON.stringify(current, null, 2));
console.log('backup', path.relative(root, backupPath));
const saved = await saveYouthIdsAsync({ categories: next });
console.log('saved', saved.categories.reduce((n, c) => n + c.entries.length, 0));
process.exit(0);
