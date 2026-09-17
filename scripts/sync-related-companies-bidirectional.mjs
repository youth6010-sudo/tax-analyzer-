/**
 * 관계회사 양방향 링크 보정 + 그룹 담당 통일
 * node scripts/sync-related-companies-bidirectional.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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

function parseRelatedNames(raw) {
  return String(raw || '')
    .split(/[,，、;/|]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function joinRelatedNames(names) {
  return [...new Set(names.map(n => n.trim()).filter(Boolean))].join(', ');
}

function companySoftKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/㈜/g, '')
    .replace(/\(주\)/g, '')
    .replace(/주식회사/g, '')
    .replace(/股份/g, '');
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const rows = await sql`
  SELECT id, company_name, manager, intake_data
  FROM clients
`;

const bySoft = new Map();
const byId = new Map();
for (const r of rows) {
  const lite = {
    id: r.id,
    companyName: r.company_name || '',
    manager: (r.manager || '').trim(),
    intake: r.intake_data && typeof r.intake_data === 'object' ? { ...r.intake_data } : {},
  };
  byId.set(lite.id, lite);
  const soft = companySoftKey(lite.companyName);
  if (soft && !bySoft.has(soft)) bySoft.set(soft, lite);
}

let linkFixes = 0;
for (const src of byId.values()) {
  const names = parseRelatedNames(src.intake.relatedCompanies);
  for (const name of names) {
    const peer = bySoft.get(companySoftKey(name));
    if (!peer || peer.id === src.id) continue;
    const peerNames = parseRelatedNames(peer.intake.relatedCompanies);
    if (peerNames.some(n => companySoftKey(n) === companySoftKey(src.companyName))) continue;
    peerNames.push(src.companyName);
    peer.intake.relatedCompanies = joinRelatedNames(peerNames);
    peer._dirtyLink = true;
    linkFixes += 1;
  }
}

for (const peer of byId.values()) {
  if (!peer._dirtyLink) continue;
  await sql`
    UPDATE clients
    SET intake_data = ${sql.json(peer.intake)}, updated_at = now()
    WHERE id = ${peer.id}
  `;
}
console.log('bidirectional link fills', linkFixes);

/** 연결 그룹(양방향) 수집 */
function collectGroup(startId) {
  const ids = new Set([startId]);
  const q = [startId];
  while (q.length) {
    const curId = q.pop();
    const cur = byId.get(curId);
    if (!cur) continue;
    for (const name of parseRelatedNames(cur.intake.relatedCompanies)) {
      const peer = bySoft.get(companySoftKey(name));
      if (!peer || ids.has(peer.id)) continue;
      ids.add(peer.id);
      q.push(peer.id);
    }
    const mySoft = companySoftKey(cur.companyName);
    if (!mySoft) continue;
    for (const peer of byId.values()) {
      if (ids.has(peer.id)) continue;
      const peerNames = parseRelatedNames(peer.intake.relatedCompanies);
      if (peerNames.some(n => companySoftKey(n) === mySoft)) {
        ids.add(peer.id);
        q.push(peer.id);
      }
    }
  }
  return ids;
}

const visited = new Set();
let managerFixes = 0;
for (const start of byId.values()) {
  if (visited.has(start.id)) continue;
  const hasRelated = parseRelatedNames(start.intake.relatedCompanies).length > 0;
  if (!hasRelated) {
    visited.add(start.id);
    continue;
  }
  const group = collectGroup(start.id);
  for (const id of group) visited.add(id);
  if (group.size < 2) continue;

  // 링크를 가진 쪽(관계 필드 비어있지 않음)의 manager — 동률이면 먼저 등장
  const counts = new Map();
  for (const id of group) {
    const c = byId.get(id);
    if (!c) continue;
    if (!parseRelatedNames(c.intake.relatedCompanies).length) continue;
    const m = c.manager;
    if (!m) continue;
    counts.set(m, (counts.get(m) || 0) + 1);
  }
  let chosen = '';
  let best = 0;
  for (const [m, n] of counts) {
    if (n > best) {
      best = n;
      chosen = m;
    }
  }
  if (!chosen) {
    for (const id of group) {
      const m = byId.get(id)?.manager;
      if (m) {
        chosen = m;
        break;
      }
    }
  }
  if (!chosen) continue;

  for (const id of group) {
    const c = byId.get(id);
    if (!c || c.manager === chosen) continue;
    await sql`
      UPDATE clients
      SET manager = ${chosen}, updated_at = now()
      WHERE id = ${id}
    `;
    await sql`
      UPDATE arrears_entries
      SET manager_name = ${chosen}, updated_at = now()
      WHERE client_id = ${id}
        AND coalesce(manager_name, '') IS DISTINCT FROM ${chosen}
    `;
    c.manager = chosen;
    managerFixes += 1;
  }
}

console.log('manager group fixes', managerFixes);

// verify asymmetries
let asym = 0;
let mgrMismatch = 0;
for (const src of byId.values()) {
  const names = parseRelatedNames(src.intake.relatedCompanies);
  for (const name of names) {
    const peer = bySoft.get(companySoftKey(name));
    if (!peer || peer.id === src.id) continue;
    const peerNames = parseRelatedNames(peer.intake.relatedCompanies);
    if (!peerNames.some(n => companySoftKey(n) === companySoftKey(src.companyName))) asym += 1;
    if (src.manager && peer.manager && src.manager !== peer.manager) mgrMismatch += 1;
  }
}
console.log('remaining asymmetric links', asym);
console.log('remaining manager mismatches in links', mgrMismatch);

await sql.end();
