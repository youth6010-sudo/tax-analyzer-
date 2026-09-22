import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries } from '@/db/schema';
import {
  isArrearsBalanceLocked,
  isArrearsLetterProtected,
  isArrearsSkipClientDetail,
  isArrearsLetterContentFrozen,
} from '@/lib/arrearsBalanceLock';
import { classifyArrearsLetterComplexity } from '@/lib/arrearsLetterComplexity';
import { isMonthBookkeepingChargeLine } from '@/lib/arrearsLetterComplexity';
import { syncArrearsManagersFromLinkedClients } from '@/lib/intakeManagerSync';
import {
  ARREARS_FROZEN_LETTER_CUTOFF,
  isAfterCutoff,
  normalizeDotDate,
  readArrearsImportConfig,
  toIsoDate,
  writeArrearsImportConfig,
} from '@/lib/arrearsImportConfig';
import {
  clientDetailTxToLineInput,
  lineDedupKey,
  parseArrearsClientDetailEndings,
  parseArrearsClientDetailWorkbook,
  type ParsedClientDetailTx,
} from '@/lib/arrearsClientDetailParse';
import { writeArrearsDetailEndings } from '@/lib/arrearsDetailEndings';
import {
  parseArrearsStatusWorkbook,
  type ParsedStatusRow,
} from '@/lib/arrearsStatusParse';
import { isInactiveArrearsCode } from '@/lib/arrearsInactiveSeed';
import { isIndieManagerName } from '@/lib/arrearsImportFilenames';
import { listLetterLines, replaceLetterLines } from '@/lib/arrearsLetterDb';
import type { ArrearsLetterLineInput } from '@/app/types/arrears';
import { letterBalanceFromLines } from '@/app/types/arrears';
import { letterOpenForStatusMatch } from '@/lib/arrearsLetterOpen';

export type StatusImportPreview = {
  preview: true;
  asOfDate: string;
  rowCount: number;
  totalBalance: number;
  sample: ParsedStatusRow[];
};

export type StatusImportResult = {
  preview: false;
  asOfDate: string;
  updated: number;
  inserted: number;
  totalBalance: number;
  categoryUpdated: number;
  overageStripped: number;
};

export type ClientDetailImportPreview = {
  preview: true;
  cutoffDate: string;
  companyCount: number;
  txCount: number;
  skippedIndieHint: string;
  sample: Array<{
    externalCode: string;
    companyName: string;
    eventDate: string;
    description: string;
    debit: number;
    credit: number;
  }>;
};

export type ClientDetailImportResult = {
  preview: false;
  cutoffDate: string;
  applied: number;
  skippedInactive: number;
  skippedIndie: number;
  skippedNoEntry: number;
  linesAdded: number;
  overageStripped: number;
};

export async function previewStatusImport(
  buffer: Buffer,
  asOfDateOverride?: string,
): Promise<StatusImportPreview> {
  const parsed = parseArrearsStatusWorkbook(buffer);
  const asOfDate = normalizeDotDate(asOfDateOverride) || parsed.asOfDate;
  const totalBalance = parsed.rows.reduce((s, r) => s + r.balance, 0);
  return {
    preview: true,
    asOfDate,
    rowCount: parsed.rows.length,
    totalBalance,
    sample: parsed.rows.filter(r => r.balance !== 0).slice(0, 12),
  };
}

