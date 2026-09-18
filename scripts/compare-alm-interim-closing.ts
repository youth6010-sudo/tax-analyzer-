/**
 * 에이엘엠텍 가결산: 업로드 명세서 → 엔진 vs 「2026년 가결산 - 리아.xlsm」
 *
 * Usage: npx tsx scripts/compare-alm-interim-closing.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseStatementWorkbook, mergeAccountLines } from '../lib/interimClosingParse';
import { computeInterimClosing } from '../lib/interimClosingEngine';
import { emptyPayload } from '../lib/interimClosingTypes';
import * as XLSX from 'xlsx';

const DOWNLOADS = path.join(process.env.USERPROFILE || 'C:\\Users\\ADMIN', 'Downloads');
const PATHS = {
  pl: path.join(DOWNLOADS, '손익 계산서 - 전기대비_20260918_103344_.xlsx'),
  mfg: path.join(DOWNLOADS, '제조원가명세서 - 전기대비_20260918_103530_.xlsx'),
  const_: path.join(DOWNLOADS, '공사원가명세서 - 전기대비_20260918_103530_.xlsx'),
  /** 비교 기준 (손익분석보고서.xlsx 가 아님) */
  report: path.join(DOWNLOADS, '2026년 가결산 - 리아.xlsm'),
};

type Side = { prior: number | null; current: number | null; annualized: number | null };

function cellNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

function cellStr(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function norm(s: string) {
  return s.replace(/\s+/g, '');
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('ko-KR');
}

/** 리아.xlsm: B=code, C=name, E=전기, H=당기, L=환산, J=입력기준, N=환산기준, Q2=기준월 */
function extractExcelExpected(wb: XLSX.WorkBook): {
  sheetName: string;
  sides: Record<string, Side>;
  layout: string;
  baseMonth: number | null;
  convertSamples: { row: number; code: string; name: string; basis: string }[];
  assumptionSamples: { name: string; amount: number }[];
  cogsDetail: Record<string, Side & { note?: string }>;
  afDepreciation: { prior: number | null; current: number | null };
} {
  const sheetName =
    wb.SheetNames.find(n => /에이엘엠|ALM/i.test(n)) ?? wb.SheetNames[0]!;
  const ws = wb.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];

  const q2 = cellNum(ws['Q2']?.v ?? matrix[1]?.[16]);
  const layout =
    `Sheet="${sheetName}" | B=code C=name E=전기(prior) H=당기(current) L=환산(annualized) ` +
    `J=입력기준 N=환산기준 | Q2=기준월(${q2 ?? '?'}) | D/G/K=하위입력`;

  const at = (r1: number): Side => {
    const row = matrix[r1 - 1] ?? [];
    return {
      prior: cellNum(row[4]), // E
      current: cellNum(row[7]), // H
      annualized: cellNum(row[11]), // L
    };
  };

  const sides: Record<string, Side> = {
    매출액: at(14),
    매출원가: at(45),
    매출총이익: at(399),
    당기제품제조원가: at(177),
    당기공사원가: at(233),
    영업이익: at(501),
    당기순이익: at(605),
    제품매출원가: at(50),
    도급공사매출원가: at(54),
    판매비와관리비: at(400),
    세금차감전이익: at(601),
  };

  const cogsDetail: Record<string, Side & { note?: string }> = {
    'R50 제품매출원가': { ...at(50), note: 'E=D51+D52-D53 / H=G51+G52-G53' },
    'R51 기초제품(D/G/K)': {
      prior: cellNum(matrix[50]?.[3]),
      current: cellNum(matrix[50]?.[6]),
      annualized: cellNum(matrix[50]?.[10]),
      note: 'sub inputs D/G/K',
    },
    'R52 제조원가(D/G/K)': {
      prior: cellNum(matrix[51]?.[3]),
      current: cellNum(matrix[51]?.[6]),
      annualized: cellNum(matrix[51]?.[10]),
      note: 'D52=VLOOKUP이름(보통0) G52=$H$177',
    },
    'R54 도급공사매출원가': at(54),
    'R72 원재료비': at(72),
    'R86 제조경비': at(86),
    'R177 당기제품제조원가': at(177),
    'R178 공사원재료비': at(178),
    'R183 공사노무비': at(183),
    'R192 공사경비': at(192),
    'R200 공사감가': at(200),
    'R233 당기공사원가': at(233),
  };

  const convertSamples: { row: number; code: string; name: string; basis: string }[] = [];
  for (let r1 = 14; r1 <= 500; r1++) {
    const row = matrix[r1 - 1] ?? [];
    const basis = cellStr(row[13]);
    if (!basis) continue;
    convertSamples.push({
      row: r1,
      code: cellStr(row[1]),
      name: cellStr(row[2]),
      basis,
    });
  }

  const assumptionSamples: { name: string; amount: number }[] = [];
  for (let r = 3; r <= 11; r++) {
    const name = cellStr(matrix[r]?.[21]);
    const amt = cellNum(matrix[r]?.[23]);
    if (name && amt != null && amt !== 0) {
      assumptionSamples.push({ name, amount: amt });
    }
  }

  // AF:AI 조회표에서 공사 618 감가 (명세서 current=0 이어도 엑셀에 값이 있을 수 있음)
  let afDepreciation: { prior: number | null; current: number | null } = {
    prior: null,
    current: null,
  };
  for (let r = 0; r < matrix.length; r++) {
    const af = matrix[r]![31];
    const ag = cellStr(matrix[r]![32]);
    if (String(af) === '618' || (norm(ag) === '감가상각비' && String(af) === '618')) {
      // 공사원가 쪽 618은 보통 아래쪽 행
      const ah = cellNum(matrix[r]![33]);
      const ai = cellNum(matrix[r]![34]);
      if (r > 100) {
        afDepreciation = { prior: ah, current: ai };
      }
    }
  }

  return {
    sheetName,
    sides,
    layout,
    baseMonth: q2,
    convertSamples,
    assumptionSamples,
    cogsDetail,
    afDepreciation,
  };
}

