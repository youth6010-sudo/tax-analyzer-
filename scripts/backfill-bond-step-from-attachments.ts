/**
 * 채권관리 — 이미 올린 내용증명·지급명령 파일 기준으로 체크·날짜 자동 반영
 * (파일 발송일 → 없으면 업로드일. 기존 날짜가 비었거나 더 이전일 때만 갱신)
 *
 * npx tsx scripts/backfill-bond-step-from-attachments.ts           (dry-run → data/_bond-step-backfill.txt)
 * npx tsx scripts/backfill-bond-step-from-attachments.ts --apply
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
const STEPS = ['내용증명', '지급명령'] as const;

async function main() {
  const { getAppConfig, setAppConfig } = await import('../lib/appConfigDb');
  const { getDb } = await import('../db');
  const { arrearsEntries } = await import('../db/schema');

  type Att = { sentDate?: string; uploadedAt: string };
  type Rec = {
    attachments?: Partial<Record<string, Att[]>>;
    내용증명?: { checked: boolean; date: string };
    지급명령?: { checked: boolean; date: string };
  };
  const doc = (await getAppConfig<Record<string, unknown>>('bond_mgmt')) ?? {};
  const records = (doc.records ?? {}) as Record<string, Rec>;
  const rows = await getDb()
    .select({ id: arrearsEntries.id, name: arrearsEntries.companyName })
    .from(arrearsEntries);
  const names = new Map(rows.map(r => [String(r.id), r.name]));

  const at = new Date().toISOString();
  const changeLog: unknown[] = [];
  const lines: string[] = [];
  const counts = { 내용증명: 0, 지급명령: 0 };

  for (const [id, rec] of Object.entries(records)) {
    for (const step of STEPS) {
      const list = rec.attachments?.[step] ?? [];
      if (!list.length) continue;
      const latest = list
        .map(a => a.sentDate || a.uploadedAt.slice(0, 10))
        .filter(Boolean)
        .sort()
        .at(-1);
      if (!latest) continue;
      const cur = rec[step] ?? { checked: false, date: '' };
      const nextDate = !cur.date || latest > cur.date ? latest : cur.date;
      if (cur.checked && nextDate === cur.date) continue;
      counts[step] += 1;
      lines.push(
        `${step}\t${names.get(id) ?? id}\t체크 ${cur.checked ? 'O' : 'X'}→O\t날짜 ${cur.date || '(없음)'}→${nextDate}\t파일 ${list.length}건`,
      );
      if (!cur.checked) changeLog.push({ at, by: '시스템', entryId: id, step, action: '체크', detail: '업로드 파일 기준 자동 반영' });
      if (nextDate !== cur.date) {
        changeLog.push({
          at,
          by: '시스템',
          entryId: id,
          step,
          action: '날짜 변경',
          detail: `${cur.date || '(없음)'} → ${nextDate} (업로드 파일 기준)`,
        });
      }
      rec[step] = { checked: true, date: nextDate };
    }
  }

  lines.push('', `내용증명 ${counts.내용증명}건 · 지급명령 ${counts.지급명령}건 ${APPLY ? '반영 완료' : '(dry-run)'}`);
  const out = path.join(root, 'data', '_bond-step-backfill.txt');
  fs.writeFileSync(out, lines.join('\n'), 'utf8');

  if (APPLY && changeLog.length + counts.내용증명 + counts.지급명령 > 0) {
    const prevLog = Array.isArray(doc.changeLog) ? doc.changeLog : [];
    await setAppConfig('bond_mgmt', { ...doc, records, changeLog: [...prevLog, ...changeLog].slice(-5000) });
  }
  console.log(`done -> ${out}`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
