/**
 * 다야 담당 수임처 → 리아/블루/윈터/페리 이관 + 다야 포트폴리오 강조 플래그
 * node --import tsx scripts/transfer-daya-managers.mjs
 * DRY_RUN=1 이면 저장 없이 매칭만 출력
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
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

/** 엑셀 매핑: 상호 → 새 담당자 */
const TRANSFERS = [
  // 리아
  ['(유)한빛이텍', '리아'],
  ['(주)금도건설', '리아'],
  ['(주)늘행운', '리아'],
  ['(주)로즈', '리아'],
  ['유한회사 엠솔루션', '리아'],
  ['주식회사 더푸른', '리아'],
  ['주식회사 위드리치', '리아'],
  ['주식회사 팀코리아(광주)', '리아'],
  ['기훈TV', '리아'],
  ['도경산업개발주식회사', '리아'],
  ['도리F&B(미음)', '리아'],
  ['리딩리더영어교습소', '리아'],
  ['볼트모아', '리아'],
  ['빌프랑', '리아'],
  ['삼일플렉스 주식회사', '리아'],
  ['성재테크', '리아'],
  ['아이오틱스', '리아'],
  ['호경에프에스', '리아'],
  // 블루
  ['(주)네모컴퍼니', '블루'],
  ['(주)동그라미', '블루'],
  ['주식회사 지엠레이저', '블루'],
  ['한국기술가치평가(주)', '블루'],
  ['비에스랩', '블루'],
  ['사 여백 찻잔', '블루'],
  ['에이스 머시너리', '블루'],
  ['에이치에스푸드 (동업자 최훈식)', '블루'],
  ['원푸드 (박상준)', '블루'],
  // 윈터
  ['(주)심데코', '윈터'],
  ['주식회사 하나디앤씨', '윈터'],
  ['밴앤드킴컬리지프렙', '윈터'],
  ['유라영어교습소', '윈터'],
  ['은이석빈네', '윈터'],
  // 페리
  ['(주)에이스미디어', '페리'],
  ['(주)지텍솔루션', '페리'],
  ['주식회사 올인원이엔씨', '페리'],
  ['그래비티스튜디오', '페리'],
  ['더프라이', '페리'],
  ['미야(시청)', '페리'],
  ['스카이라인', '페리'],
  ['에테르나인', '페리'],
  ['엘코드', '페리'],
  ['올인원E&C', '페리'],
  ['JH디자인컴퍼니', '페리'],
];

const dryRun = process.env.DRY_RUN === '1';

const { getDb } = await import('../db/index.ts');
const { clients } = await import('../db/schema.ts');
const { sql, eq } = await import('drizzle-orm');
const { updateClient } = await import('../lib/clientsDb.ts');

const db = getDb();
const dayaRows = await db
  .select()
  .from(clients)
  .where(sql`trim(${clients.manager}) = '다야'`);

const byName = new Map();
for (const r of dayaRows) {
  const key = String(r.companyName || '').trim();
  const list = byName.get(key) ?? [];
  list.push(r);
  byName.set(key, list);
}

function pickRow(name) {
  const list = byName.get(name) ?? [];
  if (list.length === 0) return null;
  const active = list.filter(r => r.status !== 'churned');
  if (active.length === 1) return active[0];
  if (active.length > 1) {
    // 동명이면 active 중 첫 건 + 경고
    return { row: active[0], ambiguous: active.length };
  }
  return list[0];
}

const ok = [];
const missing = [];
const ambiguous = [];

for (const [name, newManager] of TRANSFERS) {
  const hit = pickRow(name);
  if (!hit) {
    missing.push(name);
    continue;
  }
  const row = hit.row ?? hit;
  if (hit.ambiguous) ambiguous.push(`${name} (active×${hit.ambiguous})`);

  const intake =
    row.intakeData && typeof row.intakeData === 'object' && !Array.isArray(row.intakeData)
      ? { ...row.intakeData }
      : {};
  intake.dayaHighlight = true;

  console.log(
    `${dryRun ? '[dry] ' : ''}${row.companyName}  다야 → ${newManager}  (${row.id.slice(0, 8)}…)`,
  );

  if (!dryRun) {
    await updateClient(
      row.id,
      {
        companyName: row.companyName,
        manager: newManager,
        representative: row.representative ?? '',
        businessNo: row.businessNo ?? '',
        corporateNo: row.corporateNo ?? '',
        residentNo: row.residentNo ?? '',
        phone: row.phone ?? '',
        fax: row.fax ?? '',
        taxTypes: row.taxTypes ?? [],
        businessEntityType: row.businessEntityType ?? '',
        serviceTypes: row.serviceTypes ?? [],
        feeSummary: row.feeSummary,
        program: row.program ?? '',
        intakeData: { dayaHighlight: true },
      },
      { name: '시스템', loginId: 'charlie' },
    );
  }
  ok.push({ name, newManager, id: row.id });
}

// 남은 다야 업체에도 강조 플래그 (담당은 유지)
const transferredIds = new Set(ok.map(o => o.id));
let flagOnly = 0;
for (const row of dayaRows) {
  if (transferredIds.has(row.id)) continue;
  if (dryRun) continue;
  const intake =
    row.intakeData && typeof row.intakeData === 'object' && !Array.isArray(row.intakeData)
      ? { ...row.intakeData }
      : {};
  if (intake.dayaHighlight === true) continue;
  await db
    .update(clients)
    .set({
      intakeData: { ...intake, dayaHighlight: true },
      updatedAt: new Date(),
    })
    .where(eq(clients.id, row.id));
  flagOnly += 1;
}

console.log('\n--- summary ---');
console.log('mapped', TRANSFERS.length);
console.log('updated', ok.length);
console.log('missing', missing.length, missing);
console.log('ambiguous', ambiguous.length, ambiguous);
console.log('remaining daya flagged', flagOnly);
if (dryRun) console.log('(DRY_RUN — no writes)');
process.exit(missing.length ? 1 : 0);
