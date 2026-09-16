/**
 * 1) 리아←다야 이관분 중 채권회수 → 찰리
 * 2) 신고대리 관계업체(relatedCompanies) 반영 + 관계업체 담당에 맞춰 신고대리 담당 동기화
 * node scripts/apply-singo-related-and-charlie.mjs
 * DRY_RUN=1 이면 저장 없이 미리보기
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

const dryRun = process.env.DRY_RUN === '1';

/** 첨부 현황: 신고대리 상호 → 관계업체 (빈칸 제외) */
const SINGO_RELATED = [
  ['강송단', '유라영어교습소'],
  ['김아준', '(주)동그라미'],
  ['김용화 임대', '(주)동그라미'],
  ['김제림', '(주)동그라미'],
  ['도순빌딩', '(주)금도건설'],
  ['도순빌딩(이귀순)', '(주)금도건설'],
  ['도주락', '도리F&B(미음)'],
  ['르엘(구.라비앙로즈)', '(주)늘행운'],
  ['박준영', '루나 스테이'],
  ['배유빈', '(주)늘행운'],
  ['배유빈면세-최근', '(주)늘행운'],
  ['세모컴퍼니', '(주)동그라미'],
  ['스테이S스터디카페', '(주)늘행운'],
  ['아꼬떼', '(주)동그라미'],
  ['아르니스 아카데미', '에테르나인'],
  ['안성환(테일러)', '성재테크'],
  ['웰바이오텍', '(주)지텍솔루션'],
  ['제영테크', '(주)에이스미디어'],
  ['지오2-최근', '(주)늘행운'],
  ['프런티어랩', '(주)지텍솔루션'],
];

/** 리아로 이관된 상호 (원본 이관 목록) */
const LIA_FROM_DAYA = new Set([
  '(유)한빛이텍',
  '(주)금도건설',
  '(주)늘행운',
  '(주)로즈',
  '유한회사 엠솔루션',
  '주식회사 더푸른',
  '주식회사 위드리치',
  '주식회사 팀코리아(광주)',
  '기훈TV',
  '도경산업개발주식회사',
  '도리F&B(미음)',
  '리딩리더영어교습소',
  '볼트모아',
  '빌프랑',
  '삼일플렉스 주식회사',
  '성재테크',
  '아이오틱스',
  '호경에프에스',
]);

