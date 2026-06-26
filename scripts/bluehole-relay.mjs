// 블루홀 중계기 (사무실 PC에서 실행)
//
// 목적: Vercel(해외 IP) 등에서 블루홀에 직접 접속하면 IP 허용목록에 막힌다.
//       이 중계기를 "사무실 PC"에서 띄우면, 블루홀로 나가는 요청이 사무실 IP에서 출발해 통과된다.
//
// 동작:
//   1) 127.0.0.1:8787 에 프록시 서버를 띄운다. (x-relay-secret 헤더 검증 → bluehole.world 로 그대로 전달)
//   2) cloudflared 무료 터널로 이 프록시를 공개 URL(https://xxx.trycloudflare.com)로 노출한다.
//   3) 공개 URL + 비밀토큰을 DB(app_config.bluehole_relay)에 등록한다. (URL이 바뀌면 자동 갱신)
//   → Vercel 앱은 DB에서 이 값을 읽어 블루홀 호출을 중계기로 보낸다. (BLUEHOLE_USE_RELAY=1)
//
// 사전 준비: cloudflared 설치 필요 (무료, 계정 불필요)
//   Windows:  winget install --id Cloudflare.cloudflared
//   또는 https://github.com/cloudflare/cloudflared/releases 에서 받아 PATH 에 추가
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env.local');

// .env.local / .env 로드
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL 이 필요합니다 (.env.local).');
  process.exit(1);
}

// 중계 비밀토큰 — 없으면 생성해서 .env.local 에 저장
let SECRET = process.env.BLUEHOLE_RELAY_SECRET;
if (!SECRET) {
  SECRET = randomBytes(24).toString('hex');
  let txt = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  if (txt && !txt.endsWith('\n')) txt += '\n';
  txt += `BLUEHOLE_RELAY_SECRET=${SECRET}\n`;
  fs.writeFileSync(envPath, txt);
  console.log('[relay] BLUEHOLE_RELAY_SECRET 생성·저장 완료 (.env.local)');
}

const TARGET = 'https://bluehole.world';
const PORT = Number(process.env.BLUEHOLE_RELAY_PORT || 8787);
const HOP_BY_HOP = new Set([
  'host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'x-relay-secret', 'content-length',
]);

const sql = postgres(DATABASE_URL, { max: 1, prepare: false });
let lastUrl = '';

async function registerUrl(url) {
  if (!url || url === lastUrl) return;
  lastUrl = url;
  await sql`
    INSERT INTO app_config (key, value, updated_at)
    VALUES ('bluehole_relay', ${sql.json({ url, secret: SECRET, updatedAt: new Date().toISOString() })}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  console.log(`\n[relay] ✅ 공개 주소 등록 완료 → DB(app_config.bluehole_relay)`);
  console.log(`[relay]    ${url}\n[relay]    이제 Vercel 앱에서 블루홀이 동작합니다 (BLUEHOLE_USE_RELAY=1 필요).\n`);
}

// ── 프록시 서버 ──────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  try {
    if ((req.headers['x-relay-secret'] || '') !== SECRET) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('forbidden');
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);

    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) headers[k] = v;
    }

    const upstream = await fetch(TARGET + req.url, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
      redirect: 'manual',
    });

    const buf = Buffer.from(await upstream.arrayBuffer());
    const outHeaders = {};
    upstream.headers.forEach((v, k) => {
      const lk = k.toLowerCase();
      if (lk === 'set-cookie' || lk === 'content-encoding' || lk === 'content-length' || lk === 'transfer-encoding') return;
      outHeaders[k] = v;
    });
    const setCookies =
      typeof upstream.headers.getSetCookie === 'function'
        ? upstream.headers.getSetCookie()
        : upstream.headers.get('set-cookie')
        ? [upstream.headers.get('set-cookie')]
        : [];
    if (setCookies.length) outHeaders['set-cookie'] = setCookies;

    res.writeHead(upstream.status, outHeaders);
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('relay error: ' + (e instanceof Error ? e.message : String(e)));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[relay] 프록시 가동: http://127.0.0.1:${PORT} → ${TARGET}`);
  startTunnel();
});

// ── cloudflared 무료 터널 ────────────────────────────────────
function startTunnel() {
  console.log('[relay] cloudflared 터널 시작...');
  let cf;
  try {
    cf = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PORT}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    printCloudflaredHelp();
    process.exit(1);
  }
  cf.on('error', () => {
    printCloudflaredHelp();
    process.exit(1);
  });
  const onData = (d) => {
    const s = d.toString();
    process.stdout.write(s.includes('trycloudflare.com') ? s : '');
    const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (m) registerUrl(m[0]).catch((e) => console.error('[relay] DB 등록 실패:', e.message));
  };
  cf.stdout.on('data', onData);
  cf.stderr.on('data', onData);
  cf.on('exit', (code) => {
    console.error(`[relay] cloudflared 종료(code ${code}). 5초 후 재시작...`);
    setTimeout(startTunnel, 5000);
  });
}

function printCloudflaredHelp() {
  console.error('\n[relay] cloudflared 가 설치되어 있지 않습니다. (무료, 계정 불필요)');
  console.error('  설치: winget install --id Cloudflare.cloudflared');
  console.error('  또는: https://github.com/cloudflare/cloudflared/releases 에서 받아 PATH 에 추가');
  console.error('  설치 후 다시:  npm run relay:bluehole\n');
}

process.on('SIGINT', async () => {
  console.log('\n[relay] 종료 중...');
  try { await sql.end({ timeout: 3 }); } catch {}
  process.exit(0);
});
