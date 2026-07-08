/**
 * 검토표 업체 인덱스 DB 캐시 빌드
 *
 *   npm run rebuild:company-index
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

import { rebuildCompanyIndexCache } from '../lib/review/reviewCompanyIndexCache';

async function main() {
  console.log('[rebuild:company-index] 시작…');
  const meta = await rebuildCompanyIndexCache();
  console.log(
    `[rebuild:company-index] 완료: ${meta.entryCount}건 · ${meta.builtAt ?? '(없음)'}`,
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
