/**
 * 공문 시트 ↔ 미수(원장) 행 — 자동 확정 없음, 찰리 수동 연결용 목록
 */
import fs from 'fs';
import path from 'path';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { arrearsEntries, arrearsLetterLines } from '@/db/schema';
import {
  parseArrearsLetterWorkbookFile,
  type ParsedLetterSheet,
} from '@/lib/arrearsLetterParse';
import { normCompanyName } from '@/lib/arrearsLetterDb';
import {
  listLetterLines,
  replaceLetterLines,
  syncLetterDiffWithLedger,
} from '@/lib/arrearsLetterDb';
import type { ArrearsLetterLineInput } from '@/app/types/arrears';

export function softCompanyKey(s: string): string {
  return normCompanyName(s).replace(/원/g, '');
}

export function isLedgerRefDescription(desc: string, source?: string): boolean {
  const d = String(desc || '');
  if (
    d.includes('원장반영') ||
    d.includes('원장 추가미수') ||
    d.includes('원장 입금') ||
    d.includes('원장 잔액') ||
    /^전기이월/.test(d)
  ) {
    return true;
  }
  return source === 'ledger';
}

/** 0~1, 높을수록 비슷 */
export function companyNameSimilarity(a: string, b: string): number {
  const ka = softCompanyKey(a);
  const kb = softCompanyKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  if (ka.includes(kb) || kb.includes(ka)) {
    const shorter = Math.min(ka.length, kb.length);
    const longer = Math.max(ka.length, kb.length);
    return 0.72 + 0.28 * (shorter / longer);
  }
  const grams = (s: string) => {
    const set = new Set<string>();
    if (s.length < 2) {
      set.add(s);
      return set;
    }
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = grams(ka);
  const B = grams(kb);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

export type NameCandidate = {
  entryId: string;
  companyName: string;
  externalCode: string;
  balance: number;
  managerName: string;
  score: number;
  ledgerRefOnly: boolean;
};

export type LetterReviewRow = {
  sheetName: string;
  filename: string;
  managerName: string;
  lineCount: number;
  letterBalance: number;
  letterDate: string;
  /** 이름 정규화 완전 일치 후보(참고만 — 자동 연결하지 않음) */
  sameNameEntry: NameCandidate | null;
  /** 공문잔액 ≠ 동일명 원장잔액 */
  balanceMismatch: boolean;
  suggestions: NameCandidate[];
};

/** @deprecated UI는 letterSheets 사용. 호환용 별칭 */
export type UnmatchedLetterSheet = LetterReviewRow;

export type LedgerOnlyEntry = {
  entryId: string;
  companyName: string;
  externalCode: string;
  balance: number;
  managerName: string;
  lineCount: number;
  lastDesc: string;
  suggestions: Array<{
    sheetName: string;
    filename: string;
    managerName: string;
    score: number;
    lineCount: number;
  }>;
};

export type PickEntry = {
  entryId: string;
  companyName: string;
  externalCode: string;
  balance: number;
  managerName: string;
  ledgerRefOnly: boolean;
};

function defaultLetterDir(): string {
  return (
    process.env.ARREARS_LETTER_DIR?.trim() ||
    path.join('z:', '10_미수관리', '미수금 공문 - 26년')
  );
}

const MANAGERS = ['인디', '다야', '리아', '블루', '윈터', '페리'] as const;

function managerFromFilename(name: string): string {
  for (const key of MANAGERS) {
    if (name.includes(key)) return key;
  }
  return '';
}

export function listLetterWorkbookPaths(dir = defaultLetterDir()): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => /\.xls[x]?$/i.test(f))
    .filter(f => f.includes('미수수수료') && !f.includes('현황'))
    .filter(f => managerFromFilename(f))
    .map(f => path.join(dir, f))
    .sort();
}

export type ScannedLetterSheet = {
  sheetName: string;
  filename: string;
  managerName: string;
  filePath: string;
  sheet: ParsedLetterSheet;
};

export function scanLetterSheets(dir = defaultLetterDir()): ScannedLetterSheet[] {
  const out: ScannedLetterSheet[] = [];
  for (const filePath of listLetterWorkbookPaths(dir)) {
    const filename = path.basename(filePath);
    const managerName = managerFromFilename(filename);
    const buf = fs.readFileSync(filePath);
    const parsed = parseArrearsLetterWorkbookFile(buf, filename);
    for (const sheet of parsed.sheets) {
      out.push({
        sheetName: sheet.companyName,
        filename,
        managerName: managerName || parsed.managerName,
        filePath,
        sheet,
      });
    }
  }
  return out;
}