export async function applyStatusImport(
  buffer: Buffer,
  actorName: string,
  asOfDateOverride?: string,
): Promise<StatusImportResult> {
  const parsed = parseArrearsStatusWorkbook(buffer);
  const asOfDate = normalizeDotDate(asOfDateOverride) || parsed.asOfDate;
  const asOfIso = toIsoDate(asOfDate);
  const db = getDb();
  let updated = 0;
  let inserted = 0;
  let categoryUpdated = 0;

  for (const row of parsed.rows) {
    // 잔액은 현황표 그대로 (하나비·오프라인 포함). 공문과 다르면 불일치 표시.
    const balance = row.balance;

    const [prev] = await db
      .select({
        id: arrearsEntries.id,
        clientId: arrearsEntries.clientId,
        mgmtCategory: arrearsEntries.mgmtCategory,
        churnMgmtStatus: arrearsEntries.churnMgmtStatus,
        managerName: arrearsEntries.managerName,
        cmsNote: arrearsEntries.cmsNote,
        memo: arrearsEntries.memo,
      })
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, row.externalCode))
      .limit(1);

    if (prev) {
      const patch: Partial<typeof arrearsEntries.$inferInsert> = {
        companyName: row.companyName,
        balance,
        carryIn: row.carryIn,
        debit: row.debit,
        credit: row.credit,
        asOfDate: asOfIso,
        source: 'status',
        updatedBy: actorName,
        updatedAt: new Date(),
      };
      // 수임처 연결분 담당은 수임처 담당이 우선 — 현황표 코드로 덮지 않음
      if (row.managerName && !prev.clientId) patch.managerName = row.managerName;
      if (row.mgmtCategory && row.mgmtCategory !== (prev.mgmtCategory || '')) {
        patch.mgmtCategory = row.mgmtCategory;
        categoryUpdated += 1;
      }
      if (row.churnMgmtStatus && row.churnMgmtStatus !== (prev.churnMgmtStatus || '')) {
        patch.churnMgmtStatus = row.churnMgmtStatus;
      }
      if (row.cmsNote) patch.cmsNote = row.cmsNote;
      if (row.memo) patch.memo = row.memo;

      await db
        .update(arrearsEntries)
        .set(patch)
        .where(eq(arrearsEntries.externalCode, row.externalCode));
      updated += 1;
    } else {
      await db.insert(arrearsEntries).values({
        externalCode: row.externalCode,
        companyName: row.companyName,
        balance,
        carryIn: row.carryIn,
        debit: row.debit,
        credit: row.credit,
        managerName: row.managerName,
        mgmtCategory: row.mgmtCategory,
        churnMgmtStatus: row.churnMgmtStatus,
        cmsNote: row.cmsNote,
        memo: row.memo,
        asOfDate: asOfIso,
        source: 'status',
        updatedBy: actorName,
      });
      inserted += 1;
      if (row.mgmtCategory) categoryUpdated += 1;
    }
  }

  await writeArrearsImportConfig({ statusAsOfDate: asOfDate });

  // 기준일: 현황표에 없는 업체(인디 등)도 동일 기준일로
  await db
    .update(arrearsEntries)
    .set({ asOfDate: asOfIso, updatedBy: actorName, updatedAt: new Date() });

  // 연결 수임처 담당으로 미수 담당 재맞춤 (현황표 담당코드 덮어쓰기 방지 후 보정)
  await syncArrearsManagersFromLinkedClients();

  const totalBalance = parsed.rows.reduce((s, r) => s + r.balance, 0);
  const overageStripped = await stripOverageUnpaidMonthLines(actorName);

  return {
    preview: false,
    asOfDate,
    updated,
    inserted,
    totalBalance,
    categoryUpdated,
    overageStripped,
  };
}

function groupTxByCode(txs: ParsedClientDetailTx[]): Map<string, ParsedClientDetailTx[]> {
  const m = new Map<string, ParsedClientDetailTx[]>();
  for (const tx of txs) {
    const arr = m.get(tx.externalCode) ?? [];
    arr.push(tx);
    m.set(tx.externalCode, arr);
  }
  return m;
}

export async function previewClientDetailImport(
  buffer: Buffer,
  _cutoffOverride?: string,
): Promise<ClientDetailImportPreview> {
  const cutoffDate = ARREARS_FROZEN_LETTER_CUTOFF;
  const txs = parseArrearsClientDetailWorkbook(buffer).filter(t =>
    isAfterCutoff(t.eventDate, cutoffDate),
  );
  const byCode = groupTxByCode(txs);
  return {
    preview: true,
    cutoffDate,
    companyCount: byCode.size,
    txCount: txs.length,
    skippedIndieHint:
      '인디 담당은 이 파일에 없으며, 잔액은 현황표·상세는 기존 공문을 사용합니다.',
    sample: txs.slice(0, 15).map(t => ({
      externalCode: t.externalCode,
      companyName: t.companyName,
      eventDate: t.eventDate,
      description: t.ledgerDescription,
      debit: t.debit,
      credit: t.credit,
    })),
  };
}

/** 공문(letter) 줄은 유지, 원장 플러그(전기이월 등) 제거 후 cutoff 이후 상세만 추가.
 * 수정모드 직접입력(manual)은 파일 재반영해도 유지. */
