import type { TaxReportData } from '../../types';
import { extractTextFromPdf, parseTaxReport } from '../pdfParser';
import { readFileAsText } from './common';
import { guardNtseFiling } from './guardNtseFiling';

export type ComprehensiveFilingSource = 'pdf' | 'json';

export interface ComprehensiveFilingResult {
  source: ComprehensiveFilingSource;
  data: TaxReportData;
  warnings: string[];
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function isJson(file: File): boolean {
  return file.type === 'application/json' || /\.json$/i.test(file.name);
}

export async function parseComprehensiveFiling(file: File): Promise<ComprehensiveFilingResult> {
  await guardNtseFiling(file, 'comprehensive');
  const warnings: string[] = [];

  if (isPdf(file)) {
    const pages = await extractTextFromPdf(file);
    const data = parseTaxReport(pages);
    if (data.totalRevenue <= 0 && data.totalExpenses <= 0) {
      warnings.push('PDF에서 수입·경비 금액을 찾지 못했습니다. 스캔 PDF이거나 양식이 다를 수 있습니다.');
    }
    return { source: 'pdf', data, warnings };
  }

  if (isJson(file)) {
    const text = await readFileAsText(file);
    const raw = JSON.parse(text) as Record<string, unknown>;
    const amounts = (raw.amounts ?? raw) as Record<string, unknown>;
    const data: TaxReportData = {
      caseType: 'UNKNOWN',
      incomeTypeCode: String(amounts.incomeTypeCode ?? ''),
      reportTypeCode: String(amounts.reportTypeCode ?? ''),
      industryCode: String(amounts.industryCode ?? raw.industryCode ?? ''),
      totalRevenue: Number(amounts.totalRevenue ?? amounts.revenue ?? 0),
      totalExpenses: Number(amounts.totalExpenses ?? amounts.expenses ?? 0),
      expenseItems: [],
    };
    return { source: 'json', data, warnings };
  }

  throw new Error(
    '지원하지 않는 파일 형식입니다. PDF 또는 JSON을 사용해 주세요. (암호화된 .101/.01 전자신고 파일은 직접 읽을 수 없습니다)',
  );
}
