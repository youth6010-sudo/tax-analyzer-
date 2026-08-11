/**
 * 미수 재시작: wipe → 공문 vs 원장파일 대조 → 링크 저장 → 원장 반영
 */
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  arrearsEntries,
  arrearsLetterLedgerLinks,
  arrearsLetterLines,
} from '@/db/schema';
import type { LedgerArrearsRow } from '@/lib/arrearsLedgerParse';
import { upsertLedgerImport } from '@/lib/arrearsDb';
import {
  listLetterLines,
  replaceLetterLines,
  syncLetterDiffWithLedger,
} from '@/lib/arrearsLetterDb';
import {
  companyNameSimilarity,
  softCompanyKey,
} from '@/lib/arrearsMatchReview';

export type LedgerPick = {
  externalCode: string;
  companyName: string;
  balance: number;
  businessNo: string;
};

export type RestartLetterRow = {
  entryId: string;
  companyName: string;
  externalCode: string;
  managerName: string;
  letterSoftKey: string;
  letterBalance: number;
  lineCount: number;
  letterDate: string;
  letterFilename: string;
  match: 'auto' | 'manual' | 'needs_link' | 'skip';
  linkedLedgerCode: string;
  linkedLedgerName: string;
  balanceMismatch: boolean;
  suggestions: Array<{
    externalCode: string;
    companyName: string;
    balance: number;
    score: number;
  }>;
};

export async function wipeAllArrears(): Promise<{ entries: number; lines: number; links: number }> {
  const db = getDb();
  const lines = await db.delete(arrearsLetterLines).returning({ id: arrearsLetterLines.id });
  const links = await db
    .delete(arrearsLetterLedgerLinks)
    .returning({ id: arrearsLetterLedgerLinks.id });
  const entries = await db.delete(arrearsEntries).returning({ id: arrearsEntries.id });
  return { entries: entries.length, lines: lines.length, links: links.length };
}

