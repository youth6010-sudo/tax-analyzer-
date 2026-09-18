import * as XLSX from 'xlsx';
import type { AccountLine, StatementKind } from '@/lib/interimClosingTypes';
import { STATEMENT_KIND_LABELS } from '@/lib/interimClosingTypes';

function cellStr(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function cellNum(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  const n = Number(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function normalizeCode(raw: string): string {
  const s = raw.replace(/[\[\]【】]/g, '').trim();
  const m = s.match(/^0*(\d{2,4})$/);
  if (m) return String(Number(m[1]));
  return s;
}

function detectKindFromText(text: string): StatementKind | null {
  if (/손\s*익\s*계\s*산\s*서|손익계산서/.test(text)) return 'pl';
  if (/제조원가/.test(text)) return 'manufacturing';
  if (/공사원가/.test(text)) return 'construction';
  if (/보관원가/.test(text)) return 'storage';
  if (/분양원가/.test(text)) return 'sales';
  if (/운송원가/.test(text)) return 'transport';
  return null;
}

function isSectionOrSkipName(name: string): boolean {
  if (!name) return true;
  if (/^[Ⅰ-Ⅹ]/.test(name)) return true;
  if (/^[IVX]+\.?$/.test(name)) return true;
  if (/^과\s*목$|^금액$|^회사명|^단위|^제\s*\d/.test(name)) return true;
  return false;
}

/**
 * 세무사랑 「전기대비」엑셀 (손익/제조/공사원가 등) — 계정코드 표시 양식
 * - 헤더: 과목 | 제 N(당)기 | 제 M(전)기
 * - 행: [0404] | 제품매출 | 당기액 | 전기액
 * - 소계/원가 합계 행: 당기제품 제조원가 등 (코드 없이 이름+금액)
 */
function parseDouzoneJeongiDaebi(
  matrix: unknown[][],
  kind: StatementKind,
): AccountLine[] {
  let headerRow = -1;
  let currentCols: number[] = [];
  let priorCols: number[] = [];

  for (let r = 0; r < Math.min(matrix.length, 25); r++) {
    const row = matrix[r] ?? [];
    const labels = row.map(c => cellStr(c).replace(/\s/g, ''));
    let hasSubject = false;
    const cur: number[] = [];
    const pri: number[] = [];
    for (let c = 0; c < labels.length; c++) {
      const t = labels[c]!;
      if (/과목/.test(t)) hasSubject = true;
      if (/\(당\)기|당기/.test(t) && !/전기대비/.test(t)) cur.push(c);
      if (/\(전\)기|전기/.test(t) && !/전기대비/.test(t)) pri.push(c);
    }
    // 다음 행이 「금액」만 있는 경우 그 열도 금액 열로 사용
    if (hasSubject && (cur.length || pri.length)) {
      headerRow = r;
      currentCols = cur;
      priorCols = pri;
      const next = matrix[r + 1] ?? [];
      for (let c = 0; c < next.length; c++) {
        if (/금\s*액/.test(cellStr(next[c]))) {
          // 금액 행 열을 당기/전기 헤더에 가깝게 배정
          if (currentCols.length && Math.abs(c - currentCols[0]!) <= 2) {
            if (!currentCols.includes(c)) currentCols.push(c);
          } else if (priorCols.length && Math.abs(c - priorCols[0]!) <= 2) {
            if (!priorCols.includes(c)) priorCols.push(c);
          } else if (currentCols.length <= priorCols.length) {
            if (!currentCols.includes(c)) currentCols.push(c);
          } else if (!priorCols.includes(c)) {
            priorCols.push(c);
          }
        }
      }
      break;
    }
  }

  if (headerRow < 0) return [];

  const currentAnchor = currentCols.length ? Math.min(...currentCols) : -1;
  const priorAnchor = priorCols.length ? Math.min(...priorCols) : -1;
  // 전기 헤더 열부터는 전기 금액 (당기 금액은 그 왼쪽, 병합 ±1열 포함)
  const boundary = priorAnchor > 0 ? priorAnchor : currentAnchor >= 0 ? currentAnchor + 2 : 4;

  const pickAmount = (row: unknown[], side: 'current' | 'prior'): number => {
    let best = 0;
    let found = false;
    for (let c = 0; c < row.length; c++) {
      const raw = row[c];
      if (raw === '' || raw == null) continue;
      const s = cellStr(raw).replace(/\s/g, '');
      if (typeof raw !== 'number' && !/^[\d,\.\-]+$/.test(s)) continue;
      const n = cellNum(raw);
      const isCurrentSide = c < boundary;
      if (side === 'current' && isCurrentSide) {
        best = n;
        found = true;
      } else if (side === 'prior' && !isCurrentSide) {
        best = n;
        found = true;
      }
    }
    return found ? best : 0;
  };

  const lines: AccountLine[] = [];
  const start = headerRow + 1;

  for (let r = start; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    let code = '';
    let name = '';

    for (let c = 0; c < row.length; c++) {
      const s = cellStr(row[c]);
      if (!s) continue;
      const bracket = s.match(/^\[?\s*0*(\d{3,4})\s*\]$/);
      if (bracket) {
        code = String(Number(bracket[1]));
        continue;
      }
      const inline = s.match(/^\[?\s*0*(\d{3,4})\s*\]\s*(.+)$/);
      if (inline) {
        code = String(Number(inline[1]));
        name = inline[2]!.trim();
        continue;
      }
      if (/^[\d,\.\-]+$/.test(s.replace(/\s/g, ''))) continue;
      if (/^[Ⅰ-Ⅹ]/.test(s) || /^[IVX]+\.?$/.test(s)) continue;
      if (/^\d{1,2}$/.test(s)) continue;
      if (/과\s*목|금\s*액|회사명|단위/.test(s)) continue;
      if (!name) name = s;
    }

    if (isSectionOrSkipName(name) && !code) continue;

    const current = pickAmount(row, 'current');
    const prior = pickAmount(row, 'prior');

    if (!code && !name) continue;
    if (!code && !current && !prior) continue;
    if (!code && /^[Ⅰ-Ⅹ]/.test(cellStr(row[0]))) continue;

    lines.push({
      code,
      name: name || (code ? `계정${code}` : ''),
      prior,
      current,
      source: kind,
    });
  }

  return lines;
}

/** 여러 명세서 라인을 병합. 코드 중복(원재료 재고 등)은 이름 키로도 보존 */
export function mergeAccountLines(
  groups: Partial<Record<StatementKind, AccountLine[]>>,
): AccountLine[] {
  const byCode = new Map<string, AccountLine>();
  const byName = new Map<string, AccountLine>();
  const order: StatementKind[] = [
    'pl',
    'manufacturing',
    'construction',
    'storage',
    'sales',
    'transport',
  ];
  const normName = (s: string) => s.replace(/\s+/g, '');

  for (const kind of order) {
    for (const line of groups[kind] ?? []) {
      const named: AccountLine = {
        code: line.code,
        name: line.name,
        prior: line.prior,
        current: line.current,
        source: line.source ?? kind,
      };
      if (line.name) {
        const key = normName(line.name);
        const prev = byName.get(key);
        // 同名·다른 코드(판관 811 vs 공사 611)는 코드맵이 각각 보존.
        // 이름맵은 먼저 들어온 쪽(손익 우선)을 유지해 VLOOKUP(이름) 보조용으로만 씀.
        if (!prev) {
          byName.set(key, named);
        } else if (prev.code && named.code && prev.code !== named.code) {
          byName.set(key, {
            ...prev,
            prior: prev.prior || named.prior || 0,
            current: prev.current || named.current || 0,
          });
        } else {
          byName.set(key, {
            ...named,
            prior: named.prior || prev.prior || 0,
            current: named.current || prev.current || 0,
            code: named.code || prev.code || '',
          });
        }
      }
      if (line.code) {
        const prev = byCode.get(line.code);
        // 같은 코드·다른 이름(0153 재고 3행)이면 코드맵은 덮지 않고 이름맵만 유지
        if (
          !prev ||
          !prev.name ||
          normName(prev.name) === normName(line.name || '')
        ) {
          byCode.set(line.code, {
            code: line.code,
            name: line.name || prev?.name || '',
            prior: line.prior || prev?.prior || 0,
            current: line.current || prev?.current || 0,
            source: line.source ?? kind,
          });
        }
      }
    }
  }

  // 코드 행은 이름 충돌과 무관하게 전부 유지 (판관 811이 공사 611 同名에 가려지지 않게)
  const out: AccountLine[] = [];
  const seenName = new Set<string>();
  for (const line of byCode.values()) {
    out.push(line);
    if (line.name) seenName.add(normName(line.name));
  }
  // 이름맵: 아직 없는 이름만 추가 (같은 코드·다른 이름 재고행, 코드 없는 요약행)
  for (const line of byName.values()) {
    const key = line.name ? normName(line.name) : '';
    if (key && seenName.has(key)) continue;
    out.push(line);
    if (key) seenName.add(key);
  }
  return out;
}

export function parseStatementWorkbook(
  buffer: ArrayBuffer | Buffer,
  forcedKind?: StatementKind,
): { kind: StatementKind; lines: AccountLine[]; sheetName: string } {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  let best: { kind: StatementKind; lines: AccountLine[]; sheetName: string } | null = null;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: true,
    }) as unknown[][];

    const preview = matrix
      .slice(0, 12)
      .map(r => (r as unknown[]).map(cellStr).join(' '))
      .join(' ');
    const detected =
      forcedKind ?? detectKindFromText(preview + ' ' + sheetName) ?? 'pl';

    const lines = parseDouzoneJeongiDaebi(matrix, detected);
    const scored = lines.filter(l => l.code || l.current || l.prior).length;
    if (!best || scored > best.lines.filter(l => l.code || l.current || l.prior).length) {
      best = { kind: detected, lines, sheetName };
    }
  }

  if (!best || best.lines.length === 0) {
    throw new Error(
      `명세서를 읽지 못했습니다. ${forcedKind ? STATEMENT_KIND_LABELS[forcedKind] + ' ' : ''}세무사랑 「전기대비」엑셀(계정코드 표시)인지 확인하세요.`,
    );
  }
  return best;
}

/** 테스트/디버그용 */
export { normalizeCode, detectKindFromText };
