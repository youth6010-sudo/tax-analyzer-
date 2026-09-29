/**
 * 청년들 ID — 복구된 옛 묶음(corp-phone · sk-phone · kakao)의 개인 항목을
 * 찰리가 재구성한 새 묶음(comm: 내선·전화·카톡 / google: 구글 ID·PW) 구조로 옮김.
 * node --import tsx scripts/restructure-youth-ids-comm.mjs [--apply]
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
const { loadYouthIdsAsync, saveYouthIdsAsync } = await import('../lib/youthIdsDb.ts');

const doc = await loadYouthIdsAsync();
const cat = id => doc.categories.find(c => c.id === id);
const comm = cat('comm');
const google = cat('google');
const corp = cat('corp-phone');
const sk = cat('sk-phone');
const kakao = cat('kakao');
if (!comm || !google) throw new Error('comm/google 묶음 없음');

const tmplComm = comm.entries.find(e => e.id === 'e58');
const tmplGoogle = google.entries.find(e => e.id === 'e58g');
const val = (e, label) => e?.fields.find(f => f.label === label)?.value ?? '';
const secretOf = (tmpl, label) => !!tmpl?.fields.find(f => f.label === label)?.secret;

const owners = new Set(
  [...(corp?.entries ?? []), ...(sk?.entries ?? []), ...(kakao?.entries ?? [])]
    .map(e => e.owner)
    .filter(Boolean),
);
const byOwner = (c, owner) => c?.entries.find(e => e.owner === owner);

const newComm = [];
const newGoogle = [];
for (const owner of owners) {
  if (comm.entries.some(e => e.owner === owner)) continue;
  const s = byOwner(sk, owner);
  const c = byOwner(corp, owner);
  const k = byOwner(kakao, owner);
  const title = s?.title || c?.title || k?.title || owner;
  const baseId = s?.id || c?.id || `comm-${owner}`;
  const commFields = (tmplComm?.fields ?? [{ label: '내선' }, { label: '전화' }, { label: '카톡ID' }, { label: 'PW' }]).map(
    (tf, i, arr) => {
      let value = '';
      if (tf.label === '내선') value = val(s, '내선');
      else if (tf.label === '전화') value = val(c, '전화');
      else if (tf.label === '카톡ID') value = val(k, 'ID');
      else if (arr[i - 1]?.label === '카톡ID') value = val(k, 'PW');
      return { label: tf.label, value, secret: tf.secret ? true : undefined };
    },
  );
  newComm.push({ id: baseId, title, owner, fields: commFields });
  const gId = val(c, '구글 ID');
  if (gId) {
    newGoogle.push({
      id: `${baseId}g`,
      title,
      owner,
      fields: [
        { label: 'ID', value: gId, secret: secretOf(tmplGoogle, 'ID') || undefined },
        { label: 'PW', value: val(c, 'PW'), secret: secretOf(tmplGoogle, 'PW') || undefined },
      ],
    });
  }
}

const moved = new Set([...(corp?.entries ?? []), ...(sk?.entries ?? []), ...(kakao?.entries ?? [])]
  .filter(e => e.owner && owners.has(e.owner))
  .map(e => e.id));
const byEntryNo = (a, b) =>
  Number(a.id.replace(/\D/g, '')) - Number(b.id.replace(/\D/g, ''));
newComm.push(...comm.entries.filter(e => e.owner));
newGoogle.push(...google.entries.filter(e => e.owner));
newComm.sort(byEntryNo);
newGoogle.sort(byEntryNo);
comm.entries = comm.entries.filter(e => !e.owner);
google.entries = google.entries.filter(e => !e.owner);

const next = doc.categories
  .map(c => {
    if (c.id === 'comm') {
      const shared = c.entries.filter(e => !e.owner);
      const personal = [...c.entries.filter(e => e.owner), ...newComm];
      return { ...c, entries: [shared[0], ...personal, ...shared.slice(1)].filter(Boolean) };
    }
    if (c.id === 'google') {
      const shared = c.entries.filter(e => !e.owner);
      return { ...c, entries: [...c.entries.filter(e => e.owner), ...newGoogle, ...shared] };
    }
    if (['corp-phone', 'sk-phone', 'kakao'].includes(c.id)) {
      return { ...c, entries: c.entries.filter(e => !moved.has(e.id)) };
    }
    return c;
  })
  .filter(c => !(['corp-phone', 'sk-phone', 'kakao'].includes(c.id) && c.entries.length === 0));

for (const c of next.filter(c => ['comm', 'google', 'corp-phone', 'sk-phone', 'kakao'].includes(c.id))) {
  console.log('==', c.id, c.label, c.entries.length);
  for (const e of c.entries) {
    console.log('  ', e.id, e.title, e.owner || '(공용)', '::', e.fields.map(f => `${f.label}${f.value ? '✓' : '·'}`).join(' '));
  }
}
console.log('categories', doc.categories.length, '->', next.length);

if (!APPLY) {
  console.log('dry-run — re-run with --apply');
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const backup = path.join(root, 'backups', `youth-ids-before-comm-restructure-${stamp}.json`);
fs.mkdirSync(path.dirname(backup), { recursive: true });
fs.writeFileSync(backup, JSON.stringify(doc, null, 2));
console.log('backup', path.relative(root, backup));
const saved = await saveYouthIdsAsync({ categories: next });
console.log('saved entries', saved.categories.reduce((n, c) => n + c.entries.length, 0));
process.exit(0);
