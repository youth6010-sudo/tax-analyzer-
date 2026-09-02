import fs from 'fs';
import path from 'path';

export type ArrearsImportConfig = {
  /** 현황표 기준일 YYYY.MM.DD */
  statusAsOfDate: string;
  /** 공문 고정 cutoff — 이 날짜 이후 내역만 거래처별 상세에서 추가 */
  letterCutoffDate: string;
  updatedAt: string;
};

const CONFIG_PATH = path.join(process.cwd(), 'data', 'arrears-import-config.json');

const DEFAULTS: ArrearsImportConfig = {
  statusAsOfDate: '2026.08.31',
  letterCutoffDate: '2026.07.27',
  updatedAt: '',
};

export function readArrearsImportConfig(): ArrearsImportConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Partial<ArrearsImportConfig>;
    return {
      statusAsOfDate: normalizeDotDate(raw.statusAsOfDate) || DEFAULTS.statusAsOfDate,
      letterCutoffDate: normalizeDotDate(raw.letterCutoffDate) || DEFAULTS.letterCutoffDate,
      updatedAt: raw.updatedAt || '',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeArrearsImportConfig(patch: Partial<ArrearsImportConfig>): ArrearsImportConfig {
  const cur = readArrearsImportConfig();
  const next: ArrearsImportConfig = {
    statusAsOfDate: normalizeDotDate(patch.statusAsOfDate) || cur.statusAsOfDate,
    letterCutoffDate: normalizeDotDate(patch.letterCutoffDate) || cur.letterCutoffDate,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

/** YYYY.MM.DD | YYYY-MM-DD → YYYY.MM.DD */
export function normalizeDotDate(s?: string | null): string {
  const t = String(s || '').trim();
  if (!t) return '';
  const m = t.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})$/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  const m2 = t.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (m2) {
    const yy = Number(m2[1]);
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    return `${year}.${m2[2]}.${m2[3]}`;
  }
  return t;
}

/** 비교용 ISO YYYY-MM-DD */
export function toIsoDate(dotOrIso: string): string {
  const n = normalizeDotDate(dotOrIso);
  const m = n.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return n;
}

export function isAfterCutoff(eventIso: string, cutoffDot: string): boolean {
  const ev = toIsoDate(eventIso);
  const cut = toIsoDate(cutoffDot);
  return ev > cut;
}
