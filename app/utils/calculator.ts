import type { TaxReportData, AnalysisResult, IndustryRate, ExpenseItem, SimulationInput, SimulationResult } from '../types';

const FETCH_TIMEOUT_MS = 180_000;
const MIN_RATE_KEYS = 10;

function validateRates(data: Record<string, IndustryRate>): void {
  const keys = Object.keys(data);
  if (keys.length < MIN_RATE_KEYS) {
    throw new Error(`업종코드 데이터가 비정상입니다. (항목 수 ${keys.length})`);
  }
}

function parseRatesJson(text: string): Record<string, IndustryRate> {
  if (text.length < 200) {
    throw new Error('업종코드 파일이 비어 있거나 너무 짧습니다. public/industry_rates.json 을 확인하세요.');
  }
  const data = JSON.parse(text) as Record<string, IndustryRate>;
  validateRates(data);
  return data;
}

async function fetchRatesOnce(
  url: string,
  cache: RequestCache,
  signal: AbortSignal
): Promise<Record<string, IndustryRate>> {
  const response = await fetch(url, { cache, signal });
  if (!response.ok) {
    throw new Error(`업종코드 데이터를 불러올 수 없습니다. (HTTP ${response.status})`);
  }
  const text = await response.text();
  return parseRatesJson(text);
}

/**
 * public/industry_rates.json 로드.
 * 첫 요청 실패·비정상 응답 시 캐시 무시 URL로 한 번 더 시도합니다.
 */
export async function loadIndustryRates(): Promise<Record<string, IndustryRate>> {
  const ctl = new AbortController();
  const to =
    typeof window !== 'undefined' ? window.setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS) : undefined;
  const signal = ctl.signal;
  try {
    try {
      return await fetchRatesOnce('/industry_rates.json', 'default', signal);
    } catch (firstErr) {
      if (signal.aborted) throw firstErr;
      const bust = `/industry_rates.json?r=${Date.now()}`;
      return await fetchRatesOnce(bust, 'no-store', signal);
    }
  } finally {
    if (to !== undefined) window.clearTimeout(to);
  }
}

export function findIndustryRate(
  code: string,
  rates: Record<string, IndustryRate>
): IndustryRate | null {
  if (!code) return null;
  return rates[code] ?? rates[code.padStart(6, '0')] ?? null;
}

export function calculate(
  reportData: TaxReportData,
  industryRate: IndustryRate | null
): AnalysisResult {
  const { totalRevenue, totalExpenses, expenseItems } = reportData;

  // 소득금액 = 수입금액 - 필요경비
  const netIncome = totalRevenue - totalExpenses;

  // 소득율(B) = 소득금액 / 수입금액 * 100
  const netIncomeRatio = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;

  const simpleExpenseRate = industryRate?.simpleRateGeneral ?? null;

  // 단순경비율 기준 소득금액 = 수입금액 * (1 - 단순경비율/100) — 소수점 버림
  const simpleBaseIncome = (simpleExpenseRate !== null && totalRevenue > 0)
    ? Math.trunc(totalRevenue * (1 - simpleExpenseRate / 100))
    : null;

  // 과거 표준 대비 소득율 = (실제 소득금액 / 단순경비율 기준 소득금액) * 100
  const historicalRatio = (simpleBaseIncome !== null && simpleBaseIncome > 0)
    ? (netIncome / simpleBaseIncome) * 100
    : null;

  // 단순 소득율 vs 실제 소득율 차이
  const simpleIncomeRate = simpleExpenseRate !== null ? 100 - simpleExpenseRate : null;
  const diffFromSimpleRate = simpleIncomeRate !== null
    ? netIncomeRatio - simpleIncomeRate
    : null;

  // 항목별 비율
  const expenseRatios: ExpenseItem[] = expenseItems.map(item => ({
    ...item,
    ratio: totalRevenue > 0 ? (item.amount / totalRevenue) * 100 : 0,
  }));

  return {
    reportData,
    industryRate,
    netIncome,
    netIncomeRatio,
    simpleExpenseRate,
    simpleBaseIncome,
    historicalRatio,
    diffFromSimpleRate,
    expenseRatios,
  };
}

export function calcSimulation(input: SimulationInput, industryRate: IndustryRate | null): SimulationResult {
  const simpleExpenseRate = industryRate?.simpleRateGeneral ?? null;
  const rev = input.expectedRevenue;

  // 기준 소득금액(100%) = 수입금액 * (1 - 단순경비율/100) — 소수점 버림
  const baseIncome = (simpleExpenseRate !== null && rev > 0)
    ? Math.trunc(rev * (1 - simpleExpenseRate / 100))
    : 0;

  // 목표 소득금액 = 기준값 * (선택% / 100) — 소수점 버림
  const targetIncome = Math.trunc(baseIncome * (input.targetPct / 100));

  // 필요 경비 가이드 = 수입금액 - 목표 소득금액 — 소수점 버림
  const requiredExpense = Math.trunc(rev - targetIncome);

  return { industryRate, simpleExpenseRate, baseIncome, targetIncome, requiredExpense };
}

export function formatKRW(amount: number): string {
  if (amount === 0) return '0원';
  return new Intl.NumberFormat('ko-KR').format(Math.round(amount)) + '원';
}

export function formatPct(value: number | null): string {
  if (value === null || isNaN(value)) return '-';
  return value.toFixed(1) + '%';
}
