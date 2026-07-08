/**
 * 미연결 검토표 항목만 고신뢰 자동 연결 (기존 수동 연결 유지)
 *
 *   npm run auto-link:review
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

import { runAutoLinkReviewClients } from '../lib/review/autoLinkReview';

async function main() {
  const result = await runAutoLinkReviewClients(null);
  const byMethod = new Map<string, number>();
  for (const row of result.linked) {
    byMethod.set(row.method, (byMethod.get(row.method) ?? 0) + 1);
  }

  console.log(`신규 자동 연결: ${result.linked.length}건 · 미매칭 ${result.skipped}건`);
  for (const [method, count] of byMethod) {
    console.log(`  - ${method}: ${count}`);
  }
  if (result.suggestions.length) {
    console.log(`\n추천 대기: ${result.suggestions.length}건`);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