export async function applyClientDetailImport(
  buffer: Buffer,
  actorName: string,
  _cutoffOverride?: string,
): Promise<ClientDetailImportResult> {
  const cutoffDate = ARREARS_FROZEN_LETTER_CUTOFF;
  await writeArrearsImportConfig({ letterCutoffDate: cutoffDate });

  // 거래처별 말잔 저장 — 현황표와 같으면 목록 「불일치」제외
  const endings = parseArrearsClientDetailEndings(buffer);
  await writeArrearsDetailEndings(endings);

  const txs = parseArrearsClientDetailWorkbook(buffer).filter(t =>
    isAfterCutoff(t.eventDate, cutoffDate),
  );
  const byCode = groupTxByCode(txs);
  // cutoff 이후 거래가 없어도 시트에 있는 업체는 방문 → 임의 추가된 7·8월 공문 줄 제거
  for (const code of Object.keys(endings)) {
    if (!byCode.has(code)) byCode.set(code, []);
  }
  const db = getDb();

  let applied = 0;
  let skippedInactive = 0;
  let skippedIndie = 0;
  let skippedNoEntry = 0;
  let linesAdded = 0;

  for (const [code, codeTxs] of byCode) {
    if (
      isInactiveArrearsCode(code) ||
      isArrearsLetterProtected(code) ||
      isArrearsSkipClientDetail(code)
    ) {
      skippedInactive += 1;
      continue;
    }

    const [entry] = await db
      .select()
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, code))
      .limit(1);
    if (!entry) {
      skippedNoEntry += 1;
      continue;
    }

    // 인디: 잔액은 현황표·상세는 기존 공문 — 거래처별 현황 반영 스킵
    if (isIndieManagerName(entry.managerName)) {
      skippedIndie += 1;
      continue;
    }

    const existing = await listLetterLines(entry.id);
    const complexity = classifyArrearsLetterComplexity(existing, entry.balance);

    // 기장료만(simple_bk): 9월~ 거래가 있으면 기존 월기장·회수를 버리고 파일로 롤링 재구성
    // 복잡미수: 8월까지 고정, 9월~만 추가/교체
    const keptFromExisting = existing.filter(l => {
      if (/현황맞춤|말잔맞춤/.test(String(l.description || '').replace(/\s+/g, ''))) {
        return false;
      }
      if (l.source === 'manual') return true;
      if (complexity === 'simple_bk') {
        // 이번 업로드 mid에 9월~ 거래가 있을 때만 롤링(기존 월 줄 제거)
        if (codeTxs.length > 0) return false;
        return true;
      }
      // 9월~ 월별 기장만 제거하고, 8월까지(letter·ledger 포함)는 절대 지우지 않음
      if (isPostCutoffLetterMonth(l.description, cutoffDate)) return false;
      return true;
    });
    const removedCount = existing.length - keptFromExisting.length;
    const letterDescs = keptFromExisting.map(l => l.description);

    const base: ArrearsLetterLineInput[] = keptFromExisting.map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate,
      source: l.source === 'manual' ? 'manual' : 'letter',
    }));

    const targetBal = Math.round(entry.balance);
    const endingBal =
      endings[code] != null ? Math.round(endings[code]!) : null;
    const endingMatchesStatus = endingBal != null && endingBal === targetBal;
    const openBefore = letterBalanceFromLines(
      base.map(l => ({ amount: l.amount, paidAmount: Math.round(l.paidAmount || 0) })),
    );

    // 현황표=거래처별 말잔이고, cutoff 이전 공문합도 이미 같으면
    // 9월 입금 등을 또 넣으면 이중반영되어 어긋남 → 추가 생략
    // 단, 기장 미납이 남아 있으면(훈테크·도리형) 매출·입금 쌍을 생략하지 않음
    // 기장료만 롤링(simple_bk + 신규 tx)은 생략하지 않음
    const hasUnpaidBk = hasUnpaidMonthBookkeepingOnLetter(keptFromExisting);
    if (
      complexity !== 'simple_bk' &&
      endingMatchesStatus &&
      openBefore === targetBal &&
      !hasUnpaidBk
    ) {
      if (removedCount > 0) {
        await replaceLetterLines(entry.id, actorName, base, { syncBalance: false });
        applied += 1;
      }
      continue;
    }

    const existingKeys = new Set(base.map(lineDedupKey));
    const additions: ArrearsLetterLineInput[] = [];

    // 월기장 청구+동일금액 입금 세트는 즉시회수로 보고 생략.
    // 단, 공문에 기장료 미납이 한 달이라도 있으면 이후 매출·회수는 모두 남김 (훈테크형).
    const txs = hasUnpaidBk
      ? codeTxs
      : skipImmediateMonthlyRecoveryTxs(codeTxs);

    for (const tx of txs) {
      const line = clientDetailTxToLineInput(tx, letterDescs);
      if (!line) continue;
      let key = lineDedupKey(line);
      // 부가세신고 동액 여러 건이 같은 적요로 뭉개지지 않게 건수 유지
      if (existingKeys.has(key) && /부가세/.test(line.description)) {
        let n = 2;
        let desc = `${line.description}(${n})`;
        key = lineDedupKey({ ...line, description: desc });
        while (existingKeys.has(key)) {
          n += 1;
          desc = `${line.description}(${n})`;
          key = lineDedupKey({ ...line, description: desc });
        }
        line.description = desc;
      } else if (existingKeys.has(key)) {
        continue;
      }
      existingKeys.add(key);
      additions.push(line);
      letterDescs.push(line.description);
    }

    if (!additions.length && removedCount === 0) continue;

    await replaceLetterLines(entry.id, actorName, [...base, ...additions], {
      syncBalance: false,
    });
    applied += 1;
    linesAdded += additions.length;
  }

  const overageStripped = await stripOverageUnpaidMonthLines(actorName);

  return {
    preview: false,
    cutoffDate,
    applied,
    skippedInactive,
    skippedIndie,
    skippedNoEntry,
    linesAdded,
    overageStripped,
  };
}

