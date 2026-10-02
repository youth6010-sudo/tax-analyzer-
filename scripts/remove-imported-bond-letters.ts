/**
 * 채권관리 — 일괄등록(source=imported)한 내용증명 PDF만 삭제. 체크·날짜·수신정보는 유지.
 * (우체국 발송 스캔본은 담당자가 폴더 모달에서 직접 업로드)
 *
 * npx tsx scripts/remove-imported-bond-letters.ts           (dry-run)
 * npx tsx scripts/remove-imported-bond-letters.ts --apply
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const envPath = path.join(root, name);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const APPLY = process.argv.includes('--apply');

async function main() {
  const { readBondRecords } = await import('../lib/bondMgmtDb');
  const { getAppConfig, setAppConfig } = await import('../lib/appConfigDb');
  const { removeBondFile } = await import('../lib/bondStorage');

  const records = await readBondRecords();
  let count = 0;
  for (const rec of Object.values(records)) {
    const list = rec.attachments?.내용증명 ?? [];
    const imported = list.filter(a => a.source === 'imported');
    if (!imported.length) continue;
    for (const a of imported) {
      count += 1;
      console.log(`  - ${a.filename}`);
      if (APPLY) await removeBondFile(a.storagePath);
    }
    rec.attachments = { ...rec.attachments, 내용증명: list.filter(a => a.source !== 'imported') };
  }
  if (APPLY && count) {
    const doc = (await getAppConfig<Record<string, unknown>>('bond_mgmt')) ?? {};
    await setAppConfig('bond_mgmt', { ...doc, records });
  }
  console.log(`\n일괄등록 첨부 ${count}건 ${APPLY ? '삭제 완료' : '(dry-run)'}`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
