/**
 * 채권관리 1회성 정리
 *  --rose     (주)로즈 해임통보 문서번호 007호 중복 → 다음 번호로 정정
 *  --backlog  변경 이력 기능 이전 기록(첨부 업로드·안내문 발급)을 변경 이력에 소급 추가
 *
 * npx tsx scripts/fix-bond-docno-and-backfill-log.ts --rose --backlog           (dry-run → data/_bond-fix.txt)
 * npx tsx scripts/fix-bond-docno-and-backfill-log.ts --rose --backlog --apply
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
const ROSE = process.argv.includes('--rose');
const BACKLOG = process.argv.includes('--backlog');
const DUP_NO = '청년들-부산-추심-2026-007호';
const MARK = '(소급)';
const DOC_NO_RE = /^청년들-부산-추심-(\d{4})-(\d+)호$/;

type Log = { at: string; by: string; entryId: string; step: string; action: string; detail: string };

async function main() {
  const { getAppConfig, setAppConfig } = await import('../lib/appConfigDb');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = (await getAppConfig('bond_mgmt')) ?? {};
  const lines: string[] = [];
  const changeLog: Log[] = [...(doc.changeLog ?? [])];
  const at = new Date().toISOString();

  if (ROSE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const log: any[] = doc.docLog ?? [];
    const rose = log.find(l => l.docNo === DUP_NO && String(l.companyName).includes('로즈'));
    if (!rose) {
      lines.push('[로즈] 007호 기록 없음 — 이미 정정됨');
    } else {
      let max = Number(doc.docSeq?.['2026'] ?? 0);
      for (const l of log) {
        const m = DOC_NO_RE.exec(l.docNo);
        if (m && m[1] === '2026') max = Math.max(max, Number(m[2]));
      }
      for (const r of Object.values<{ 해임통보?: { notices?: { docNo: string }[] } }>(doc.records)) {
        for (const n of r.해임통보?.notices ?? []) {
          const m = DOC_NO_RE.exec(n.docNo);
          if (m && m[1] === '2026') max = Math.max(max, Number(m[2]));
        }
      }
      const newNo = `청년들-부산-추심-2026-${String(max + 1).padStart(3, '0')}호`;
      const reason = `문서번호 중복 정정 (007호 → ${newNo.match(/-(\d+호)$/)![1]}, (주)블레싱에이엠씨와 중복)`;
      lines.push(`[로즈] entry ${rose.entryId}: ${DUP_NO} → ${newNo}`);
      const stamp = { docNo: newNo, modifiedAt: at, modifiedBy: '관리자', modifyReason: reason };
      Object.assign(rose, stamp);
      const notices = doc.records[rose.entryId]?.해임통보?.notices ?? [];
      const n = notices.find((x: { docNo: string }) => x.docNo === DUP_NO);
      if (n) Object.assign(n, stamp);
      lines.push(`  발송 기록 갱신: ${n ? 'O' : 'X (기록 없음)'}`);
      doc.docSeq = { ...doc.docSeq, 2026: max + 1 };
      changeLog.push({ at, by: '관리자', entryId: rose.entryId, step: '해임통보', action: '안내문 수정', detail: `사유: ${reason}` });
    }
  }

  if (BACKLOG) {
    if (changeLog.some(l => l.detail?.includes(MARK))) {
      lines.push('[소급] 이미 추가됨 — 건너뜀');
    } else {
      const add: Log[] = [];
      const issued = new Set<string>();
      for (const l of doc.docLog ?? []) {
        issued.add(l.entryId);
        add.push({
          at: l.issuedAt,
          by: l.issuedBy,
          entryId: l.entryId,
          step: '해임통보',
          action: '안내문 발송 기록',
          detail: `${l.docNo} · v.${l.version} · 발송 ${l.sentDate} · 기한 ${l.deadline} ${MARK}`,
        });
      }
      for (const [id, r] of Object.entries<{ attachments?: Record<string, { filename: string; sentDate?: string; uploadedAt: string; source: string }[]> }>(doc.records)) {
        for (const [step, list] of Object.entries(r.attachments ?? {})) {
          for (const a of list ?? []) {
            if (step === '해임통보' && a.source === 'generated' && issued.has(id)) continue;
            add.push({
              at: a.uploadedAt,
              by: '(기록 이전)',
              entryId: id,
              step,
              action: a.source === 'generated' ? '서식생성 파일 저장' : '파일 추가',
              detail: `${a.filename}${a.sentDate ? ` (${a.sentDate})` : ''} ${MARK}`,
            });
          }
        }
      }
      const by = add.reduce<Record<string, number>>((m, l) => ({ ...m, [l.step]: (m[l.step] ?? 0) + 1 }), {});
      lines.push(`[소급] ${add.length}건 추가: ${JSON.stringify(by)}`);
      changeLog.push(...add);
    }
  }

  changeLog.sort((a, b) => a.at.localeCompare(b.at));
  lines.push('', APPLY ? '반영 완료' : '(dry-run)');
  const out = path.join(root, 'data', '_bond-fix.txt');
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  if (APPLY) await setAppConfig('bond_mgmt', { ...doc, changeLog: changeLog.slice(-5000) });
  console.log(`done -> ${out}`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
