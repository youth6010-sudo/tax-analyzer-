/**
 * 검토표 수임처 연결 초기화 + 자동 재연결
 *
 *   npm run rebuild:review-links -- --dry-run
 *   npm run rebuild:review-links -- --reset --apply
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

import { listClients } from '../lib/clientsDb';
import { clearAllReviewClientLinks, replaceReviewClientLinks } from '../lib/review/clientLinkDb';
import { matchAllReviewEntries } from '../lib/review/clientMatch';
import { listReviewCompanyEntries } from '../lib/review/reviewCompanyIndex';

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const apply = args.includes('--apply');

async function main() {
  console.log(`[rebuild-review-links] reset=${reset} apply=${apply}`);

  const [entries, clients] = await Promise.all([
    listReviewCompanyEntries(),
    listClients({ includeChurned: true }),
  ]);

  if (reset) {
    if (apply) {
      await clearAllReviewClientLinks();
      console.log('review_client_links 전체 삭제 완료');
    } else {
      console.log('[dry-run] review_client_links 전체 삭제 예정');
    }
  }

  const results = matchAllReviewEntries(entries, clients);
  const plans = results.filter(r => r.confidence === 'high' && r.clientIds.length && r.method);
  const unmatched = results.filter(r => !r.clientIds.length);

  const byMethod = new Map<string, number>();
  for (const p of plans) {
    byMethod.set(p.method!, (byMethod.get(p.method!) ?? 0) + 1);
  }

  console.log(`\n검토표 업체: ${entries.length}`);
  console.log(`자동 연결 예정: ${plans.length}`);
  for (const [method, count] of byMethod) {
    console.log(`  - ${method}: ${count}`);
  }
  console.log(`미매칭: ${unmatched.length}`);

  if (plans.length) {
    console.log('\n--- 연결 예정 (최대 30건) ---');
    for (const p of plans.slice(0, 30)) {
      console.log(
        `  [${p.method}] ${p.reviewName} → ${p.clientIds.length}곳 (${p.clientIds.join(', ')})`,
      );
    }
    if (plans.length > 30) console.log(`  … 외 ${plans.length - 30}건`);
  }

  if (unmatched.length) {
    console.log('\n--- 미매칭 (최대 40건) ---');
    for (const e of unmatched.slice(0, 40)) {
      const entry = entries.find(x => x.reviewKey === e.reviewKey);
      const owners = entry?.owners.join(', ') || '-';
      const kinds = entry?.taxKinds.join(', ') || '-';
      console.log(`  ${e.reviewName} | ${kinds} | 담당 ${owners}`);
      if (e.suggestions.length) {
        console.log(
          `    추천: ${e.suggestions.map(s => s.companyName).slice(0, 3).join(', ')}`,
        );
      }
    }
    if (unmatched.length > 40) console.log(`  … 외 ${unmatched.length - 40}건`);
  }

  if (apply) {
    let saved = 0;
    for (const p of plans) {
      await replaceReviewClientLinks({
        reviewKey: p.reviewKey,
        reviewName: p.reviewName,
        clientIds: p.clientIds,
        updatedBy: null,
        matchMethod: p.method!,
      });
      saved++;
    }
    console.log(`\n저장 완료: ${saved}건`);
  } else {
    console.log('\n[dry-run] DB 변경 없음. 적용하려면 --apply 추가');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
