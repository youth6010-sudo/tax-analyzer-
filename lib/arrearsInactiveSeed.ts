import { asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries, arrearsLetterLines } from '@/db/schema';
import inactiveSeed from '@/data/arrears-inactive-seed.json';
import { getArrearsManualBalance, isArrearsBalanceLocked } from '@/lib/arrearsBalanceLock';

type SeedLine = {
  description: string;
  amount: number;
  paidAmount: number;
  paidDate: string;
};

type SeedEntry = {
  externalCode: string;
  companyName: string;
  balance: number;
  letterDate: string;
  lines: SeedLine[];
};

const SEED_ENTRIES = inactiveSeed.entries as SeedEntry[];
const SEED_CODES = SEED_ENTRIES.map(e => e.externalCode);

let ensureRunning: Promise<void> | null = null;
let ensuredAt = 0;
const ENSURE_COOLDOWN_MS = 30_000;

function seedLinesFingerprint(lines: SeedLine[]): string {
  return lines
    .map(l => `${l.description}|${l.amount}|${l.paidAmount}|${l.paidDate}`)
    .join('\n');
}

function dbLinesFingerprint(
  lines: Array<{
    description: string;
    amount: number;
    paidAmount: number;
    paidDate: string | null;
    source: string | null;
  }>,
): string {
  return lines
    .map(l => `${l.description}|${l.amount}|${l.paidAmount}|${l.paidDate || ''}`)
    .join('\n');
}

async function entryNeedsFix(
  entryId: string,
  seed: SeedEntry,
  balance: number,
): Promise<boolean> {
  const locked = getArrearsManualBalance(seed.externalCode);
  if (locked === undefined) return false;
  if (Math.round(balance) !== locked) return true;

  const db = getDb();
  const lines = await db
    .select({
      description: arrearsLetterLines.description,
      amount: arrearsLetterLines.amount,
      paidAmount: arrearsLetterLines.paidAmount,
      paidDate: arrearsLetterLines.paidDate,
      source: arrearsLetterLines.source,
    })
    .from(arrearsLetterLines)
    .where(eq(arrearsLetterLines.arrearsEntryId, entryId))
    .orderBy(asc(arrearsLetterLines.sortOrder));

  if (lines.length !== seed.lines.length) return true;
  if (lines.some(l => l.source !== 'letter')) return true;
  return dbLinesFingerprint(lines) !== seedLinesFingerprint(seed.lines);
}

async function applySeedEntry(seed: SeedEntry, entryId: string): Promise<void> {
  const db = getDb();
  const locked = getArrearsManualBalance(seed.externalCode)!;
  const asOf = seed.letterDate.replace(/\./g, '-');

  await db.delete(arrearsLetterLines).where(eq(arrearsLetterLines.arrearsEntryId, entryId));
  for (let i = 0; i < seed.lines.length; i++) {
    const l = seed.lines[i]!;
    await db.insert(arrearsLetterLines).values({
      arrearsEntryId: entryId,
      sortOrder: i,
      description: l.description,
      amount: l.amount,
      paidAmount: l.paidAmount,
      paidDate: l.paidDate,
      source: 'letter',
    });
  }

  await db
    .update(arrearsEntries)
    .set({
      balance: locked,
      carryIn: locked,
      debit: 0,
      credit: 0,
      letterDate: seed.letterDate,
      asOfDate: asOf,
      source: 'letter',
      updatedBy: 'inactive-arrears-seed',
      updatedAt: new Date(),
    })
    .where(eq(arrearsEntries.id, entryId));
}

async function runEnsure(): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({
      id: arrearsEntries.id,
      externalCode: arrearsEntries.externalCode,
      balance: arrearsEntries.balance,
    })
    .from(arrearsEntries)
    .where(inArray(arrearsEntries.externalCode, SEED_CODES));

  const byCode = new Map(rows.map(r => [r.externalCode, r]));

  for (const seed of SEED_ENTRIES) {
    const row = byCode.get(seed.externalCode);
    if (!row) continue;
    if (!(await entryNeedsFix(row.id, seed, row.balance))) continue;
    await applySeedEntry(seed, row.id);
  }
}

/** 거래 중단 업체 — 배포·로컬 DB 모두 시드(잔액+엑셀 공문)와 맞춤 */
export async function ensureInactiveArrearsEntries(): Promise<void> {
  const now = Date.now();
  if (now - ensuredAt < ENSURE_COOLDOWN_MS) return;
  if (ensureRunning) {
    await ensureRunning;
    return;
  }
  ensureRunning = (async () => {
    try {
      await runEnsure();
      ensuredAt = Date.now();
    } finally {
      ensureRunning = null;
    }
  })();
  await ensureRunning;
}

export function isInactiveArrearsCode(externalCode: string): boolean {
  return isArrearsBalanceLocked(externalCode);
}

export function inactiveArrearsSeedCodes(): string[] {
  return [...SEED_CODES];
}
