/**
 * TP 「휴가관리」잔고 + 「휴가 사용 내역」→ leave_balances / leave_requests
 *
 * Usage:
 *   node scripts/import-leave-xlsx.mjs [--dry] [dir]
 * 기본 dir: z:\14. 업무요청자료
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import * as XLSX from 'xlsx';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const DRY = process.argv.includes('--dry');
const YEAR = 2026;
const TP_REVIEWER = 'TP가져오기';
const TP_BODY = '[TP사용내역]';

/** 실명 → 닉네임 (users.name) */
const REAL_TO_NICK = {
  구진혜: '블루',
  홍다예: '다야',
  박혜림: '리아',
  안혜빈: '윈터',
  김평진: '페리',
  신상협: '인디',
  이희만: '찰리',
};

const HIDDEN_NICKS = new Set(['인디']);

function walkXlsx(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walkXlsx(full));
    else if (/\.xlsx$/i.test(name)) out.push(full);
  }
  return out;
}

function sheetRows(filePath) {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
}

function cellStr(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

function cellNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 10000) / 10000;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0;
}

function cellBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'y' || s === 'yes' || s === '예';
}

function toNick(realName) {
  const raw = cellStr(realName);
  return REAL_TO_NICK[raw] || raw;
}

function parsePeriod(raw) {
  const s = cellStr(raw).replace(/\s/g, '');
  const m = /^(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})$/.exec(s);
  if (!m) return null;
  return { start: m[1], end: m[2] };
}

function findLatest(files, pred) {
  const matched = files.filter(pred);
  matched.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return matched[0] || null;
}

const cliArgs = process.argv.slice(2).filter(a => a !== '--dry');
const searchRoot =
  cliArgs.find(a => {
    try {
      return fs.existsSync(a) && fs.statSync(a).isDirectory();
    } catch {
      return false;
    }
  }) || path.join('z:\\', '14. 업무요청자료');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const allXlsx = walkXlsx(searchRoot);
const balanceFile = findLatest(allXlsx, f => /휴가관리-\d+\.xlsx$/i.test(path.basename(f)));
const usageFiles = allXlsx
  .filter(f => /휴가\s*사용\s*내역-\d+\.xlsx$/i.test(path.basename(f)))
  .sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'ko'));

