/**
 * 채권관리 — 9/29 발송한 최종 내용증명 PDF를 Supabase(bond-docs)에 올리고 첨부로 등록
 *
 * npx tsx scripts/import-bond-certified-letters.ts            (dry-run: 매칭 결과만 출력)
 * npx tsx scripts/import-bond-certified-letters.ts --apply    (업로드 + 내용증명 체크/날짜 + 수신정보 저장)
 *   [--dir 폴더] [--excel 내용증명_내용.xlsx] [--date 2026-09-29]
 *   [--replace]  매칭된 업체의 기존 내용증명 첨부를 지우고 이 폴더 파일로 교체
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

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

const BASE = String.raw`Z:\11_프로젝트&외부수임\01. 진행중\채권추심 프로젝트\02. 내용증명 발송`;
const DEFAULT_DIR = path.join(BASE, '내용증명 서류 (찰리 수정)');
const DEFAULT_EXCEL = path.join(BASE, '내용증명_내용_26.09.15(최종).xlsx');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const APPLY = process.argv.includes('--apply');
const REPLACE = process.argv.includes('--replace');
const DIR = arg('dir') || DEFAULT_DIR;
const EXCEL = arg('excel') || DEFAULT_EXCEL;
const SENT_DATE = arg('date') || '2026-09-29';

/** 파일명 상호 → 미수관리 업체명 (정규화로 안 맞는 경우만) */
const MANUAL_MAP: Record<string, string> = {
  '고문환(예윤F＆C)': '예윤F＆C',
  // 발송완료 스캔본 파일명 (3쪽=광주, 2쪽=회생채권)
  '주식회사 팀코리아': '주식회사 팀코리아(광주)',
  '주식회사 팀코리아(채권)': '팀코리아-회생채권',
};

/** 파일명 상호 → 엑셀 수신정보 상호 (같은 법인을 두 건으로 보낸 경우) */
const RECIPIENT_ALIAS: Record<string, string> = {
  '주식회사 팀코리아(광주)': '주식회사 팀코리아',
  '주식회사 팀코리아-회생채권': '주식회사 팀코리아',
  '주식회사 팀코리아(채권)': '주식회사 팀코리아',
};

function norm(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/주식회사|유한회사|\(주\)|\(유\)|㈜/g, '')
    .replace(/\(.*?co\.?,?\s*ltd\.?\)/gi, '')
    .replace(/[\s()·.,\-_&＆]/g, '')
    .toLowerCase();
}

type Entry = { id: string; companyName: string; mgmtCategory: string; managerName: string };

function pickEntry(name: string, entries: Entry[]): { entry: Entry | null; how: string; candidates: Entry[] } {
  const target = MANUAL_MAP[name] ?? name;
  const exact = entries.filter(e => e.companyName.trim() === target.trim());
  const n = norm(target);
  const normed = exact.length ? exact : entries.filter(e => norm(e.companyName) === n);
  const pool = normed.length
    ? normed
    : entries.filter(e => n.length >= 3 && (norm(e.companyName).includes(n) || n.includes(norm(e.companyName))));
  const recovery = pool.filter(e => e.mgmtCategory === 'recovery');
  const chosen = recovery.length === 1 ? recovery[0]! : pool.length === 1 ? pool[0]! : null;
  const how = exact.length ? '일치' : normed.length ? '정규화' : pool.length ? '부분' : '없음';
  return { entry: chosen, how, candidates: pool };
}

type RecipientRow = {
  상호: string;
  구분: '법인' | '개인' | '';
  등록번호: string;
  사업장주소: string;
  실제주소: string;
};

function readRecipients(): RecipientRow[] {
  if (!fs.existsSync(EXCEL)) {
    console.warn(`엑셀 없음 — 수신정보 생략: ${EXCEL}`);
    return [];
  }
  const wb = XLSX.read(fs.readFileSync(EXCEL));
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  const hi = rows.findIndex(r => r.some(c => String(c).trim() === '상호'));
  if (hi < 0) return [];
  const header = rows[hi]!.map(c => String(c).trim());
  const col = (k: string) => header.findIndex(h => h.replace(/\s/g, '') === k);
  const ci = { 상호: col('상호'), 구분: col('법인/개인'), 등록번호: col('등록번호'), 사업장: col('사업장주소'), 실제: col('실제주소') };
  return rows
    .slice(hi + 1)
    .map(r => {
      const g = String(r[ci.구분] ?? '').trim();
      return {
        상호: String(r[ci.상호] ?? '').trim(),
        구분: (g === '법인' || g === '개인' ? g : '') as RecipientRow['구분'],
        등록번호: String(r[ci.등록번호] ?? '').trim(),
        사업장주소: String(r[ci.사업장] ?? '').trim(),
        실제주소: String(r[ci.실제] ?? '').trim(),
      };
    })
    .filter(r => r.상호);
}

