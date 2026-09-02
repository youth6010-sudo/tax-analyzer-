import { asc, eq, inArray, or } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries, arrearsLetterLines } from '@/db/schema';
import inactiveSeed from '@/data/arrears-inactive-seed.json';
import {
  ARREARS_LETTER_DUP_CODE_BY_CANONICAL,
  getArrearsManualBalance,
  isArrearsBalanceLocked,
} from '@/lib/arrearsBalanceLock';

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
      source: 'letter',
      updatedBy: 'inactive-arrears-seed',
      updatedAt: new Date(),
    })
    .where(eq(arrearsEntries.id, entryId));
}

async function removeDuplicateInactiveEntries(seed: SeedEntry, canonicalId: string): Promise<number> {
  const db = getDb();
  const letterDup = ARREARS_LETTER_DUP_CODE_BY_CANONICAL[seed.externalCode];
  const dupCodes = [seed.externalCode, letterDup].filter(Boolean) as string[];

  const candidates = await db
    .select({ id: arrearsEntries.id, externalCode: arrearsEntries.externalCode })
    .from(arrearsEntries)
    .where(
      or(
        eq(arrearsEntries.companyName, seed.companyName),
        inArray(arrearsEntries.externalCode, dupCodes),
      )!,
    );

  let removed = 0;
  for (const row of candidates) {
    if (row.id === canonicalId) continue;
    await db.delete(arrearsEntries).where(eq(arrearsEntries.id, row.id));
    removed += 1;
  }
  return removed;
}

async function resolveCanonicalEntry(seed: SeedEntry): Promise<string | null> {
  const db = getDb();
  const letterDup = ARREARS_LETTER_DUP_CODE_BY_CANONICAL[seed.externalCode];

  const [byCode] = await db
    .select({ id: arrearsEntries.id })
    .from(arrearsEntries)
    .where(eq(arrearsEntries.externalCode, seed.externalCode))
    .limit(1);
  if (byCode) return byCode.id;

  const byName = await db
    .select({ id: arrearsEntries.id, externalCode: arrearsEntries.externalCode })
    .from(arrearsEntries)
    .where(eq(arrearsEntries.companyName, seed.companyName));

  const coded = byName.filter(r => !r.externalCode.startsWith('letter:'));
  if (coded.length === 1) return coded[0]!.id;

  if (letterDup) {
    const [byLetter] = await db
      .select({ id: arrearsEntries.id })
      .from(arrearsEntries)
      .where(eq(arrearsEntries.externalCode, letterDup))
      .limit(1);
    if (byLetter) {
      await db
        .update(arrearsEntries)
        .set({
          externalCode: seed.externalCode,
          updatedBy: 'inactive-arrears-seed',
          updatedAt: new Date(),
        })
        .where(eq(arrearsEntries.id, byLetter.id));
      return byLetter.id;
    }
  }

  return byName[0]?.id ?? null;
}

async function runEnsure(): Promise<void> {
  const db = getDb();

  for (const seed of SEED_ENTRIES) {
    const canonicalId = await resolveCanonicalEntry(seed);
    if (!canonicalId) continue;

    await removeDuplicateInactiveEntries(seed, canonicalId);

    const [row] = await db
      .select({
        id: arrearsEntries.id,
        externalCode: arrearsEntries.externalCode,
        balance: arrearsEntries.balance,
      })
      .from(arrearsEntries)
      .where(eq(arrearsEntries.id, canonicalId))
      .limit(1);
    if (!row) continue;
    if (row.externalCode !== seed.externalCode) {
      await db
        .update(arrearsEntries)
        .set({
          externalCode: seed.externalCode,
          updatedBy: 'inactive-arrears-seed',
          updatedAt: new Date(),
        })
        .where(eq(arrearsEntries.id, canonicalId));
    }
    if (!(await entryNeedsFix(canonicalId, seed, row.balance))) continue;
    await applySeedEntry(seed, canonicalId);
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

export function isInactiveArrearsCompanyName(companyName: string): boolean {
  const name = companyName.trim();
  return SEED_ENTRIES.some(e => e.companyName === name);
}