console.log('검색 경로:', searchRoot);
console.log('잔고 파일:', balanceFile ? path.basename(balanceFile) : '(없음)');
console.log('사용 내역:', usageFiles.length, '개');
if (!balanceFile && usageFiles.length === 0) {
  console.error('엑셀을 찾지 못했습니다.');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

try {
  // ensure notification table exists (idempotent)
  await sql.unsafe(fs.readFileSync(path.join(root, 'drizzle', '0015_leave.sql'), 'utf8'));

  const userRows = await sql`select name from users`;
  const dbNames = userRows.map(r => String(r.name || '').trim()).filter(Boolean);

  function resolveMember(nickOrReal) {
    const nick = toNick(nickOrReal);
    const hit = dbNames.find(n => n === nick || n === cellStr(nickOrReal));
    return hit || nick;
  }

  const balanceRows = [];
  if (balanceFile) {
    const rows = sheetRows(balanceFile);
    const header = (rows[0] || []).map(c => cellStr(c).replace(/\s/g, ''));
    const col = name => header.findIndex(h => h.includes(name));
    const iName = col('이름');
    const iHire = col('입사일');
    const iResign = col('퇴사일');
    const iBasis = col('입사일기준');
    const iAccrued = col('발생');
    const iCarry = col('이월');
    const iInc = col('증가');
    const iDec = col('감소');
    if (iName < 0) throw new Error('잔고 시트에 이름 열 없음');
    for (let i = 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const rawName = cellStr(r[iName]);
      if (!rawName) continue;
      const nick = toNick(rawName);
      if (HIDDEN_NICKS.has(nick) || nick === '신상협') continue;
      const memberName = resolveMember(rawName);
      balanceRows.push({
        memberName,
        hireDate: cellStr(r[iHire]),
        resignDate: iResign >= 0 ? cellStr(r[iResign]) : '',
        useHireDateBasis: iBasis >= 0 ? cellBool(r[iBasis]) : false,
        accrued: iAccrued >= 0 ? cellNum(r[iAccrued]) : 0,
        carryOver: iCarry >= 0 ? cellNum(r[iCarry]) : 0,
        increase: iInc >= 0 ? cellNum(r[iInc]) : 0,
        decrease: iDec >= 0 ? cellNum(r[iDec]) : 0,
      });
    }
  }

  const usageRows = [];
  const seenUsage = new Set();
  for (const file of usageFiles) {
    const rows = sheetRows(file);
    for (let i = 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const rawName = cellStr(r[1]);
      const period = parsePeriod(r[2]);
      const days = cellNum(r[3]);
      if (!rawName || !period || days <= 0) continue;
      const nick = toNick(rawName);
      if (HIDDEN_NICKS.has(nick)) continue;
      const memberName = resolveMember(rawName);
      const key = `${memberName}|${period.start}|${period.end}|${days}`;
      if (seenUsage.has(key)) continue;
      seenUsage.add(key);
      const leaveKind = days < 1 ? 'half' : 'full';
      usageRows.push({
        memberName,
        startDate: period.start,
        endDate: period.end,
        days,
        leaveKind,
        halfSlot: leaveKind === 'half' ? 'am' : '',
        title: leaveKind === 'half' ? '반차 (TP)' : '연차 (TP)',
      });
    }
  }

  console.log(`잔고 upsert: ${balanceRows.length}명`);
  console.log(`사용 내역: ${usageRows.length}건`);
  for (const u of usageRows) {
    console.log(`  ${u.memberName} ${u.startDate}~${u.endDate} ${u.days}일`);
  }

  if (DRY) {
    console.log('(dry-run) DB 변경 없음');
    process.exit(0);
  }

  for (const b of balanceRows) {
    await sql`
      insert into leave_balances (
        member_name, year, hire_date, resign_date, use_hire_date_basis,
        accrued, carry_over, increase, decrease, updated_by, updated_at
      ) values (
        ${b.memberName}, ${YEAR}, ${b.hireDate}, ${b.resignDate}, ${b.useHireDateBasis},
        ${String(b.accrued)}, ${String(b.carryOver)}, ${String(b.increase)}, ${String(b.decrease)},
        ${TP_REVIEWER}, now()
      )
      on conflict (member_name, year) do update set
        hire_date = excluded.hire_date,
        resign_date = excluded.resign_date,
        use_hire_date_basis = excluded.use_hire_date_basis,
        accrued = excluded.accrued,
        carry_over = excluded.carry_over,
        increase = excluded.increase,
        decrease = excluded.decrease,
        updated_by = excluded.updated_by,
        updated_at = now()
    `;
  }

  // 이전 TP 가져오기 삭제 후 재삽입 (중복 방지)
  const deleted = await sql`
    delete from leave_requests
    where reviewed_by = ${TP_REVIEWER}
       or body like ${`${TP_BODY}%`}
    returning id
  `;
  console.log(`기존 TP 신청 삭제: ${deleted.length}건`);

  for (const u of usageRows) {
    await sql`
      insert into leave_requests (
        applicant_name, title, body, leave_kind, half_slot,
        start_date, end_date, days, status, review_note, reviewed_by, reviewed_at
      ) values (
        ${u.memberName}, ${u.title}, ${TP_BODY}, ${u.leaveKind}, ${u.halfSlot},
        ${u.startDate}, ${u.endDate}, ${String(u.days)}, 'approved',
        'TP 휴가 사용 내역 반영', ${TP_REVIEWER}, now()
      )
    `;
  }

  console.log(`승인 휴가 insert: ${usageRows.length}건`);
  console.log('완료');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