export async function getImportConfigForApi() {
  return await readArrearsImportConfig();
}

export function summarizeBalanceAlignment(
  balance: number,
  lines: Array<{ amount: number; paidAmount: number; description?: string; paidDate?: string }>,
  externalCode?: string,
): { linesOpen: number; diff: number } {
  const linesOpen = externalCode
    ? letterOpenForStatusMatch(externalCode, lines)
    : letterBalanceFromLines(lines);
  return { linesOpen, diff: Math.round(balance) - linesOpen };
}

export { isArrearsBalanceLocked };

/** 공문 letter 줄 — 월 기장료 청구(조정·성실·부가세·기타 제외) */
export { isMonthBookkeepingChargeLine } from '@/lib/arrearsLetterComplexity';

/** 공문에 기장료 미납이 한 달이라도 있는지 */
export function hasUnpaidMonthBookkeepingOnLetter(
  letterLines: Array<{ description: string; amount: number; paidAmount?: number }>,
): boolean {
  return letterLines.some(
    l =>
      isMonthBookkeepingChargeLine(l.description, l.amount) &&
      Math.round(l.amount) - Math.round(l.paidAmount || 0) > 0,
  );
}

function isUnpaidMonthLedgerLine(l: {
  source?: string;
  description?: string;
  amount: number;
  paidAmount?: number;
}): boolean {
  if (l.source !== 'ledger') return false;
  if (Math.round(l.amount) <= 0) return false;
  if (Math.round(l.paidAmount || 0) !== 0) return false;
  return /\d{1,2}월/.test(String(l.description || '').replace(/\s+/g, ''));
}

/**
 * import 후에도 공문합 > 현황이면, cutoff **이후**에 잘못 남은
 * 월기장(ledger) 줄만 끝에서부터 제거해 현황과 맞춤.
 * 8월 이전(동결 cutoff 포함) 내역은 절대 지우지 않음.
 * 단, 기장료만(simple_bk)은 월 롤링을 위해 cutoff 이전 미납 월기장도 과다분이면 제거 가능.
 */