export async function buildRestartMatchReview(
  ledgerRows: LedgerArrearsRow[],
  opts?: { minScore?: number; seedAutoLinks?: boolean; actorName?: string },
): Promise<{
  autoMatched: RestartLetterRow[];
  needsLink: RestartLetterRow[];
  skipped: RestartLetterRow[];
  ledgerOnly: LedgerPick[];
  pickEntries: LedgerPick[];
  letterCount: number;
  ledgerCount: number;
}> {
  const minScore = opts?.minScore ?? 0.28;
  const db = getDb();

  const entries = await db.select().from(arrearsEntries);
  const letterEntries = entries.filter(
    e => e.source === 'letter' || e.externalCode.startsWith('letter:'),
  );

  const allLines = await db
    .select()
    .from(arrearsLetterLines)
    .orderBy(asc(arrearsLetterLines.sortOrder));
  const linesByEntry = new Map<string, typeof allLines>();
  for (const l of allLines) {
    const list = linesByEntry.get(l.arrearsEntryId) ?? [];
    list.push(l);
    linesByEntry.set(l.arrearsEntryId, list);
  }

  const existingLinks = await db.select().from(arrearsLetterLedgerLinks);
  const linkBySoft = new Map(existingLinks.map(l => [l.letterSoftKey, l]));

  // 원장: softKey → unique row only
  const bySoft = new Map<string, LedgerArrearsRow[]>();
  for (const r of ledgerRows) {
    const k = softCompanyKey(r.companyName);
    if (!k) continue;
    const list = bySoft.get(k) ?? [];
    list.push(r);
    bySoft.set(k, list);
  }

  const pickEntries: LedgerPick[] = ledgerRows
    .map(r => ({
      externalCode: r.externalCode,
      companyName: r.companyName,
      balance: r.balance,
      businessNo: r.businessNo || '',
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));

  const letterSoftKeys = new Set<string>();
  const autoMatched: RestartLetterRow[] = [];
  const needsLink: RestartLetterRow[] = [];
  const skipped: RestartLetterRow[] = [];

  const actor = opts?.actorName || 'system';
  const now = new Date();

  for (const e of letterEntries) {
    const soft = softCompanyKey(e.companyName);
    letterSoftKeys.add(soft);
    const lines = linesByEntry.get(e.id) ?? [];
    const letterBalance = lines.reduce((s, l) => s + l.amount - l.paidAmount, 0);
    const hits = soft ? bySoft.get(soft) ?? [] : [];
    const uniqueHit = hits.length === 1 ? hits[0]! : null;
    const link = soft ? linkBySoft.get(soft) : undefined;

    const suggestions = ledgerRows
      .map(r => ({
        externalCode: r.externalCode,
        companyName: r.companyName,
        balance: r.balance,
        score: companyNameSimilarity(e.companyName, r.companyName),
      }))
      .filter(c => c.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    let match: RestartLetterRow['match'] = 'needs_link';
    let linkedLedgerCode = '';
    let linkedLedgerName = '';

    if (link?.status === 'skip') {
      match = 'skip';
    } else if (link?.status === 'manual' && link.ledgerExternalCode) {
      match = 'manual';
      linkedLedgerCode = link.ledgerExternalCode;
      linkedLedgerName = link.ledgerCompanyName;
    } else if (uniqueHit) {
      match = 'auto';
      linkedLedgerCode = uniqueHit.externalCode;
      linkedLedgerName = uniqueHit.companyName;
      if (opts?.seedAutoLinks !== false && soft) {
        const prev = linkBySoft.get(soft);
        if (!prev || prev.status === 'auto') {
          await db
            .insert(arrearsLetterLedgerLinks)
            .values({
              letterSoftKey: soft,
              letterCompanyName: e.companyName,
              letterFilename: '',
              managerName: e.managerName || '',
              ledgerExternalCode: uniqueHit.externalCode,
              ledgerCompanyName: uniqueHit.companyName,
              status: 'auto',
              updatedBy: actor,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: arrearsLetterLedgerLinks.letterSoftKey,
              set: {
                letterCompanyName: e.companyName,
                managerName: e.managerName || '',
                ledgerExternalCode: uniqueHit.externalCode,
                ledgerCompanyName: uniqueHit.companyName,
                status: 'auto',
                updatedBy: actor,
                updatedAt: now,
              },
            });
          linkBySoft.set(soft, {
            id: prev?.id || '',
            letterSoftKey: soft,
            letterCompanyName: e.companyName,
            letterFilename: '',
            managerName: e.managerName || '',
            ledgerExternalCode: uniqueHit.externalCode,
            ledgerCompanyName: uniqueHit.companyName,
            status: 'auto',
            updatedBy: actor,
            createdAt: prev?.createdAt || now,
            updatedAt: now,
          });
        }
      }
    } else if (link?.status === 'auto' && link.ledgerExternalCode) {
      match = 'auto';
      linkedLedgerCode = link.ledgerExternalCode;
      linkedLedgerName = link.ledgerCompanyName;
    }

    const linkedBal =
      linkedLedgerCode
        ? ledgerRows.find(r => r.externalCode === linkedLedgerCode)?.balance
        : uniqueHit?.balance;
    const balanceMismatch =
      linkedBal != null && Math.round(linkedBal) !== Math.round(letterBalance);

    const row: RestartLetterRow = {
      entryId: e.id,
      companyName: e.companyName,
      externalCode: e.externalCode,
      managerName: e.managerName,
      letterSoftKey: soft,
      letterBalance,
      lineCount: lines.length,
      letterDate: e.letterDate || '',
      letterFilename: '',
      match,
      linkedLedgerCode,
      linkedLedgerName,
      balanceMismatch,
      suggestions,
    };

    if (match === 'needs_link') needsLink.push(row);
    else if (match === 'skip') skipped.push(row);
    else autoMatched.push(row);
  }

  // autoMatched includes both auto and manual for "matched" tab — split better
  const manualRows = autoMatched.filter(r => r.match === 'manual');
  const pureAuto = autoMatched.filter(r => r.match === 'auto');

  needsLink.sort((a, b) => (b.suggestions[0]?.score ?? 0) - (a.suggestions[0]?.score ?? 0));
  pureAuto.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));
  manualRows.sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));

  const ledgerOnly: LedgerPick[] = pickEntries.filter(
    p => !letterSoftKeys.has(softCompanyKey(p.companyName)),
  );

  return {
    autoMatched: [...pureAuto, ...manualRows],
    needsLink,
    skipped,
    ledgerOnly,
    pickEntries,
    letterCount: letterEntries.length,
    ledgerCount: ledgerRows.length,
  };
}

export async function upsertLetterLedgerLink(opts: {
  letterSoftKey: string;
  letterCompanyName: string;
  letterFilename?: string;
  managerName?: string;
  ledgerExternalCode: string;
  ledgerCompanyName: string;
  status: 'manual' | 'skip' | 'auto';
  actorName: string;
}): Promise<void> {
  const db = getDb();
  const soft = softCompanyKey(opts.letterSoftKey || opts.letterCompanyName);
  if (!soft) throw new Error('공문 상호 키가 비어 있습니다.');
  const now = new Date();
  await db
    .insert(arrearsLetterLedgerLinks)
    .values({
      letterSoftKey: soft,
      letterCompanyName: opts.letterCompanyName,
      letterFilename: opts.letterFilename || '',
      managerName: opts.managerName || '',
      ledgerExternalCode: opts.status === 'skip' ? '' : opts.ledgerExternalCode,
      ledgerCompanyName: opts.status === 'skip' ? '' : opts.ledgerCompanyName,
      status: opts.status,
      updatedBy: opts.actorName,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: arrearsLetterLedgerLinks.letterSoftKey,
      set: {
        letterCompanyName: opts.letterCompanyName,
        letterFilename: opts.letterFilename || '',
        managerName: opts.managerName || '',
        ledgerExternalCode: opts.status === 'skip' ? '' : opts.ledgerExternalCode,
        ledgerCompanyName: opts.status === 'skip' ? '' : opts.ledgerCompanyName,
        status: opts.status,
        updatedBy: opts.actorName,
        updatedAt: now,
      },
    });
}