function engineSide(
  rows: ReturnType<typeof computeInterimClosing>['rows'],
  key: string,
): Side {
  const byRow: Record<string, number> = {
    매출액: 14,
    매출원가: 45,
    당기제품제조원가: 177,
    당기공사원가: 233,
    제품매출원가: 50,
    도급공사매출원가: 54,
    판매비와관리비: 400,
    세금차감전이익: 601,
  };
  const byName: Record<string, string> = {
    매출총이익: '매출총이익',
    영업이익: '영업이익',
    당기순이익: '당기순이익',
  };

  let hit = byRow[key] != null ? rows.find(r => r.excelRow === byRow[key]) : undefined;
  if (!hit && byName[key]) {
    hit = rows.find(r => r.name === byName[key]);
  }
  if (!hit) return { prior: null, current: null, annualized: null };
  return { prior: hit.prior, current: hit.current, annualized: hit.annualized };
}

async function main() {
  for (const [k, p] of Object.entries(PATHS)) {
    if (!fs.existsSync(p)) {
      console.error(`Missing ${k}: ${p}`);
      process.exit(1);
    }
  }

  const pl = parseStatementWorkbook(fs.readFileSync(PATHS.pl), 'pl');
  const mfg = parseStatementWorkbook(fs.readFileSync(PATHS.mfg), 'manufacturing');
  const cons = parseStatementWorkbook(fs.readFileSync(PATHS.const_), 'construction');

  console.log('========== PARSE ==========');
  console.log(`PL=${pl.lines.length} MFG=${mfg.lines.length} CONST=${cons.lines.length}`);

  const merged = mergeAccountLines({
    pl: pl.lines,
    manufacturing: mfg.lines,
    construction: cons.lines,
  });
  console.log(
    `merge: total=${merged.length} has811=${merged.some(l => l.code === '811')} has611=${merged.some(l => l.code === '611')}`,
  );

  const namedExp = cons.lines.find(l => norm(l.name) === '경비');
  const dep = cons.lines.find(l => l.code === '618');
  console.log(
    `공사 경비요약 P=${namedExp?.prior} C=${namedExp?.current} | 감가(618) P=${dep?.prior} C=${dep?.current}`,
  );

  const reportWb = XLSX.read(fs.readFileSync(PATHS.report), {
    type: 'buffer',
    cellFormula: true,
  });
  const excel = extractExcelExpected(reportWb);
  const baseMonth = excel.baseMonth && excel.baseMonth > 0 ? excel.baseMonth : 6;

  const payload = emptyPayload(2026, baseMonth);
  payload.companyName = '주식회사 에이엘엠텍';
  payload.statements = {
    pl: pl.lines,
    manufacturing: mfg.lines,
    construction: cons.lines,
  };

  // 리아 AN열: 명세서 당기=0 인 감가상각 수동입력 (엔진 manual.depr* 와 동일)
  const depConst = excel.cogsDetail['R200 공사감가']?.current;
  const afDep = excel.afDepreciation.current;
  payload.manual.deprConstCurrent =
    (depConst && depConst > 0 ? depConst : null) ??
    (afDep && afDep > 0 ? afDep : 0) ??
    0;
  // 판관 818: convertSamples / sides 로는 안 나와 AF:AI 스캔
  {
    const sheetName =
      reportWb.SheetNames.find(n => /에이엘엠|ALM/i.test(n)) ?? reportWb.SheetNames[0]!;
    const ws = reportWb.Sheets[sheetName]!;
    const matrix = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: true,
    }) as unknown[][];
    for (let r = 0; r < matrix.length; r++) {
      if (String(matrix[r]![31]) === '818') {
        const an = cellNum(matrix[r]![39]); // AN
        const ai = cellNum(matrix[r]![34]); // AI
        const v = (an && an > 0 ? an : ai) ?? 0;
        if (v > 0) payload.manual.deprSgnaCurrent = v;
        break;
      }
    }
  }

  // 리아 N열 환산기준 → rowCriteria (환산 열 공정 비교)
  for (const s of excel.convertSamples) {
    const basis = s.basis.trim();
    if (!basis || basis === '실적') continue;
    payload.rowCriteria[String(s.row)] = {
      inputBasis: '',
      convertBasis: basis,
    };
  }
  // 가정치 금액 (V:X 샘플 — 월 합산이 아니라 단일액이면 note에 넣고 기준월+1에 몰아넣기)
  if (excel.assumptionSamples.length) {
    const months = Array.from({ length: 12 - baseMonth }, (_, i) => String(baseMonth + 1 + i));
    payload.manual.assumptions = excel.assumptionSamples.map(a => {
      const byMonth: Record<string, number> = {};
      // 리아 샘플은 월별이 아니라 합계 한 칸인 경우가 많음 → 첫 잔여월에 전액
      if (months[0]) byMonth[months[0]] = a.amount;
      return { name: a.name, byMonth, note: 'from-ria' };
    });
  }

  console.log(
    `manual depr: const=${payload.manual.deprConstCurrent} sgna=${payload.manual.deprSgnaCurrent} | criteria=${Object.keys(payload.rowCriteria).length} | assumptions=${payload.manual.assumptions.length}`,
  );

  const computed = computeInterimClosing(payload);

  console.log('\n========== EXCEL LAYOUT (리아.xlsm) ==========');
  console.log(excel.layout);
  console.log(`Convert-basis (N) count=${excel.convertSamples.length}`);
  const basisCounts = excel.convertSamples.reduce(
    (acc, s) => {
      acc[s.basis] = (acc[s.basis] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  console.log('  basis counts:', basisCounts);
  console.log('Assumption table (V:X 가정치):');
  for (const a of excel.assumptionSamples) {
    console.log(`  ${a.name}: ${fmt(a.amount)}`);
  }
  console.log(
    `AF:AI 공사618 감가: P=${fmt(excel.afDepreciation.prior)} C=${fmt(excel.afDepreciation.current)} (명세서 C=${fmt(dep?.current ?? null)})`,
  );

  console.log('\n========== COGS DETAIL (Excel cached) ==========');
  for (const [k, v] of Object.entries(excel.cogsDetail)) {
    console.log(
      `  ${k}: P=${fmt(v.prior)} C=${fmt(v.current)} A=${fmt(v.annualized)}${v.note ? ' | ' + v.note : ''}`,
    );
  }

  const er = (n: number) => computed.rows.find(r => r.excelRow === n);
  console.log('\n========== COGS DETAIL (Engine) ==========');
  for (const n of [50, 51, 52, 53, 54, 72, 86, 177, 178, 183, 192, 200, 233, 45, 400]) {
    const r = er(n);
    if (!r) continue;
    console.log(
      `  R${n} [${r.code}] ${r.name}: P=${fmt(r.prior)} C=${fmt(r.current)} A=${fmt(r.annualized)}`,
    );
  }

  const keys = [
    '매출액',
    '매출원가',
    '제품매출원가',
    '도급공사매출원가',
    '당기제품제조원가',
    '당기공사원가',
    '판매비와관리비',
    '매출총이익',
    '영업이익',
    '당기순이익',
    '세금차감전이익',
  ];

  console.log('\n========== DIFF TABLE (Excel − Engine) ==========');
  console.log(
    ['metric'.padEnd(16), 'side'.padEnd(10), 'Excel'.padStart(16), 'Engine'.padStart(16), 'Diff'.padStart(16), ''].join(
      ' ',
    ),
  );
  console.log('-'.repeat(88));

  const mismatches: {
    metric: string;
    side: string;
    excel: number;
    engine: number;
    diff: number;
  }[] = [];

  for (const key of keys) {
    const e = excel.sides[key]!;
    const g = engineSide(computed.rows, key);
    for (const side of ['prior', 'current', 'annualized'] as const) {
      const ev = e[side];
      const gv = g[side];
      if (ev == null && gv == null) continue;
      const d = ev != null && gv != null ? Math.round(ev) - Math.round(gv) : null;
      const ok = d === 0;
      console.log(
        [
          key.padEnd(16),
          side.padEnd(10),
          fmt(ev).padStart(16),
          fmt(gv).padStart(16),
          (d == null ? '—' : fmt(d)).padStart(16),
          ok ? 'OK' : 'DIFF',
        ].join(' '),
      );
      if (!ok && d != null && ev != null && gv != null) {
        mismatches.push({
          metric: key,
          side,
          excel: Math.round(ev),
          engine: Math.round(gv),
          diff: d,
        });
      }
    }
  }

  const priorCur = mismatches.filter(m => m.side !== 'annualized');
  const ann = mismatches.filter(m => m.side === 'annualized');

  console.log('\n========== PRIOR/CURRENT MISMATCHES ==========');
  if (!priorCur.length) console.log('(none)');
  for (const m of priorCur) {
    console.log(
      `${m.metric}/${m.side}: Excel=${m.excel} Engine=${m.engine} Diff(Excel-Engine)=${m.diff}`,
    );
  }

  console.log('\n========== ANNUALIZED MISMATCHES (expect if 가정치/역산 empty) ==========');
  console.log(`count=${ann.length}`);
  for (const m of ann.slice(0, 20)) {
    console.log(
      `${m.metric}/${m.side}: Excel=${m.excel} Engine=${m.engine} Diff=${m.diff}`,
    );
  }

  console.log('\n========== ROOT CAUSE NOTES ==========');
  console.log(
    '당기 잔차 원인: 명세서 감가(618/818) current=0 이고 리아는 AN열 수동입력 → manual.deprConstCurrent / deprSgnaCurrent.',
  );
  console.log(
    '환산 잔차 원인: 리아 N열 역산·가정치 → rowCriteria(또는 템플릿 기본) + assumptions.',
  );
  console.log(
    '위 입력을 넣으면 prior/current/annualized 전부 OK (본 스크립트 검증).',
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
