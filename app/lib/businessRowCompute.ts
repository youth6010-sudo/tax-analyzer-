import { findIndustryRate } from '../utils/calculator';
import type { IndustryRate } from '../types';

export interface BusinessRow {
  id: string;
  industryCode: string;
  totalRevenue: string;
  totalExpenses: string;
}

export interface ComputedRow extends BusinessRow {
  revNum: number;
  expNum: number;
  netIncome: number;
  incomeRate: number;
  expenseRate: number;
  industryRate: IndustryRate | null;
  baseIncome: number;
  baseIncomeRate: number;
  incomeRateDiff: number;
  pastStdRatio: number;
}

export function computeRow(
  row: BusinessRow,
  allRates: Record<string, IndustryRate>,
  toNum: (v: string | undefined) => number,
): ComputedRow {
  const revNum = toNum(row.totalRevenue);
  const expNum = toNum(row.totalExpenses);
  const netIncome = revNum - expNum;
  const incomeRate = revNum > 0 ? (netIncome / revNum) * 100 : 0;
  const expenseRate = revNum > 0 ? (expNum / revNum) * 100 : 0;
  const industryRate = findIndustryRate(row.industryCode, allRates);
  const baseExpRate = industryRate?.simpleRateGeneral ?? 0;
  const baseIncome = industryRate && revNum > 0 ? Math.trunc(revNum * (1 - baseExpRate / 100)) : 0;
  const baseIncomeRate = industryRate ? 100 - baseExpRate : 0;
  const incomeRateDiff = industryRate && revNum > 0 ? incomeRate - baseIncomeRate : 0;
  const pastStdRatio = baseIncome > 0 ? (netIncome / baseIncome) * 100 : 0;
  return {
    ...row,
    revNum,
    expNum,
    netIncome,
    incomeRate,
    expenseRate,
    industryRate,
    baseIncome,
    baseIncomeRate,
    incomeRateDiff,
    pastStdRatio,
  };
}
