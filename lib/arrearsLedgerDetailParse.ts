/**
 * 거래처원장(총괄내용) PDF — 2026 상세 차변/대변
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

export type LedgerDetailTx = {
  eventDate: string;
  description: string;
  amount: number;
  kind: 'debit' | 'credit';
};

export type LedgerDetailCompany = {
  externalCode: string;
  companyName: string;
  txs: LedgerDetailTx[];
};

export type LedgerDetailParseResult = {
  companies: LedgerDetailCompany[];
  companyCount: number;
  txCount: number;
  debitCount: number;
  creditCount: number;
};

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseLedgerDetailPdf(filePath: string): LedgerDetailParseResult {
  const py = path.join(repoRoot, 'scripts', 'parse-ledger-detail-pdf.py');
  const outJson = path.join(repoRoot, '.tmp-ledger-detail-parse.json');
  const r = spawnSync('python', [py, filePath, outJson], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(
      `원장 상세 PDF 파싱 실패: ${r.stderr || r.stdout || `exit ${r.status}`}`,
    );
  }
  if (!fs.existsSync(outJson)) {
    throw new Error('원장 상세 PDF 파싱 결과 파일이 없습니다.');
  }
  const raw = JSON.parse(fs.readFileSync(outJson, 'utf8')) as LedgerDetailParseResult & {
    error?: string;
  };
  try {
    fs.unlinkSync(outJson);
  } catch {
    /* ignore */
  }
  if (raw.error) throw new Error(raw.error);
  return {
    companies: raw.companies || [],
    companyCount: raw.companyCount || 0,
    txCount: raw.txCount || 0,
    debitCount: raw.debitCount || 0,
    creditCount: raw.creditCount || 0,
  };
}

/** 지급일 표시 — 공문 형식과 맞춤 (예: 1월 16일) */
export function ledgerDetailPaidDateLabel(isoDate: string): string {
  const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    const s = String(isoDate || '').trim();
    // YYYYMMDD → M월 D일
    const ymd = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (ymd) return `${Number(ymd[2])}월 ${Number(ymd[3])}일`;
    return s;
  }
  const month = Number(m[2]);
  const day = Number(m[3]);
  return `${month}월 ${day}일`;
}

/**
 * 공문「세무조정료·법인세 신고/성실」↔ PDF「법인조정료」동일 금액 중복 판별용
 */
export function isLetterCorpFeeDescription(description: string): boolean {
  const d = String(description || '').replace(/\s+/g, '');
  if (/세무조정|법인조정/.test(d)) return true;
  if (/법인세/.test(d) && /(신고|성실|조정|수수료)/.test(d)) return true;
  return false;
}

function normalizeVatShopToken(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .replace(/[폐페]/g, '페')
    .replace(/스터디카페/gi, '스터디카페')
    .toLowerCase();
}

/**
 * 공문「2026년 6월」↔ PDF「6월 기장수수료」등 청구 중복키.
 * eventDate(YYYY-MM-DD)가 있으면 연도 없는「기타수수료 N월」에 PDF 연도를 쓴다.
 */
export function ledgerDetailChargeDedupKey(
  description: string,
  amount: number,
  eventDate?: string,
): string {
  const amt = Math.round(amount);
  const d = String(description || '').replace(/\s+/g, '');
  if (!d) return `|${amt}`;

  if (/성실/.test(d)) {
    return `성실|${amt}`;
  }
  if (/조정/.test(d)) {
    // 공문「세무조정료」≡ PDF「법인조정료」. 개인조정료·조정수수료는 별도
    if (/법인|세무조정/.test(d)) return `법인조정|${amt}`;
    return `조정|${amt}`;
  }

  // 부가세신고-르엘 / 부가세 신고 - 스테이s → 상호 단위
  // 상호 없는「부가세신고」는 월별로 구분 (1월·7월 동액 중복 방지)
  if (/부가세/.test(d)) {
    const shop = d
      .replace(/^.*부가세(?:신고)?[-:]?/i, '')
      .replace(/신고/g, '');
    if (shop) return `부가세:${normalizeVatShopToken(shop)}|${amt}`;
    let ym = '';
    if (eventDate && /^\d{4}-\d{2}/.test(eventDate)) {
      ym = `:${eventDate.slice(0, 7)}`;
    }
    return `부가세${ym}|${amt}`;
  }

  // 2026년 6월 / 6월 기장수수료 / 2025년 기타수수료 7월
  const withYear = d.match(/((?:20)?\d{2})년.*?(\d{1,2})월/);
  const monthOnly = d.match(/(\d{1,2})월/);
  const monthFee =
    withYear && (/기장|수수료|기타/.test(d) || /(?:20)?\d{2}년\d{1,2}월$/.test(d))
      ? { yy: withYear[1], month: withYear[2] }
      : monthOnly &&
          (/기장|수수료/.test(d) || /기타/.test(d) || /^\d{1,2}월$/.test(d))
        ? { yy: null as string | null, month: monthOnly[1] }
        : null;
  if (monthFee) {
    let yy: number | null = monthFee.yy != null ? Number(monthFee.yy) : null;
    if (yy == null && eventDate && /^\d{4}/.test(eventDate)) {
      yy = Number(eventDate.slice(0, 4)) % 100;
    }
    if (yy == null) yy = 26;
    if (yy >= 100) yy = yy % 100;
    const year = 2000 + yy;
    const month = String(Number(monthFee.month)).padStart(2, '0');
    const kind = /기타/.test(d) ? '기타월' : '기장월';
    return `${kind}:${year}-${month}|${amt}`;
  }

  return `${d}|${amt}`;
}

/** 공문「기타수수료 N월」연도 추론: 직전 줄「2025년 N월」 */
export function inheritYearForMonthFeeDesc(
  description: string,
  prevDescription?: string,
): string {
  const d = String(description || '').replace(/\s+/g, '');
  if (/(?:20)?\d{2}년/.test(d)) return description;
  if (!/기타/.test(d) && !/^\d{1,2}월$/.test(d)) return description;
  const prev = String(prevDescription || '').replace(/\s+/g, '');
  const ym = prev.match(/(20\d{2}|\d{2})년(\d{1,2})월/);
  if (!ym) return description;
  const year = ym[1].length === 2 ? `20${ym[1]}` : ym[1];
  const month = Number(ym[2]);
  if (/기타/.test(d)) return `${year}년 기타수수료 ${month}월`;
  return `${year}년 ${month}월`;
}