export async function stripOverageUnpaidMonthLines(actorName: string): Promise<number> {
  const db = getDb();
  const entries = await db.select().from(arrearsEntries);
  const cutoffDate = ARREARS_FROZEN_LETTER_CUTOFF;
  let strippedEntries = 0;

  for (const e of entries) {
    if (
      isArrearsLetterProtected(e.externalCode) ||
      isArrearsSkipClientDetail(e.externalCode) ||
      isArrearsLetterContentFrozen(e.externalCode)
    ) {
      continue;
    }

    const lines = await listLetterLines(e.id);
    const complexity = classifyArrearsLetterComplexity(lines, e.balance);
    const open = letterBalanceFromLines(lines);
    const bal = Math.round(e.balance);
    let over = open - bal;
    if (over <= 0) continue;

    const next: Array<{
      description: string;
      amount: number;
      paidAmount: number;
      paidDate: string;
      source: ArrearsLetterLineInput['source'];
    }> = lines.map(l => ({
      description: l.description,
      amount: l.amount,
      paidAmount: Math.round(l.paidAmount || 0),
      paidDate: l.paidDate || '',
      source: l.source,
    }));

    let removed = 0;
    for (let i = next.length - 1; i >= 0 && over > 0; i--) {
      const l = next[i]!;
      if (!isUnpaidMonthLedgerLine(l)) continue;
      // 동결일 이전·당월(8월까지) 보호 — 기장료만(simple_bk)은 롤링 허용
      if (
        complexity !== 'simple_bk' &&
        !isPostCutoffLetterMonth(l.description, cutoffDate)
      ) {
        continue;
      }
      const amt = Math.round(l.amount);
      if (amt > over) continue;
      next.splice(i, 1);
      over -= amt;
      removed += 1;
    }
    if (!removed) continue;

    const after = letterBalanceFromLines(next);
    if (after !== bal && Math.abs(after - bal) >= Math.abs(open - bal)) continue;

    await replaceLetterLines(e.id, actorName || 'strip-overage-unpaid', next, {
      syncBalance: false,
    });
    strippedEntries += 1;
  }

  return strippedEntries;
}

/**
 * 월기장회수: 같은 달(또는 직후 동일금액) 매출·입금이 세트면 공문에 넣지 않음.
 * cutoff 이후 거래처별 상세에만 적용.
 * 호출측: 공문에 기장료 미납이 한 달이라도 있으면 쓰지 말 것.
 */
export function skipImmediateMonthlyRecoveryTxs<
  T extends { debit: number; credit: number; ledgerDescription: string; eventDate: string },
>(txs: T[]): T[] {
  const drop = new Set<number>();
  const monthKey = (eventDate: string) => {
    const iso = toIsoDate(eventDate) || String(eventDate || '');
    return iso.slice(0, 7);
  };
  const isMonthDebit = (t: T) =>
    t.debit > 0 && /\d{1,2}\s*월|기장/.test(String(t.ledgerDescription || ''));

  for (let i = 0; i < txs.length; i++) {
    if (drop.has(i)) continue;
    const t = txs[i]!;
    if (!isMonthDebit(t)) continue;
    const amt = Math.round(t.debit);
    const mk = monthKey(t.eventDate);

    let pair = -1;
    for (let j = 0; j < txs.length; j++) {
      if (j === i || drop.has(j)) continue;
      const u = txs[j]!;
      if (Math.round(u.credit) !== amt) continue;
      if (monthKey(u.eventDate) === mk) {
        pair = j;
        break;
      }
    }
    if (pair < 0) {
      for (let j = i + 1; j < txs.length; j++) {
        if (drop.has(j)) continue;
        const u = txs[j]!;
        if (Math.round(u.credit) === amt) {
          pair = j;
          break;
        }
        if (u.debit > 0) break;
      }
    }
    if (pair >= 0) {
      drop.add(i);
      drop.add(pair);
    }
  }
  return txs.filter((_, i) => !drop.has(i));
}

/** 공문 letter 줄 중 cutoff 달보다 이후 월별 기장료 — 거래처별 상세로 대체.
 * 동결일(예: 08.31)이 속한 달(8월)까지는 유지, 다음 달(9월~)만 제거. */
export function isPostCutoffLetterMonth(desc: string, cutoffDot: string): boolean {
  const d = String(desc || '').replace(/\s+/g, '');
  const m = d.match(/(20\d{2}|\d{2})년(?:기타수수료)?(\d{1,2})월/);
  if (!m) return false;
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  const mo = Number(m[2]);
  const cut = toIsoDate(cutoffDot);
  const cy = Number(cut.slice(0, 4));
  const cm = Number(cut.slice(5, 7));
  if (y > cy) return true;
  if (y === cy && mo > cm) return true;
  return false;
}
