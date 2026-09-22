import reportTemplateJson from '@/lib/interimClosingReportTemplate.json';
import { mergeAccountLines } from '@/lib/interimClosingParse';
import type {
  AccountLine,
  ComputedReportRow,
  InterimClosingComputed,
  InterimClosingManualInputs,
  InterimClosingPayload,
  ReportTemplateRow,
  TaxEstimate,
} from '@/lib/interimClosingTypes';
import {
  assumptionMonthTotal,
  endingInventoryKey,
  isGimalAmountRow,
} from '@/lib/interimClosingTypes';

const TEMPLATE = reportTemplateJson as ReportTemplateRow[];

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function lookupByCode(
  table: Map<string, AccountLine>,
  code: string,
): AccountLine | null {
  if (!code) return null;
  return table.get(code) ?? table.get(String(Number(code))) ?? null;
}

function lookupByName(
  byName: Map<string, AccountLine>,
  name: string,
): AccountLine | null {
  if (!name) return null;
  const key = name.replace(/\s+/g, '');
  return byName.get(key) ?? null;
}

function assumptionExtra(
  manual: InterimClosingManualInputs,
  accountName: string,
): number {
  const row = manual.assumptions.find(
    a => a.name.replace(/\s+/g, '') === accountName.replace(/\s+/g, ''),
  );
  if (!row) return 0;
  return assumptionMonthTotal(row);
}

/**
 * 다른 계정 합산·구성식 행 — 입력기준/환산기준 미적용, 구성요소 반영값만 합산.
 */
const COMPUTED_FORMULA_ROWS = new Set([
  // 48 당기상품매입액은 명세서 연동 + 실적/역산 환산 가능 (에이엘엠텍 당기원재료매입과 동일)
  14, 45, 46, 47, 49, 50, 51, 52, 54, 72, 73, 77, 86, 177, 178, 183, 192, 233, 399, 400, 501, 502, 553, 601, 602, 605,
]);

function isComputedFormulaRow(excelRow: number, kind: string, name = ''): boolean {
  if (kind === 'section') return true;
  // 기말**액: 입력·환산 미적용 (기타비용 기말재고액으로만 당기 반영)
  if (isGimalAmountRow(name)) return true;
  return COMPUTED_FORMULA_ROWS.has(excelRow);
}

function annualize(
  current: number,
  convertBasis: string,
  accountName: string,
  manual: InterimClosingManualInputs,
): number {
  const basis = (convertBasis || '').trim();
  const month = Math.max(1, Math.min(12, num(manual.baseMonth) || 6));
  // 환산기준:
  // - 실적: 당기 그대로
  // - 역산: 당기 / 기준월 × 12
  // - 가정치: 당기(실적) + 가정치 표 합계
  if (basis === '가정치') {
    return current + assumptionExtra(manual, accountName);
  }
  if (basis === '역산') {
    if (!month) return current;
    return (current / month) * 12;
  }
  return current;
}

function personalIncomeTax(base: number): { tax: number; rateLabel: string } {
  if (base <= 0) return { tax: 0, rateLabel: '6%' };
  const b = base;
  let tax = 0;
  let rateLabel = '6%';
  if (b <= 14_000_000) {
    tax = b * 0.06;
    rateLabel = '6%';
  } else if (b <= 50_000_000) {
    tax = b * 0.15 - 1_260_000;
    rateLabel = '15%';
  } else if (b <= 88_000_000) {
    tax = b * 0.24 - 5_760_000;
    rateLabel = '24%';
  } else if (b <= 150_000_000) {
    tax = b * 0.35 - 15_440_000;
    rateLabel = '35%';
  } else if (b <= 300_000_000) {
    tax = b * 0.38 - 19_940_000;
    rateLabel = '38%';
  } else if (b <= 500_000_000) {
    tax = b * 0.4 - 25_940_000;
    rateLabel = '40%';
  } else if (b <= 1_000_000_000) {
    tax = b * 0.42 - 35_940_000;
    rateLabel = '42%';
  } else {
    tax = b * 0.45 - 65_940_000;
    rateLabel = '45%';
  }
  return { tax: Math.floor(tax), rateLabel };
}

function corporateTax(base: number): { tax: number; rateLabel: string } {
  // 2026.1.1 이후 개시 사업연도 — 영리법인 각사업연도 소득
  // 2억 이하 10% / 2억超~200억 20%−2천만 / 200억超~3,000억 22%−4.2억 / 3,000억超 25%−94.2억
  if (base <= 0) return { tax: 0, rateLabel: '10%' };
  if (base <= 200_000_000) {
    return { tax: Math.round(base * 0.1), rateLabel: '10%' };
  }
  if (base <= 20_000_000_000) {
    return { tax: Math.round(base * 0.2 - 20_000_000), rateLabel: '20%' };
  }
  if (base <= 300_000_000_000) {
    return { tax: Math.round(base * 0.22 - 420_000_000), rateLabel: '22%' };
  }
  return { tax: Math.round(base * 0.25 - 9_420_000_000), rateLabel: '25%' };
}

function earnedIncomeDeduction(salary: number, extraDeduction: number): number {
  const s = salary;
  let d = 0;
  if (s <= 5_000_000) d = s * 0.7;
  else if (s <= 15_000_000) d = 3_500_000 + (s - 5_000_000) * 0.4;
  else if (s <= 45_000_000) d = 7_500_000 + (s - 15_000_000) * 0.15;
  else if (s <= 100_000_000) d = 12_000_000 + (s - 45_000_000) * 0.05;
  else d = 14_750_000 + (s - 100_000_000) * 0.02;
  return Math.round(d + extraDeduction);
}