async function main() {
  const { getDb } = await import('../db');
  const { arrearsEntries } = await import('../db/schema');
  const { readBondRecords } = await import('../lib/bondMgmtDb');
  const { getAppConfig, setAppConfig } = await import('../lib/appConfigDb');
  const { uploadBondFile, buildBondStoragePath, removeBondFile } = await import('../lib/bondStorage');
  type Stored = import('../app/types/bond').BondStoredRecord;

  const files = fs
    .readdirSync(DIR)
    .filter(f => /^내용증명_.+\.pdf$/i.test(f))
    .sort((a, b) => a.localeCompare(b, 'ko'));
  console.log(
    `폴더: ${DIR}\nPDF ${files.length}건 · 발송일 ${SENT_DATE} · ${APPLY ? 'APPLY' : 'DRY-RUN'}${REPLACE ? ' · 교체' : ''}\n`,
  );

  const db = getDb();
  const entries: Entry[] = (
    await db
      .select({
        id: arrearsEntries.id,
        companyName: arrearsEntries.companyName,
        mgmtCategory: arrearsEntries.mgmtCategory,
        managerName: arrearsEntries.managerName,
      })
      .from(arrearsEntries)
  ).map(e => ({ ...e, managerName: e.managerName ?? '' }));

  const recipients = readRecipients();
  const records: Record<string, Stored> = await readBondRecords();

  const saveRecords = async () => {
    const doc = (await getAppConfig<Record<string, unknown>>('bond_mgmt')) ?? {};
    await setAppConfig('bond_mgmt', { ...doc, records });
  };
  const cleared = new Set<string>();
  const unmatched: string[] = [];
  let done = 0;
  for (const file of files) {
    const name = file
      .replace(/^내용증명_/, '')
      .replace(/\.pdf$/i, '')
      .replace(/_\d{8}$/, '')
      .replace(/_첨부포함$/, '');
    const { entry, how, candidates } = pickEntry(name, entries);
    if (!entry) {
      unmatched.push(name);
      console.log(`  ✗ ${name}  (${how}${candidates.length ? ` 후보: ${candidates.map(c => `${c.companyName}[${c.mgmtCategory || '-'}]`).join(', ')}` : ''})`);
      continue;
    }
    const rName = RECIPIENT_ALIAS[name] ?? name;
    const rcpt = recipients.find(r => r.상호 === rName) ?? recipients.find(r => norm(r.상호) === norm(rName));
    const warn = entry.mgmtCategory !== 'recovery' ? ' ⚠ 채권회수 분류 아님' : '';
    const prev = records[entry.id]?.attachments?.내용증명 ?? [];
    console.log(
      `  ✓ ${name} → ${entry.companyName} (${how}, ${entry.managerName || '담당없음'})${rcpt ? '' : ' · 수신정보 없음'}${warn}` +
        (prev.length ? `  [기존 ${prev.map(a => a.filename).join(', ')}]` : ''),
    );
    if (!APPLY) continue;

    const rec: Stored = records[entry.id] ?? {};
    if (REPLACE && !cleared.has(entry.id)) {
      cleared.add(entry.id);
      for (const a of rec.attachments?.내용증명 ?? []) await removeBondFile(a.storagePath);
      rec.attachments = { ...rec.attachments, 내용증명: [] };
    }
    const existing = rec.attachments?.내용증명 ?? [];
    if (existing.some(a => a.filename === file && a.sentDate === SENT_DATE)) {
      console.log('      (이미 등록됨 — 건너뜀)');
      continue;
    }
    const buf = fs.readFileSync(path.join(DIR, file));
    const fileId = randomUUID();
    const storagePath = buildBondStoragePath(entry.id, 0, fileId, file, 'application/pdf');
    await uploadBondFile(storagePath, buf, 'application/pdf');
    rec.attachments = {
      ...rec.attachments,
      내용증명: [
        ...existing,
        {
          id: fileId,
          filename: file,
          storagePath,
          size: buf.length,
          uploadedAt: new Date().toISOString(),
          sentDate: SENT_DATE,
          mimeType: 'application/pdf',
          source: 'imported',
        },
      ],
    };
    rec.내용증명 = { checked: true, date: SENT_DATE };
    if (rcpt && !rec.recipient) rec.recipient = rcpt;
    records[entry.id] = rec;
    await saveRecords();
    done += 1;
  }

  console.log(`\n매칭 ${files.length - unmatched.length}/${files.length}${APPLY ? ` · 등록 ${done}건` : ''}`);
  if (unmatched.length) console.log(`미매칭: ${unmatched.join(', ')} → MANUAL_MAP 에 추가 후 재실행`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
