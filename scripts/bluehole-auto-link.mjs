/**
 * 블루홀 미연결 수임처 자동 연결 (CLI). 중계기(npm run relay:bluehole)가 켜져 있어야 한다.
 *
 *   node scripts/bluehole-auto-link.mjs          # dry-run (연결 미반영, 매칭 결과만)
 *   node scripts/bluehole-auto-link.mjs --apply  # 실제 연결
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDecipheriv, createHash } from 'crypto';
import postgres from 'postgres';
import * as bh from '../lib/bluehole/core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const apply = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

function decKey() {
  const raw = process.env.BLUEHOLE_ENC_KEY;
  if (!raw) throw new Error('BLUEHOLE_ENC_KEY 없음');
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return createHash('sha256').update(raw, 'utf8').digest();
}
function decryptSecret(enc) {
  const parts = (enc || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('자격증명 형식 오류');
  const [, ivB, tagB, ctB] = parts;
  const d = createDecipheriv('aes-256-gcm', decKey(), Buffer.from(ivB, 'base64'));
  d.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ctB, 'base64')), d.final()]).toString('utf8');
}

function normalizeCompanyName(raw) {
  let s = (raw || '').trim();
  if (!s) return '';
  s = s
    .replace(
      /주식회사|유한회사|유한책임회사|합자회사|합명회사|재단법인|사단법인|의료법인|사회복지법인|학교법인|영농조합법인|농업회사법인|협동조합/g,
      '',
    )
    .replace(/㈜|㈐|㈎|\(주\)|\(유\)|\(재\)|\(사\)|\(의\)|\(학\)|\(농\)/g, '');
  s = s.replace(/[\s()[\]{}<>.,·•\-_/\\'"`~!@#$%^&*+=|:;?]/g, '');
  return s.toLowerCase();
}
const bizDigits = (v) => (v || '').replace(/\D/g, '');

async function main() {
  // 블루홀 자격증명 보유 + 관리자 우선
  const [admin] =
    await sql`SELECT id, name, bluehole_login_id, bluehole_password_enc FROM users
             WHERE bluehole_login_id <> '' AND bluehole_password_enc <> ''
             ORDER BY (role = 'admin') DESC LIMIT 1`;
  if (!admin) throw new Error('블루홀 자격증명이 등록된 사용자가 없습니다.');
  console.log(`블루홀 계정: ${admin.name} (${admin.bluehole_login_id})`);

  if (process.env.BLUEHOLE_USE_RELAY === '1') {
    const [relayRow] = await sql`SELECT value FROM app_config WHERE key = 'bluehole_relay' LIMIT 1`;
    const relay = relayRow?.value;
    if (!relay?.url || !relay?.secret) throw new Error('중계기 설정(app_config.bluehole_relay)이 없습니다.');
    bh.configureBlueholeRelay({ baseUrl: relay.url, secret: relay.secret });
    console.log(`중계기 경유: ${relay.url}`);
  } else {
    bh.configureBlueholeRelay({});
    console.log('블루홀 직접 접속');
  }

  const password = decryptSecret(admin.bluehole_password_enc);
  const { cookie } = await bh.login({ loginId: admin.bluehole_login_id, password });

  const all = await bh.listClients(cookie, { limit: 3000 });
  console.log(`블루홀 거래처 목록: ${all.length}건`);

  const byBiz = new Map();
  const byName = new Map();
  for (const c of all) {
    const biz = bizDigits(c.business_number);
    if (biz.length === 10) {
      const a = byBiz.get(biz) ?? [];
      a.push(c);
      byBiz.set(biz, a);
    }
    for (const nm of [c.name, c.aka]) {
      const key = normalizeCompanyName(nm);
      if (key.length >= 2) {
        const a = byName.get(key) ?? [];
        a.push(c);
        byName.set(key, a);
      }
    }
  }

  const unlinked = await sql`
    SELECT id, company_name, business_no FROM clients
    WHERE bluehole_client_id = '' AND status IN ('active','churned')
    ORDER BY company_name
  `;
  console.log(`미연결 수임처: ${unlinked.length}건\n`);

  let linkedBiz = 0;
  let linkedName = 0;
  let ambiguous = 0;
  let noMatch = 0;

  for (const client of unlinked) {
    const biz = bizDigits(client.business_no);
    let matches = [];
    let by = null;
    if (biz.length === 10 && byBiz.has(biz)) {
      matches = byBiz.get(biz);
      by = 'biz';
    } else {
      const key = normalizeCompanyName(client.company_name);
      if (key.length >= 2 && byName.has(key)) {
        matches = byName.get(key);
        by = 'name';
      }
    }
    const uniq = new Map();
    for (const m of matches) if (!uniq.has(m.id)) uniq.set(m.id, m);
    const u = [...uniq.values()];

    if (by && u.length === 1) {
      const m = u[0];
      if (by === 'biz') linkedBiz++;
      else linkedName++;
      console.log(`  ✓ ${client.company_name} → ${m.name} (${by === 'biz' ? '사업자번호' : '상호'})`);
      if (apply) {
        await sql`UPDATE clients SET bluehole_client_id = ${m.id}, updated_at = NOW() WHERE id = ${client.id}`;
        await sql`INSERT INTO bluehole_sync_log (client_id, bluehole_client_id, action, user_id, user_name, changes, success_cols, warnings)
                  VALUES (${client.id}, ${m.id}, 'link', ${admin.id}, ${admin.name}, ${sql.json({ name: m.name || '' })}, ${sql.json([])}, ${sql.json([by === 'biz' ? '자동연결(사업자번호)' : '자동연결(상호)'])})`;
      }
    } else if (by && u.length > 1) {
      ambiguous++;
    } else {
      noMatch++;
    }
  }

  console.log(
    `\n결과: 사업자번호 일치 ${linkedBiz} · 상호 일치 ${linkedName} · 후보 다수(미연결) ${ambiguous} · 매칭없음 ${noMatch}`,
  );
  if (!apply) console.log('\n(dry-run) 실제 연결하려면 --apply 를 붙여 다시 실행하세요.');
  else console.log(`\n✓ 자동 연결 완료: ${linkedBiz + linkedName}건`);

  await sql.end();
}

main().catch(async (e) => {
  console.error('실패:', e.message || e);
  await sql.end().catch(() => {});
  process.exit(1);
});