function findSameNameEntry(
  sheetName: string,
  entries: Array<{
    id: string;
    companyName: string;
    externalCode: string;
    balance: number;
    managerName: string;
  }>,
  ledgerOnlyIds: Set<string>,
): NameCandidate | null {
  const key = softCompanyKey(sheetName);
  if (!key) return null;
  const hits = entries.filter(e => softCompanyKey(e.companyName) === key);
  if (hits.length !== 1) return null;
  const e = hits[0]!;
  return {
    entryId: e.id,
    companyName: e.companyName,
    externalCode: e.externalCode,
    balance: e.balance,
    managerName: e.managerName,
    score: 1,
    ledgerRefOnly: ledgerOnlyIds.has(e.id),
  };
}

export async function buildMatchReview(opts?: { letterDir?: string; minScore?: number }): Promise<{
  letterDir: string;
  letterDirOk: boolean;
  /** 공문 시트 전부 — 자동 연결 없음, 찰리가 고름 */
  letterSheets: LetterReviewRow[];
  /** 연결 버튼용: 이름이 다른 유사 후보 위주 필터 (호환) */
  unmatchedLetters: LetterReviewRow[];
  ledgerOnly: LedgerOnlyEntry[];
  pickEntries: PickEntry[];
  letterSheetCount: number;
  /** 이름만 동일한 참고 건수(자동 연결한 적 없음) */
  sameNameCount: number;
  matchedLetterCount: number;
}> {
  const letterDir = opts?.letterDir || defaultLetterDir();
  const minScore = opts?.minScore ?? 0.28;
  const letterDirOk = fs.existsSync(letterDir);

  const db = getDb();
  const entries = await db
    .select({
      id: arrearsEntries.id,
      companyName: arrearsEntries.companyName,
      externalCode: arrearsEntries.externalCode,
      balance: arrearsEntries.balance,
      managerName: arrearsEntries.managerName,
    })
    .from(arrearsEntries);

  const allLines = await db
    .select({
      arrearsEntryId: arrearsLetterLines.arrearsEntryId,
      description: arrearsLetterLines.description,
      source: arrearsLetterLines.source,
      sortOrder: arrearsLetterLines.sortOrder,
    })
    .from(arrearsLetterLines)
    .orderBy(asc(arrearsLetterLines.sortOrder));

  const linesByEntry = new Map<string, typeof allLines>();
  for (const l of allLines) {
    const list = linesByEntry.get(l.arrearsEntryId) ?? [];
    list.push(l);
    linesByEntry.set(l.arrearsEntryId, list);
  }

  const ledgerOnlyIds = new Set<string>();
  for (const e of entries) {
    const lines = linesByEntry.get(e.id) ?? [];
    if (!lines.length) {
      if (e.balance !== 0) ledgerOnlyIds.add(e.id);
      continue;
    }
    if (lines.every(l => isLedgerRefDescription(l.description, l.source))) {
      ledgerOnlyIds.add(e.id);
    }
  }

  const pickEntries: PickEntry[] = entries
    .map(e => ({
      entryId: e.id,
      companyName: e.companyName,
      externalCode: e.externalCode,
      balance: e.balance,
      managerName: e.managerName,
      ledgerRefOnly: ledgerOnlyIds.has(e.id),
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'));

  const scanned = letterDirOk ? scanLetterSheets(letterDir) : [];
  const letterSheets: LetterReviewRow[] = [];

  for (const s of scanned) {
    const letterBalance = s.sheet.lines.reduce(
      (sum, l) => sum + Math.round(l.amount) - Math.round(l.paidAmount || 0),
      0,
    );
    const sameNameEntry = findSameNameEntry(s.sheetName, entries, ledgerOnlyIds);
    const scored = entries
      .map(e => ({
        entryId: e.id,
        companyName: e.companyName,
        externalCode: e.externalCode,
        balance: e.balance,
        managerName: e.managerName,
        score: companyNameSimilarity(s.sheetName, e.companyName),
        ledgerRefOnly: ledgerOnlyIds.has(e.id),
      }))
      .filter(c => c.score >= minScore)
      .sort((a, b) => {
        if (a.ledgerRefOnly !== b.ledgerRefOnly) return a.ledgerRefOnly ? -1 : 1;
        return b.score - a.score;
      })
      .slice(0, 8);

    const balanceMismatch = !!(
      sameNameEntry && Math.round(sameNameEntry.balance) !== Math.round(letterBalance)
    );

    letterSheets.push({
      sheetName: s.sheetName,
      filename: s.filename,
      managerName: s.managerName,
      lineCount: s.sheet.lines.length,
      letterBalance,
      letterDate: s.sheet.letterDate || '',
      sameNameEntry,
      balanceMismatch,
      suggestions: scored,
    });
  }

  // 연결이 더 급해 보이는 순: 동일명 없음 → 잔액불일치 → 이름동일
  letterSheets.sort((a, b) => {
    const rank = (r: LetterReviewRow) => {
      if (!r.sameNameEntry) return 0;
      if (r.balanceMismatch) return 1;
      return 2;
    };
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    const as = a.suggestions[0]?.score ?? 0;
    const bs = b.suggestions[0]?.score ?? 0;
    return bs - as;
  });

  const unmatchedLetters = letterSheets.filter(r => !r.sameNameEntry);
  const sameNameCount = letterSheets.filter(r => !!r.sameNameEntry).length;

  const ledgerOnly: LedgerOnlyEntry[] = [];
  for (const e of entries) {
    if (!ledgerOnlyIds.has(e.id)) continue;
    const lines = linesByEntry.get(e.id) ?? [];
    const last = lines[lines.length - 1];
    const suggestions = scanned
      .map(s => ({
        sheetName: s.sheetName,
        filename: s.filename,
        managerName: s.managerName,
        score: companyNameSimilarity(e.companyName, s.sheetName),
        lineCount: s.sheet.lines.length,
      }))
      .filter(c => c.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    ledgerOnly.push({
      entryId: e.id,
      companyName: e.companyName,
      externalCode: e.externalCode,
      balance: e.balance,
      managerName: e.managerName,
      lineCount: lines.length,
      lastDesc: last?.description || '',
      suggestions,
    });
  }

  ledgerOnly.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  return {
    letterDir,
    letterDirOk,
    letterSheets,
    unmatchedLetters,
    ledgerOnly,
    pickEntries,
    letterSheetCount: scanned.length,
    sameNameCount,
    matchedLetterCount: sameNameCount,
  };
}

/** 공문 시트를 미수 행에 연결(상세 덮어쓰기 후 원장 잔액 유지) */
export async function linkLetterSheetToEntry(opts: {
  entryId: string;
  sheetName: string;
  filename: string;
  letterDir?: string;
  actorName: string;
}): Promise<{
  ok: true;
  companyName: string;
  lineCount: number;
  letterBalance: number;
  entryBalance: number;
}> {
  const letterDir = opts.letterDir || defaultLetterDir();
  const filePath = path.join(letterDir, opts.filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`공문 파일 없음: ${opts.filename}`);
  }

  const db = getDb();
  const [entry] = await db
    .select()
    .from(arrearsEntries)
    .where(eq(arrearsEntries.id, opts.entryId))
    .limit(1);
  if (!entry) throw new Error('미수 항목을 찾을 수 없습니다.');

  const buf = fs.readFileSync(filePath);
  const parsed = parseArrearsLetterWorkbookFile(buf, opts.filename);
  const sheet =
    parsed.sheets.find(s => softCompanyKey(s.companyName) === softCompanyKey(opts.sheetName)) ||
    parsed.sheets.find(s => companyNameSimilarity(s.companyName, opts.sheetName) >= 0.9);
  if (!sheet) throw new Error(`시트 «${opts.sheetName}» 를 파일에서 찾지 못했습니다.`);

  const inputs: ArrearsLetterLineInput[] = sheet.lines.map(l => ({
    description: l.description,
    amount: l.amount,
    paidAmount: l.paidAmount,
    paidDate: l.paidDate,
    source: 'letter' as const,
  }));

  await replaceLetterLines(opts.entryId, opts.actorName, inputs, {
    syncBalance: false,
    letterDate: sheet.letterDate || undefined,
  });

  // 잔액은 항상 거래처원장(entry.balance) 기준
  await syncLetterDiffWithLedger(
    opts.entryId,
    entry.balance,
    entry.asOfDate || new Date().toISOString().slice(0, 10),
    opts.actorName,
  );

  const lines = await listLetterLines(opts.entryId);
  const letterBalance = lines.reduce((s, l) => s + l.amount - l.paidAmount, 0);

  return {
    ok: true,
    companyName: entry.companyName,
    lineCount: lines.length,
    letterBalance,
    entryBalance: entry.balance,
  };
}
