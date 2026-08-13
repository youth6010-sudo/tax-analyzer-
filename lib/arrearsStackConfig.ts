/**
 * 미수 레이어 소스 경로·파일 목록
 *
 * 역할:
 *  - 공문: 전부 유지 (과거·누적 미수 확인용, 2026 줄도 삭제하지 않음)
 *  - 상세 PDF: 2026 반영·잔액·최근 입금 확인의 본선
 *  - 세금계산서 6·7월: 확인 + PDF에 없을 때만 내역 보충
 *  - 원장만(공문 없음): 장기 미수 — 재구성 시 전기이월 차변으로 내역=잔액 맞춤
 *
 * 재구성 순서: 공문 → 요약원장 병합 → 원장상세 PDF → 세금계산서(보충) → 플러그제거 → 원장만 전기이월 → 불일치 리포트
 */
import fs from 'fs';
import path from 'path';

export const LETTER_DIR = path.join('z:', '10_미수관리', '미수금 공문 - 26년');

export const LETTER_FILES = [
  '미수수수료_다야-26.07.27.xls',
  '미수수수료_리아-26.07.27.xls',
  '미수수수료_블루-26.07.27.xls',
  '미수수수료_윈터-26.07.27.xls',
  '미수수수료_페리-26.07.27.xls',
  '미수수수료-인디-26.07.27.xls',
] as const;

export const TAX_INVOICE_DIR = String.raw`z:\00_관리&운영\세금계산서 발급`;

export const TAX_INVOICE_FILES = [
  '세금계산서발급2606월.xls',
  '세금계산서발급2606월개인조정료.xls',
  '세금계산서발급2606월기타매출.xls',
  '세금계산서발급2606월신고대리.xls',
  '세금계산서발급2607월.xls',
  '세금계산서발급2607월기타매출.xls',
  '세금계산서발급2607월신고대리.xls',
] as const;

/** 최신 거래처원장 기본 경로 (입금·잔액 확정) */
export const DEFAULT_LEDGER_PATH = path.join(
  process.env.USERPROFILE || '',
  'Desktop',
  '거래처원장_20260813_103126.xls',
);

/** 2026 거래처원장 상세(총괄내용) PDF — 차변·대변 일자별 */
export const DEFAULT_LEDGER_DETAIL_PDF = path.join(
  process.env.USERPROFILE || '',
  'Desktop',
  '2026년 거래처원장.pdf',
);

/** 연도별 거래처원장 PDF (전기이월·기말 검증용) */
export const YEAR_LEDGER_DETAIL_PDFS = [
  path.join(process.env.USERPROFILE || '', 'Desktop', '2022년 거래처 원장.pdf'),
  path.join(process.env.USERPROFILE || '', 'Desktop', '2023년 거래처 원장.pdf'),
  path.join(process.env.USERPROFILE || '', 'Desktop', '2024년 거래처 원장.pdf'),
  path.join(process.env.USERPROFILE || '', 'Desktop', '2025년 거래처 원장.pdf'),
  path.join(process.env.USERPROFILE || '', 'Desktop', '2026년 거래처원장.pdf'),
] as const;

export type StackFileCheck = {
  layer: 'letter' | 'tax' | 'ledger' | 'ledgerDetail';
  path: string;
  ok: boolean;
};

export function letterFilePaths(dir = LETTER_DIR): string[] {
  return LETTER_FILES.map(name => path.join(dir, name));
}

export function taxInvoiceFilePaths(dir = TAX_INVOICE_DIR): string[] {
  return TAX_INVOICE_FILES.map(name => path.join(dir, name));
}

export function assertStackFilesExist(opts?: {
  letterDir?: string;
  taxDir?: string;
  ledgerPath?: string;
  ledgerDetailPdf?: string;
}): { ok: boolean; missing: StackFileCheck[]; checks: StackFileCheck[] } {
  const letterDir = opts?.letterDir ?? LETTER_DIR;
  const taxDir = opts?.taxDir ?? TAX_INVOICE_DIR;
  const ledgerPath = opts?.ledgerPath ?? DEFAULT_LEDGER_PATH;
  const ledgerDetailPdf = opts?.ledgerDetailPdf ?? DEFAULT_LEDGER_DETAIL_PDF;

  const checks: StackFileCheck[] = [
    ...letterFilePaths(letterDir).map(p => ({
      layer: 'letter' as const,
      path: p,
      ok: fs.existsSync(p),
    })),
    ...taxInvoiceFilePaths(taxDir).map(p => ({
      layer: 'tax' as const,
      path: p,
      ok: fs.existsSync(p),
    })),
    {
      layer: 'ledger' as const,
      path: ledgerPath,
      ok: fs.existsSync(ledgerPath),
    },
    {
      layer: 'ledgerDetail' as const,
      path: ledgerDetailPdf,
      ok: fs.existsSync(ledgerDetailPdf),
    },
  ];

  const missing = checks.filter(c => !c.ok);
  return { ok: missing.length === 0, missing, checks };
}
