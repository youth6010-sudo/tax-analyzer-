/**
 * 검토표 수임처 연결 — 레거시 키 → 담당자 스코프 키 마이그레이션
 *
 *   npm run migrate:review-links
 *   npm run migrate:review-links -- --dry-run
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const envPath = path.join(scriptRoot, name);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

import { migrateReviewClientLinksToScoped } from '../lib/review/migrateReviewClientLinks';
import { invalidateClientLinksIndexCache } from '../lib/review/clientLink';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(`[migrate-review-links] dryRun=${dryRun}`);
  const result = await migrateReviewClientLinksToScoped({ dryRun });
  if (!dryRun) invalidateClientLinksIndexCache();
  console.log(`마이그레이션: ${result.migrated}건`);
  console.log(`스킵: ${result.skipped.length}건`);
  if (result.conflicts.length) {
    console.log(`충돌(수동 확인 필요): ${result.conflicts.length}건`);
    for (const c of result.conflicts.slice(0, 20)) {
      console.log(`  ${c.reviewKey} / ${c.clientId} → [${c.candidates.join(', ')}]`);
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