export async function applyLedgerWithLetterLinks(opts: {
  ledgerRows: LedgerArrearsRow[];
  asOfDate: string;
  actorName: string;
  /** true면 미연결 공문 행을 삭제하지 않고 남김 */
  keepUnmatchedLetters?: boolean;
}): Promise<{
  ledgerUpdated: number;
  ledgerInserted: number;
  attached: number;
  skipped: number;
  deletedOrphans: number;
  keptUnmatched: number;
  failed: number;
}> {
  const db = getDb();
  const actor = opts.actorName || 'ledger-apply';
  const keepUnmatched = opts.keepUnmatchedLetters === true;

  const ledgerResult = await upsertLedgerImport(opts.ledgerRows, opts.asOfDate, actor);

  const links = await db.select().from(arrearsLetterLedgerLinks);
  const linkBySoft = new Map(links.map(l => [l.letterSoftKey, l]));

  const softCounts = new Map<string, number>();
  for (const r of opts.ledgerRows) {
    const k = softCompanyKey(r.companyName);
    if (!k) continue;
    softCounts.set(k, (softCounts.get(k) || 0) + 1);
  }
  const bySoftLedger = new Map<string, LedgerArrearsRow>();
  for (const r of opts.ledgerRows) {
    const k = softCompanyKey(r.companyName);
    if (!k || softCounts.get(k) !== 1) continue;
    bySoftLedger.set(k, r);
  }

  const entries = await db.select().from(arrearsEntries);
  const byCode = new Map(entries.map(e => [e.externalCode, e]));
  const letterEntries = entries.filter(
    e => e.source === 'letter' || e.externalCode.startsWith('letter:'),
  );

  let attached = 0;
  let skipped = 0;
  let deletedOrphans = 0;
  let keptUnmatched = 0;
  let failed = 0;

  for (const letterEnt of letterEntries) {
    const soft = softCompanyKey(letterEnt.companyName);
    const link = linkBySoft.get(soft);
    let targetCode = '';
    if (link?.status === 'skip') {
      skipped += 1;
      await db.delete(arrearsEntries).where(eq(arrearsEntries.id, letterEnt.id));
      deletedOrphans += 1;
      continue;
    }
    if (link && (link.status === 'manual' || link.status === 'auto') && link.ledgerExternalCode) {
      targetCode = link.ledgerExternalCode;
    } else {
      const auto = bySoftLedger.get(soft);
      if (auto) targetCode = auto.externalCode;
    }

    if (!targetCode) {
      skipped += 1;
      if (keepUnmatched) {
        keptUnmatched += 1;
      } else {
        await db.delete(arrearsEntries).where(eq(arrearsEntries.id, letterEnt.id));
        deletedOrphans += 1;
      }
      continue;
    }

    const target = byCode.get(targetCode);
    if (!target) {
      failed += 1;
      continue;
    }

    try {
      const lines = await listLetterLines(letterEnt.id);
      const inputs = lines.map(l => ({
        description: l.description,
        amount: l.amount,
        paidAmount: l.paidAmount,
        paidDate: l.paidDate,
        source: (l.source === 'ledger' ? 'letter' : l.source) as 'letter' | 'manual' | 'ledger',
      }));

      if (target.id === letterEnt.id) {
        await syncLetterDiffWithLedger(target.id, target.balance, opts.asOfDate, actor);
      } else {
        await replaceLetterLines(target.id, actor, inputs, {
          syncBalance: false,
          letterDate: letterEnt.letterDate || undefined,
        });
        const ledgerBal =
          opts.ledgerRows.find(r => r.externalCode === targetCode)?.balance ?? target.balance;
        await syncLetterDiffWithLedger(target.id, ledgerBal, opts.asOfDate, actor);

        if (letterEnt.managerName?.trim() && !(target.managerName || '').trim()) {
          await db
            .update(arrearsEntries)
            .set({
              managerName: letterEnt.managerName,
              updatedAt: new Date(),
              updatedBy: actor,
            })
            .where(eq(arrearsEntries.id, target.id));
        }

        await db.delete(arrearsEntries).where(eq(arrearsEntries.id, letterEnt.id));
        deletedOrphans += 1;
      }
      attached += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    ledgerUpdated: ledgerResult.updated,
    ledgerInserted: ledgerResult.inserted,
    attached,
    skipped,
    deletedOrphans,
    keptUnmatched,
    failed,
  };
}