function buildLookup(lines: AccountLine[]) {
  const byCode = new Map<string, AccountLine>();
  const byName = new Map<string, AccountLine>();
  // 코드 행을 먼저 넣어 동명(공사 611 vs PL 811)이 이름을 덮지 않게 함
  for (const line of lines) {
    if (line.code) byCode.set(line.code, line);
  }
  for (const line of lines) {
    if (!line.name) continue;
    const key = line.name.replace(/\s+/g, '');
    const prev = byName.get(key);
    // 동명이면 PL(source) 우선, 없으면 기존 유지
    if (!prev) {
      byName.set(key, line);
    } else if (prev.source === 'pl') {
      // keep pl
    } else if (line.source === 'pl') {
      byName.set(key, line);
    } else if ((line.prior || line.current) && !(prev.prior || prev.current)) {
      byName.set(key, line);
    }
  }
  return { byCode, byName };
}

/**
 * 엑셀 손익분석 보고서 엔진.
 * - 계정행: VLOOKUP(코드) → 전기/당기, 환산기준 적용
 * - 섹션 합계: 매출·원가·판관·영업외 등 구간 합
 * - 제조/공사 원가 합계는 이름 키로 매출원가 하위에 반영
 */
export function computeInterimClosing(
  payload: InterimClosingPayload,
): InterimClosingComputed {
  const manual = {
    ...payload.manual,
    baseMonth: payload.baseMonth || payload.manual.baseMonth,
  };
  const merged = mergeAccountLines(payload.statements);
  const { byCode, byName } = buildLookup(merged);

  const rawRows: ComputedReportRow[] = TEMPLATE.map(t => {
    const key = String(t.r);
    const criteria = payload.rowCriteria[key];
    const computedRow = isComputedFormulaRow(t.r, t.kind, t.name);
    // 사용자 rowCriteria 우선, 없으면 템플릿(엑셀 N/J열) 기본값
    // 합계·수식 행은 기준 미적용
    let convertBasis = '';
    let inputBasis = '';
    if (!computedRow) {
      const rawConvert = (criteria?.convertBasis ?? t.convertBasis ?? '').trim();
      const rawInput = (criteria?.inputBasis ?? t.inputBasis ?? '').trim();
      convertBasis =
        rawConvert === '환산기준' || rawConvert === '' ? '역산' : rawConvert;
      inputBasis =
        rawInput === '입력기준' || rawInput === '' || rawInput === '-'
          ? '실적'
          : rawInput;
    }
    // 기말**액: 기준 칸 비움 (기타비용에서만 조정)
    if (isGimalAmountRow(t.name)) {
      convertBasis = '';
      inputBasis = '';
    }

    let prior = 0;
    let current = 0;
    let name = t.name;
    let linked = false;

    // 섹션·라벨은 템플릿 고정 과목명 (엑셀 C열 하드코딩 → 항상 표시)
    if (t.kind === 'section' || t.kind === 'label') {
      linked = true;
    } else if (t.kind === 'account' && t.code) {
      // 엑셀: C=VLOOKUP(B, AF:AG, 2) / D·G=VLOOKUP(AF:AI)
      const hit = lookupByCode(byCode, t.code);
      if (hit) {
        linked = true;
        prior = hit.prior;
        current = hit.current;
        if (hit.name) name = hit.name;
      }
    } else if (t.name) {
      const hit = lookupByName(byName, t.name);
      if (hit) {
        linked = true;
        prior = hit.prior;
        current = hit.current;
        if (hit.name) name = hit.name;
      }
    }

    const annualized = computedRow
      ? current
      : annualize(current, convertBasis, name || t.code, manual);

    return {
      key,
      excelRow: t.r,
      code: t.code,
      name,
      kind: t.kind,
      prior,
      priorRatio: null,
      current,
      currentRatio: null,
      annualized,
      annualizedRatio: null,
      inputBasis,
      convertBasis,
      isSection: t.kind === 'section',
      isComputed: computedRow,
      linked,
    };
  });

  const byExcelRow = new Map(rawRows.map(r => [r.excelRow, r]));

  /**
   * 감가상각비(공사 618 / 판관 818): 전기=명세서 유지,
   * 당기는 명세서에 없으면 manual 값으로 직접 입력.
   */
  const applyDepreciationManual = () => {
    const fill = (excelRow: number, code: string, manualCurrent: number) => {
      const row = byExcelRow.get(excelRow);
      if (!row) return;
      const hit = lookupByCode(byCode, code);
      const stmtPrior = hit ? num(hit.prior) : 0;
      const stmtCurrent = hit ? num(hit.current) : 0;
      // 명세서 당기가 있으면 그대로 사용
      if (stmtCurrent !== 0) return;
      const v = num(manualCurrent);
      // 전기만 있고 당기 수동값이 있으면 반영 (0 입력도 허용하되, 미입력은 패스)
      if (!v && stmtPrior === 0) return;
      if (!v) return;
      row.current = v;
      row.linked = true;
      if (hit?.name) row.name = hit.name;
      else if (!row.name) row.name = '감가상각비';
      row.annualized = row.isComputed
        ? row.current
        : annualize(row.current, row.convertBasis, row.name || code, manual);
    };
    fill(200, '618', manual.deprConstCurrent);
    fill(418, '818', manual.deprSgnaCurrent);
  };

  applyDepreciationManual();

  const sumRange = (
    from: number,
    to: number,
    field: 'prior' | 'current' | 'annualized',
  ) => {
    let s = 0;
    for (let r = from; r <= to; r++) {
      const row = byExcelRow.get(r);
      if (!row || row.isSection) continue;
      // 엑셀 L45=SUM(L46:L71) 는 부모 L열만 — sub(재고식 구성행)는 제외
      if (row.kind === 'sub') continue;
      if (row.kind === 'account') {
        s += row[field];
      }
    }
    return s;
  };

  const setAmt = (
    row: ComputedReportRow | undefined,
    prior: number,
    current: number,
    annualized?: number,
  ) => {
    if (!row) return;
    row.prior = prior;
    row.current = current;
    if (annualized != null) {
      row.annualized = annualized;
    } else if (row.isComputed) {
      // 합계·수식 행: 환산기준 재적용 없이 당기 합과 동일
      row.annualized = current;
    } else {
      row.annualized = annualize(current, row.convertBasis, row.name || row.code, manual);
    }
    if (prior || current || row.linked) row.linked = true;
  };

  const amt = (excelRow: number, field: 'prior' | 'current' | 'annualized') =>
    byExcelRow.get(excelRow)?.[field] ?? 0;

  const nameAmt = (names: string[], field: 'prior' | 'current') => {
    const seen = new Set<string>();
    let s = 0;
    for (const n of names) {
      const key = n.replace(/\s+/g, '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const hit = lookupByName(byName, n);
      if (hit) s += hit[field];
    }
    return s;
  };

  const sumExcelRows = (from: number, to: number) => {
    let p = 0;
    let c = 0;
    let a = 0;
    for (let r = from; r <= to; r++) {
      const row = byExcelRow.get(r);
      if (!row || row.isSection) continue;
      if (row.kind === 'account' || row.kind === 'sub') {
        p += row.prior;
        c += row.current;
        a += row.annualized;
      }
    }
    return { p, c, a };
  };

  const forceEndingInventoryZero = () => {
    for (const row of rawRows) {
      const n = (row.name || '').replace(/\s+/g, '');
      // 「기말~」은 가결산 기본 0 (당기 미확정). 수동 endingInventories 로만 채움.
      if (n.includes('기말')) {
        row.prior = 0;
        row.current = 0;
        row.annualized = 0;
      }
    }
  };

  /** 원가 부모가 있으면 기말**액 행을 연결 (기타비용 입력 대상) */
  const forceLinkEndingInventoryRows = () => {
    const linkIf = (endExcel: number, parentExcel: number, fallbackName: string) => {
      const parent = byExcelRow.get(parentExcel);
      const end = byExcelRow.get(endExcel);
      if (!end || !parent) return;
      if (!(parent.linked || parent.prior || parent.current)) return;
      end.linked = true;
      if (!end.name) end.name = fallbackName;
    };
    linkIf(49, 46, '기말상품재고액');
    linkIf(53, 50, '기말제품재고액');
    linkIf(75, 72, '기말원재료재고액');
    linkIf(181, 178, '기말원재료(도급)재고액');
  };

  /** 기타비용 아래 기말**액(원명) 수동값 → 해당 행 당기·환산에 반영 */
  const applyEndingInventoryManual = () => {
    const map: Record<string, number> = { ...(manual.endingInventories || {}) };
    // 구저장본: 단일 endingInventoryCurrent → 첫 연결 기말 행
    const legacy = num(manual.endingInventoryCurrent);
    if (legacy && !Object.values(map).some(v => num(v))) {
      const prefer = [
        byExcelRow.get(49),
        byExcelRow.get(53),
        byExcelRow.get(75),
        byExcelRow.get(181),
      ];
      const target =
        prefer.find(r => r && /상품/.test((r.name || '').replace(/\s+/g, ''))) ||
        prefer.find(r => r && /제품/.test((r.name || '').replace(/\s+/g, ''))) ||
        prefer.find(r => r && /원재료/.test((r.name || '').replace(/\s+/g, ''))) ||
        prefer.find(Boolean);
      if (target?.name) map[endingInventoryKey(target.name)] = legacy;
    }

    for (const row of rawRows) {
      if (!isGimalAmountRow(row.name)) continue;
      const nk = endingInventoryKey(row.name);
      const v = num(map[nk]);
      if (!v) continue;
      row.current = v;
      // 기말**액은 환산기준 미적용 — 당기=환산
      row.annualized = v;
      row.linked = true;
    }
  };

  /** 엑셀 원가 구성식 재계산 (리아.xlsm H50/L50/H177/L177/H233/L233 …) */
  const recalcCostFormulas = () => {
    applyDepreciationManual();
    forceEndingInventoryZero();
    forceLinkEndingInventoryRows();
    applyEndingInventoryManual();

    // 기초제품재고액(51): 전기=기초제품, 당기=기초제품+기초재공품 (엑셀 G51)
    {
      const row = byExcelRow.get(51);
      if (row) {
        const prior = nameAmt(['기초제품재고액'], 'prior');
        const current =
          nameAmt(['기초제품재고액'], 'current') +
          nameAmt(['기초재공품 재고액', '기초재공품재고액'], 'current');
        setAmt(row, prior, current);
        if (row.name !== '기초제품재고액') row.name = '기초제품재고액';
      }
    }

    // 기초원재료재고액(73): 전기=기초원재료, 당기=기초제품+기초미완성공사 (엑셀 G73 템플릿)
    {
      const row = byExcelRow.get(73);
      if (row) {
        const prior = nameAmt(['기초원재료재고액'], 'prior');
        const current =
          nameAmt(['기초제품재고액'], 'current') +
          nameAmt(['기초미완성 공사액', '기초미완성공사액'], 'current');
        setAmt(row, prior, current);
        if (!row.name) row.name = '기초원재료재고액';
      }
    }

    // 상품매출원가(451) = 기초상품 + 당기상품매입 - 기말상품
    {
      const parent = byExcelRow.get(46);
      const beginRow = byExcelRow.get(47);
      const purchaseRow = byExcelRow.get(48);
      const endRow = byExcelRow.get(49);
      const hit =
        lookupByCode(byCode, '451') ||
        lookupByName(byName, '상품매출원가');
      const active =
        !!hit &&
        (num(hit.prior) !== 0 ||
          num(hit.current) !== 0 ||
          /상품/.test(String(hit.name || '').replace(/\s+/g, '')));

      if (parent && (active || parent.linked || parent.prior || parent.current)) {
        if (hit?.name) parent.name = hit.name;
        else if (!parent.name) parent.name = '상품매출원가';

        const beginPrior = nameAmt(['기초상품재고액', '기초상품'], 'prior');
        const beginCurrent = nameAmt(['기초상품재고액', '기초상품'], 'current');
        let purchPrior = nameAmt(
          ['당기상품매입액', '상품매입액', '상품매입', '당기상품매입'],
          'prior',
        );
        let purchCurrent = nameAmt(
          ['당기상품매입액', '상품매입액', '상품매입', '당기상품매입'],
          'current',
        );
        // 명세서에 매입 세부가 없으면 상품매출원가 − 기초 로 역산
        // (기말은 가결산 기본 0 → 수동 기말재고 입력 시 매출원가가 줄어들도록 역산에 기말 미포함)
        if (!purchPrior && hit) {
          purchPrior = num(hit.prior) - beginPrior;
        }
        if (!purchCurrent && hit) {
          purchCurrent = num(hit.current) - beginCurrent;
        }

        if (beginRow) {
          beginRow.name = '기초상품재고액';
          setAmt(beginRow, beginPrior, beginCurrent);
        }
        if (purchaseRow) {
          purchaseRow.name = '당기상품매입액';
          setAmt(purchaseRow, purchPrior, purchCurrent);
        }
        if (endRow) {
          endRow.name = '기말상품재고액';
          endRow.prior = 0;
          const endKey = endingInventoryKey(endRow.name);
          const hasManual =
            num(manual.endingInventories?.[endKey]) || num(manual.endingInventoryCurrent);
          if (!hasManual) {
            endRow.current = 0;
            endRow.annualized = 0;
          }
          endRow.linked = true;
        }

        setAmt(
          parent,
          (beginRow?.prior ?? 0) + (purchaseRow?.prior ?? 0) - (endRow?.prior ?? 0),
          (beginRow?.current ?? 0) + (purchaseRow?.current ?? 0) - (endRow?.current ?? 0),
          (beginRow?.annualized ?? 0) +
            (purchaseRow?.annualized ?? 0) -
            (endRow?.annualized ?? 0),
        );
        if (beginRow) beginRow.linked = true;
        if (purchaseRow) purchaseRow.linked = true;
      }
    }

    // 원재료비(501) = 기초 + 매입 - 기말
    {
      const parent = byExcelRow.get(72);
      if (parent) {
        setAmt(
          parent,
          amt(73, 'prior') + amt(74, 'prior') - amt(75, 'prior'),
          amt(73, 'current') + amt(74, 'current') - amt(75, 'current'),
          amt(73, 'annualized') + amt(74, 'annualized') - amt(75, 'annualized'),
        );
      }
    }

    // 노무비(77)=SUM(78:85), 경비(86)=SUM(87:176)
    // 엑셀 R86=SUM(D87:D176). 상세가 없으면 명세서 요약「경비」로 폴백
    {
      const labor = byExcelRow.get(77);
      if (labor) {
        const { p, c, a } = sumExcelRows(78, 85);
        setAmt(labor, p, c, a);
        if (!labor.name) labor.name = '노무비';
      }
      const overhead = byExcelRow.get(86);
      if (overhead) {
        const { p, c, a } = sumExcelRows(87, 176);
        const named = (payload.statements.manufacturing || []).find(
          l => (l.name || '').replace(/\s+/g, '') === '경비',
        );
        if (p || c) {
          setAmt(overhead, p, c, a);
        } else if (named && (named.prior || named.current)) {
          setAmt(overhead, named.prior, named.current);
        }
        if (!overhead.name) overhead.name = '경비';
      }
    }

    // 당기제품 제조원가(177) = 항상 72+76+77+86 (명세서 합계행 사용 금지)
    {
      const mfgTotal = byExcelRow.get(177);
      const p = amt(72, 'prior') + amt(76, 'prior') + amt(77, 'prior') + amt(86, 'prior');
      const c = amt(72, 'current') + amt(76, 'current') + amt(77, 'current') + amt(86, 'current');
      const a =
        amt(72, 'annualized') + amt(76, 'annualized') + amt(77, 'annualized') + amt(86, 'annualized');
      setAmt(mfgTotal, p, c, a);
      if (mfgTotal && !mfgTotal.name) mfgTotal.name = '당기제품 제조원가';
      // 엑셀 R52: D52=VLOOKUP("당기제품제조원가") — 조회표는 "당기제품 제조원가"(공백)라 실패→0
      // G52=$H$177, K52=$L$177 (당기·환산만 제조원가 합계 복사)
      const underCogs = byExcelRow.get(52);
      if (mfgTotal && underCogs) {
        underCogs.name = '당기제품제조원가';
        setAmt(underCogs, 0, mfgTotal.current, mfgTotal.annualized);
      }
    }

    // 제품매출원가(455) = 기초제품 + 제조원가 - 기말 (PL VLOOKUP 덮지 않음)
    {
      const cogs455 = byExcelRow.get(50);
      if (cogs455) {
        if (!cogs455.name) cogs455.name = '제품매출원가';
        setAmt(
          cogs455,
          amt(51, 'prior') + amt(52, 'prior') - amt(53, 'prior'),
          amt(51, 'current') + amt(52, 'current') - amt(53, 'current'),
          amt(51, 'annualized') + amt(52, 'annualized') - amt(53, 'annualized'),
        );
      }
    }

    // 공사 원재료비(601) = 기초 + 매입 - 기말
    {
      const parent = byExcelRow.get(178);
      if (parent) {
        setAmt(
          parent,
          amt(179, 'prior') + amt(180, 'prior') - amt(181, 'prior'),
          amt(179, 'current') + amt(180, 'current') - amt(181, 'current'),
          amt(179, 'annualized') + amt(180, 'annualized') - amt(181, 'annualized'),
        );
      }
    }

    // 공사 노무(183)=SUM(184:190), 경비(192)=SUM(193:232)
    // 엑셀 R192=SUM(상세). 요약「경비」는 상세가 없을 때만 사용
    {
      const labor = byExcelRow.get(183);
      if (labor) {
        const { p, c, a } = sumExcelRows(184, 190);
        setAmt(labor, p, c, a);
        if (!labor.name) labor.name = '노무비';
      }
      const overhead = byExcelRow.get(192);
      if (overhead) {
        const { p, c, a } = sumExcelRows(193, 232);
        const named = (payload.statements.construction || []).find(
          l => (l.name || '').replace(/\s+/g, '') === '경비',
        );
        if (p || c) {
          setAmt(overhead, p, c, a);
        } else if (named && (named.prior || named.current)) {
          setAmt(overhead, named.prior, named.current);
        }
        if (!overhead.name) overhead.name = '경비';
      }
    }

    // 당기공사원가(233) = 178+182+183+191+192
    {
      const constTotal = byExcelRow.get(233);
      const p =
        amt(178, 'prior') +
        amt(182, 'prior') +
        amt(183, 'prior') +
        amt(191, 'prior') +
        amt(192, 'prior');
      const c =
        amt(178, 'current') +
        amt(182, 'current') +
        amt(183, 'current') +
        amt(191, 'current') +
        amt(192, 'current');
      const a =
        amt(178, 'annualized') +
        amt(182, 'annualized') +
        amt(183, 'annualized') +
        amt(191, 'annualized') +
        amt(192, 'annualized');
      setAmt(constTotal, p, c, a);
      if (constTotal && !constTotal.name) constTotal.name = '당기공사원가';

      // 도급공사매출원가(54): 전기=VLOOKUP, 당기·환산=$H$233/$L$233
      const row54 = byExcelRow.get(54);
      if (row54 && constTotal && (constTotal.prior || constTotal.current || constTotal.annualized)) {
        const hit =
          lookupByCode(byCode, '452') ||
          lookupByName(byName, '도급공사매출원가') ||
          lookupByName(byName, '당기공사원가');
        const prior = hit?.prior ?? row54.prior;
        if (hit?.name) row54.name = hit.name;
        else if (!row54.name) row54.name = '도급공사매출원가';
        setAmt(row54, prior, constTotal.current, constTotal.annualized);
      }
    }

    forceEndingInventoryZero();
    forceLinkEndingInventoryRows();
    applyEndingInventoryManual();
    // 기말 수동 반영 후 원가 부모 재계산
    {
      const goods = byExcelRow.get(46);
      if (goods && (goods.linked || goods.name)) {
        setAmt(
          goods,
          amt(47, 'prior') + amt(48, 'prior') - amt(49, 'prior'),
          amt(47, 'current') + amt(48, 'current') - amt(49, 'current'),
          amt(47, 'annualized') + amt(48, 'annualized') - amt(49, 'annualized'),
        );
      }
      const prod = byExcelRow.get(50);
      if (prod) {
        setAmt(
          prod,
          amt(51, 'prior') + amt(52, 'prior') - amt(53, 'prior'),
          amt(51, 'current') + amt(52, 'current') - amt(53, 'current'),
          amt(51, 'annualized') + amt(52, 'annualized') - amt(53, 'annualized'),
        );
      }
      const mat = byExcelRow.get(72);
      if (mat) {
        setAmt(
          mat,
          amt(73, 'prior') + amt(74, 'prior') - amt(75, 'prior'),
          amt(73, 'current') + amt(74, 'current') - amt(75, 'current'),
          amt(73, 'annualized') + amt(74, 'annualized') - amt(75, 'annualized'),
        );
      }
      const constMat = byExcelRow.get(178);
      if (constMat) {
        setAmt(
          constMat,
          amt(179, 'prior') + amt(180, 'prior') - amt(181, 'prior'),
          amt(179, 'current') + amt(180, 'current') - amt(181, 'current'),
          amt(179, 'annualized') + amt(180, 'annualized') - amt(181, 'annualized'),
        );
      }
    }
  };

  recalcCostFormulas();

  // 섹션 합계 재계산 (매출·매출원가)
  const sectionDefs: { row: number; from: number; to: number }[] = [
    { row: 14, from: 15, to: 44 },
    { row: 45, from: 46, to: 71 },
  ];

  for (const def of sectionDefs) {
    const row = byExcelRow.get(def.row);
    if (!row) continue;
    row.prior = sumRange(def.from, def.to, 'prior');
    row.current = sumRange(def.from, def.to, 'current');
    row.annualized = sumRange(def.from, def.to, 'annualized');
  }

  // 매출총이익 = 매출 - 매출원가 (엑셀 행 399 근처 Ⅲ)
  const sales = byExcelRow.get(14);
  const cogs = byExcelRow.get(45);
  const gross = rawRows.find(r => r.code.startsWith('Ⅲ') || r.name === '매출총이익');
  if (gross && sales && cogs) {
    gross.prior = sales.prior - cogs.prior;
    gross.current = sales.current - cogs.current;
    gross.annualized = sales.annualized - cogs.annualized;
  }

  // 판관비 합 (Ⅳ 다음 계정들 ~ 영업이익 전)
  const sgna = rawRows.find(r => r.code.startsWith('Ⅳ') || r.name.includes('판매비'));
  const opInc = rawRows.find(r => r.code.startsWith('Ⅴ') || r.name === '영업이익');
  if (sgna) {
    // 판관비 계정 보통 801~ 대역 — 템플릿에서 Ⅳ 다음 ~ Ⅴ 전
    const sgnaIdx = rawRows.indexOf(sgna);
    const opIdx = opInc ? rawRows.indexOf(opInc) : -1;
    let p = 0;
    let c = 0;
    let a = 0;
    for (let i = sgnaIdx + 1; i < rawRows.length; i++) {
      if (opIdx >= 0 && i >= opIdx) break;
      const row = rawRows[i]!;
      if (row.isSection) break;
      if (row.kind === 'account') {
        p += row.prior;
        c += row.current;
        a += row.annualized;
      }
    }
    // Ⅳ 자체에 합계 — 엑셀처럼 항상 구간 SUM
    sgna.prior = p;
    sgna.current = c;
    sgna.annualized = a;
  }

  if (opInc && sales && cogs && sgna) {
    // 영업이익 = 매출 - 원가 - 판관 (또는 매출총이익 - 판관)
    const gPrior = sales.prior - cogs.prior;
    const gCur = sales.current - cogs.current;
    const gAnn = sales.annualized - cogs.annualized;
    opInc.prior = gPrior - sgna.prior;
    opInc.current = gCur - sgna.current;
    opInc.annualized = gAnn - sgna.annualized;
  }

  // 영업외수익/비용·세금·당기순이익
  const oi = rawRows.find(r => r.code.startsWith('Ⅵ') || r.name === '영업외수익');
  const oe = rawRows.find(r => r.code.startsWith('Ⅶ') || r.name === '영업외비용');
  const ebt = rawRows.find(
    r => r.code.startsWith('Ⅷ') || r.name.includes('차감전이익') || r.name.includes('세금차감전'),
  );
  const taxRow = rawRows.find(r => r.code.startsWith('Ⅸ') || r.name === '세금' || r.name === '법인세등');
  const ni = rawRows.find(r => r.code.startsWith('Ⅹ') || r.name === '당기순이익');

  if (oi) {
    const idx = rawRows.indexOf(oi);
    let p = 0;
    let c = 0;
    let a = 0;
    for (let i = idx + 1; i < rawRows.length; i++) {
      const row = rawRows[i]!;
      if (row.isSection) break;
      if (row.kind === 'account') {
        p += row.prior;
        c += row.current;
        a += row.annualized;
      }
    }
    oi.prior = p;
    oi.current = c;
    oi.annualized = a;
  }

  if (oe) {
    const idx = rawRows.indexOf(oe);
    let p = 0;
    let c = 0;
    let a = 0;
    for (let i = idx + 1; i < rawRows.length; i++) {
      const row = rawRows[i]!;
      if (row.isSection) break;
      if (row.kind === 'account') {
        p += row.prior;
        c += row.current;
        a += row.annualized;
      }
    }
    oe.prior = p;
    oe.current = c;
    oe.annualized = a;
  }

  if (ebt && opInc) {
    ebt.prior = opInc.prior + (oi?.prior ?? 0) - (oe?.prior ?? 0);
    ebt.current = opInc.current + (oi?.current ?? 0) - (oe?.current ?? 0);
    ebt.annualized = opInc.annualized + (oi?.annualized ?? 0) - (oe?.annualized ?? 0);
  }

  if (taxRow && taxRow.kind === 'section') {
    // 법인세등 계정 합
    const idx = rawRows.indexOf(taxRow);
    let p = 0;
    let c = 0;
    let a = 0;
    for (let i = idx + 1; i < rawRows.length; i++) {
      const row = rawRows[i]!;
      if (row.isSection) break;
      if (row.kind === 'account') {
        p += row.prior;
        c += row.current;
        a += row.annualized;
      }
    }
    taxRow.prior = p;
    taxRow.current = c;
    taxRow.annualized = a;
  }

  if (ni && ebt) {
    ni.prior = ebt.prior - (taxRow?.prior ?? 0);
    ni.current = ebt.current - (taxRow?.current ?? 0);
    ni.annualized = ebt.annualized - (taxRow?.annualized ?? 0);
  }

  // 비율 (매출 대비)
  const salesPrior = sales?.prior || 0;
  const salesCurrent = sales?.current || 0;
  let salesAnn = sales?.annualized || 0;

  // 입력기준「비율」: 전기 매출대비 비율(전기계정÷전기매출) × 올해 당기매출 → 당기금액
  // 입력기준「실적」: 명세서 당기 그대로(기본)
  if (salesCurrent || salesPrior) {
    for (const row of rawRows) {
      if ((row.kind !== 'account' && row.kind !== 'sub') || !row.linked) continue;
      if (row.isComputed) continue;
      if ((row.inputBasis || '').trim() !== '비율') continue;
      const priorRatio = salesPrior ? row.prior / salesPrior : 0;
      row.current = salesCurrent * priorRatio;
      // 환산: 실적=당기동일, 역산=당기/기준월*12, 가정치=당기(실적)+가정치합
      row.annualized = annualize(row.current, row.convertBasis, row.name, manual);
    }
    // 원가 구성식 재적용 후 구간 합계
    recalcCostFormulas();
    for (const def of sectionDefs) {
      const row = byExcelRow.get(def.row);
      if (!row) continue;
      row.prior = sumRange(def.from, def.to, 'prior');
      row.current = sumRange(def.from, def.to, 'current');
      row.annualized = sumRange(def.from, def.to, 'annualized');
    }
    if (gross && sales && cogs) {
      gross.prior = sales.prior - cogs.prior;
      gross.current = sales.current - cogs.current;
      gross.annualized = sales.annualized - cogs.annualized;
    }
    if (sgna) {
      const sgnaIdx = rawRows.indexOf(sgna);
      const opIdx = opInc ? rawRows.indexOf(opInc) : -1;
      let p = 0;
      let c = 0;
      let a = 0;
      for (let i = sgnaIdx + 1; i < rawRows.length; i++) {
        if (opIdx >= 0 && i >= opIdx) break;
        const row = rawRows[i]!;
        if (row.isSection) break;
        if (row.kind === 'account') {
          p += row.prior;
          c += row.current;
          a += row.annualized;
        }
      }
      sgna.prior = p;
      sgna.current = c;
      sgna.annualized = a;
    }
    if (opInc && sales && cogs && sgna) {
      opInc.prior = sales.prior - cogs.prior - sgna.prior;
      opInc.current = sales.current - cogs.current - sgna.current;
      opInc.annualized = sales.annualized - cogs.annualized - sgna.annualized;
    }
    if (ebt && opInc) {
      ebt.prior = opInc.prior + (oi?.prior ?? 0) - (oe?.prior ?? 0);
      ebt.current = opInc.current + (oi?.current ?? 0) - (oe?.current ?? 0);
      ebt.annualized = opInc.annualized + (oi?.annualized ?? 0) - (oe?.annualized ?? 0);
    }
    if (ni && ebt) {
      ni.prior = ebt.prior - (taxRow?.prior ?? 0);
      ni.current = ebt.current - (taxRow?.current ?? 0);
      ni.annualized = ebt.annualized - (taxRow?.annualized ?? 0);
    }
    salesAnn = sales?.annualized || 0;
  }

  for (const row of rawRows) {
    row.priorRatio = salesPrior ? row.prior / salesPrior : null;
    row.currentRatio = salesCurrent ? row.current / salesCurrent : null;
    row.annualizedRatio = salesAnn ? row.annualized / salesAnn : null;
  }

  const totalAdj =
    num(manual.inventoryAdj) +
    num(manual.salesAdj) +
    num(manual.purchaseAdj) +
    num(manual.extraCost) +
    num(manual.otherCost);

  // 엑셀 H3=$L$601(세금차감전이익), H10=H3+H9 — UI「당기순이익」칸도 H3와 동일
  const pretaxBase = ebt?.annualized ?? ebt?.current ?? 0;
  const netIncomeBase = ni?.annualized ?? ni?.current ?? 0;
  const adjustedProfit = pretaxBase + totalAdj;

  // 엑셀 K3=(L501+H9)/L14 , K4=E501/E14(전기 영업이익률)
  const opAnn = opInc?.annualized ?? 0;
  const opPrior = opInc?.prior ?? 0;
  const operatingMargin = salesAnn ? (opAnn + totalAdj) / salesAnn : 0;
  const targetOperatingMargin = salesPrior ? opPrior / salesPrior : 0;

  // 세금 추정 기초 = 조정후 이익(H10)
  const personalTax = estimatePersonalTax(adjustedProfit, manual);
  const corporateTaxEst = estimateCorporateTax(adjustedProfit, manual);

  const uploaded = (Object.keys(payload.statements) as (keyof typeof payload.statements)[]).filter(
    k => (payload.statements[k]?.length ?? 0) > 0,
  );

  const salesAnnualized = salesAnn || sales?.annualized || 0;
  let personalSincereFlag: 'Y' | 'N' | '-' = '-';
  if (manual.entityType === '개인') {
    const eok = Number(
      String(manual.sincereThresholdLabel ?? '')
        .replace(/,/g, '')
        .match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0,
    );
    if (eok > 0) {
      const threshold = eok * 100_000_000;
      personalSincereFlag = salesAnnualized >= threshold ? 'Y' : 'N';
    } else {
      personalSincereFlag = '-';
    }
  }

  return {
    rows: rawRows,
    kpi: {
      // 엑셀 상단 H3 = L601(세금차감전이익)
      netIncome: pretaxBase,
      netIncomeAfterTax: netIncomeBase,
      operatingMargin,
      targetOperatingMargin,
      adjustedProfit,
      totalAdj,
      salesAnnualized,
    },
    personalSincereFlag,
    personalTax,
    corporateTax: corporateTaxEst,
    uploaded: uploaded as InterimClosingComputed['uploaded'],
  };
}

function estimatePersonalTax(
  netIncome: number,
  manual: InterimClosingManualInputs,
): TaxEstimate {
  // 개인: NI + 수입금액산입 − 필요경비산입 = 소득금액 → − 소득공제 = 과세표준
  const incomeInclusion = num(manual.incomeInclusion);
  const expenseInclusion = num(manual.expenseInclusion);
  const deductionAmount = num(manual.deductionAmount);
  const incomeAmount = netIncome + incomeInclusion - expenseInclusion;
  const taxBase = incomeAmount - deductionAmount;
  const { tax: calculatedTax, rateLabel } = personalIncomeTax(taxBase);
  const taxReduction = Math.round(calculatedTax * num(manual.reductionRate));
  const taxCredit = num(manual.taxCredit);
  const minTax =
    manual.minTaxTarget === 'Y'
      ? calculatedTax <= 30_000_000
        ? calculatedTax * 0.35
        : 30_000_000 * 0.35 + (calculatedTax - 30_000_000) * 0.45
      : 0;
  const afterCredits = calculatedTax - taxReduction - taxCredit;
  const determinedTax = Math.max(afterCredits, minTax);
  const interimPayment = num(manual.interimPayment);
  return {
    netIncome,
    incomeInclusion,
    expenseInclusion,
    incomeAmount,
    deductionAmount,
    donationExcess: 0,
    taxBase,
    calculatedTax,
    taxReduction,
    taxCredit,
    minTax: Math.round(minTax),
    determinedTax: Math.round(determinedTax),
    interimPayment,
    payable: Math.round(determinedTax - interimPayment),
    rateLabel,
  };
}

function estimateCorporateTax(
  netIncome: number,
  manual: InterimClosingManualInputs,
): TaxEstimate {
  // 법인: NI + 익금산입 − 손금산입 + 기부금한도초과 = 과세표준
  const incomeInclusion = num(manual.incomeInclusion);
  const expenseInclusion = num(manual.expenseInclusion);
  const donationExcess = num(manual.donationExcess);
  const taxBase = netIncome + incomeInclusion - expenseInclusion + donationExcess;
  const { tax: calculatedTax, rateLabel } = corporateTax(taxBase);
  const taxReduction = Math.round(calculatedTax * num(manual.reductionRate));
  const taxCredit = num(manual.taxCredit);
  const minTax = manual.minTaxTarget === 'Y' ? Math.round(taxBase * 0.07) : 0;
  const afterCredits = calculatedTax - taxReduction - taxCredit;
  const determinedTax = Math.max(afterCredits, minTax);
  const interimPayment = num(manual.interimPayment);
  return {
    netIncome,
    incomeInclusion,
    expenseInclusion,
    incomeAmount: taxBase,
    deductionAmount: 0,
    donationExcess,
    taxBase,
    calculatedTax,
    taxReduction,
    taxCredit,
    minTax,
    determinedTax,
    interimPayment,
    payable: determinedTax - interimPayment,
    rateLabel,
  };
}

export function personalTaxRateLabel(base: number): string {
  const b = num(base);
  if (b <= 0) return '';
  if (b <= 14_000_000) return '6%';
  if (b <= 50_000_000) return '15%';
  if (b <= 88_000_000) return '24%';
  if (b <= 150_000_000) return '35%';
  if (b <= 300_000_000) return '38%';
  if (b <= 500_000_000) return '40%';
  if (b <= 1_000_000_000) return '42%';
  return '45%';
}

export function computeOwnerTaxBases(manual: InterimClosingManualInputs) {
  // 엑셀: 소득공제·과세표준 = (12월환산 + 추가상여) 기준
  const ownerPay = num(manual.ownerSalaryAnnual) + num(manual.ownerExtraBonus);
  const execPay = num(manual.execSalaryAnnual) + num(manual.execExtraBonus);
  const ownerDed = earnedIncomeDeduction(ownerPay, num(manual.ownerDeduction));
  const execDed = earnedIncomeDeduction(execPay, num(manual.execDeduction));
  const ownerTaxBase = ownerPay - ownerDed;
  const execTaxBase = execPay - execDed;
  return {
    ownerPay,
    execPay,
    ownerDeduction: ownerDed,
    ownerTaxBase,
    ownerRate: personalTaxRateLabel(ownerTaxBase),
    execDeduction: execDed,
    execTaxBase,
    execRate: personalTaxRateLabel(execTaxBase),
  };
}

export { TEMPLATE as INTERIM_CLOSING_TEMPLATE };