function softKey(s) {
  return String(s || '')
    .replace(/\s+/g, '')
    .replace(/[＆&]/g, '')
    .replace(/㈜/g, '(주)')
    .replace(/주식회사/g, '(주)')
    .replace(/유한회사/g, '(유)')
    .replace(/[()（）·・./\-]/g, '')
    .toLowerCase();
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  const clients = await sql`
    SELECT id, company_name, manager, status,
           intake_data AS intake,
           intake_data->>'category' AS category,
           intake_data->>'dayaHighlight' AS daya,
           coalesce(intake_data->>'relatedCompanies','') AS related
    FROM clients
  `;

  const byKey = new Map();
  for (const c of clients) {
    const k = softKey(c.company_name);
    if (!k) continue;
    const list = byKey.get(k) ?? [];
    list.push(c);
    byKey.set(k, list);
  }

  function pickBest(name, preferSingo = false) {
    const list = byKey.get(softKey(name)) ?? [];
    if (!list.length) return null;
    const active = list.filter(r => r.status !== 'churned');
    const pool = active.length ? active : list;
    if (preferSingo) {
      const singo = pool.find(r => r.category === '신고대리');
      if (singo) return singo;
    }
    return pool[0];
  }

  const recovery = await sql`
    SELECT client_id, company_name
    FROM arrears_entries
    WHERE mgmt_category = 'recovery'
  `;
  const recoveryClientIds = new Set(recovery.map(r => r.client_id).filter(Boolean));
  const recoveryKeys = new Set(recovery.map(r => softKey(r.company_name)).filter(Boolean));

  function isRecoveryClient(c) {
    if (recoveryClientIds.has(c.id)) return true;
    return recoveryKeys.has(softKey(c.company_name));
  }

  async function setManager(row, newManager, reason) {
    const prev = (row.manager || '').trim();
    if (prev === newManager) {
      console.log(`  skip mgr ${row.company_name}: 이미 ${newManager}`);
      return false;
    }
    console.log(`  mgr ${row.company_name}: ${prev || '(없음)'} → ${newManager} (${reason})`);
    if (dryRun) {
      row.manager = newManager;
      return true;
    }
    const users = await sql`
      SELECT id FROM users WHERE trim(name) = ${newManager} LIMIT 1
    `;
    const assigned = users[0]?.id ?? null;
    await sql`
      UPDATE clients
      SET manager = ${newManager},
          assigned_user_id = ${assigned},
          updated_at = now()
      WHERE id = ${row.id}
    `;
    await sql`
      INSERT INTO client_manager_changes (client_id, previous_manager, new_manager, changed_at)
      VALUES (${row.id}, ${prev}, ${newManager}, now())
    `;
    row.manager = newManager;
    return true;
  }

  async function setRelated(row, relatedName) {
    const cur = String(row.related || '').trim();
    if (cur === relatedName) {
      console.log(`  skip related ${row.company_name}: 이미 ${relatedName}`);
      return false;
    }
    console.log(`  related ${row.company_name}: [${cur || '—'}] → [${relatedName}]`);
    if (dryRun) return true;
    const intake =
      row.intake && typeof row.intake === 'object' && !Array.isArray(row.intake)
        ? { ...row.intake }
        : {};
    intake.relatedCompanies = relatedName;
    await sql`
      UPDATE clients
      SET intake_data = ${sql.json(intake)}, updated_at = now()
      WHERE id = ${row.id}
    `;
    row.related = relatedName;
    row.intake = intake;
    return true;
  }

  // ── 1) 리아←다야 이관 + 채권회수 → 찰리 ──
  console.log('\n=== 1) 리아 이관분 중 채권회수 → 찰리 ===');
  let charlieN = 0;
  for (const name of LIA_FROM_DAYA) {
    const row = pickBest(name);
    if (!row) {
      console.log(`  MISSING ${name}`);
      continue;
    }
    const mgr = (row.manager || '').trim();
    // 현재 리아이거나, 다야하이라이트+과거 리아 이관 대상
    if (mgr !== '리아' && !(row.daya === 'true' && mgr === '리아')) {
      // 이미 찰리로 바뀌었거나 다른 담당이면 스킵 (리아만 대상)
      if (mgr === '찰리') {
        console.log(`  already 찰리: ${row.company_name}`);
        continue;
      }
      if (mgr !== '리아') {
        console.log(`  skip (담당 ${mgr}): ${row.company_name}`);
        continue;
      }
    }
    if (!isRecoveryClient(row)) {
      console.log(`  not recovery: ${row.company_name}`);
      continue;
    }
    if (await setManager(row, '찰리', '리아←다야 이관 + 채권회수')) charlieN += 1;
  }
  console.log(`찰리 변경 ${charlieN}건`);

  // refresh manager map after charlie moves
  // (in-memory row.manager already updated)

  // ── 2) 신고대리 관계업체 + 담당 동기화 ──
  console.log('\n=== 2) 신고대리 관계업체 반영 · 담당 동기화 ===');
  let relatedN = 0;
  let syncMgrN = 0;
  let missingSingo = [];
  let missingRelated = [];

  for (const [singoName, relatedName] of SINGO_RELATED) {
    const singo = pickBest(singoName, true);
    if (!singo) {
      missingSingo.push(singoName);
      console.log(`  MISSING 신고대리: ${singoName}`);
      continue;
    }
    if (await setRelated(singo, relatedName)) relatedN += 1;

    const related = pickBest(relatedName);
    if (!related) {
      missingRelated.push(`${singoName} → ${relatedName}`);
      console.log(`  MISSING 관계업체: ${relatedName} (from ${singoName})`);
      continue;
    }

    // 관계업체에도 역방향 연관(없으면) 보강
    const rev = String(related.related || '').trim();
    if (!rev) {
      await setRelated(related, singo.company_name);
    }

    const targetMgr = (related.manager || '').trim();
    if (!targetMgr) {
      console.log(`  no mgr on related ${related.company_name}`);
      continue;
    }
    if (await setManager(singo, targetMgr, `관계업체 ${related.company_name}`)) syncMgrN += 1;
  }

  console.log('\n--- summary ---');
  console.log('찰리 변경:', charlieN);
  console.log('관계업체 기록:', relatedN);
  console.log('신고대리 담당 동기화:', syncMgrN);
  if (missingSingo.length) console.log('미매칭 신고대리:', missingSingo.join(', '));
  if (missingRelated.length) console.log('미매칭 관계업체:', missingRelated.join(', '));
  if (dryRun) console.log('(DRY_RUN)');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
