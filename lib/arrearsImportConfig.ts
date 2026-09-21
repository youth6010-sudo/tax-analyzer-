import fs from 'fs';
import path from 'path';
import { getAppConfig, setAppConfig } from '@/lib/appConfigDb';

/**
 * 공문 반영 컷오프 동결일.
 * - 이 날까지 공문 내역은 유지
 * - 거래처별 현황 업로드는 이 날 **이후**(9월~)만 공문에 추가
 * - 목록 「기준일」(statusAsOfDate)은 별도로 수정 가능
 */
export const ARREARS_FROZEN_LETTER_CUTOFF = '2026.08.31';

/** @deprecated 목록 기준일은 수정 가능 — 컷오프만 동결 */
export const ARREARS_FROZEN_AS_OF_DATE = ARREARS_FROZEN_LETTER_CUTOFF;

export type ArrearsImportConfig = {
  /** 현황표·목록 기준일 YYYY.MM.DD (수정 가능) */
  statusAsOfDate: string;
  /** 공문 cutoff — 동결. 이 날짜 이후 내역만 거래처별 상세에서 추가 */
  letterCutoffDate: string;
  updatedAt: string;
};

const CONFIG_KEY = 'arrears_import_config';
const CONFIG_PATH = path.join(process.cwd(), 'data', 'arrears-import-config.json');

const DEFAULTS: ArrearsImportConfig = {
  statusAsOfDate: '2026.08.31',
  letterCutoffDate: ARREARS_FROZEN_LETTER_CUTOFF,
  updatedAt: '',
};

function normalizeConfig(raw: Partial<ArrearsImportConfig> | null | undefined): ArrearsImportConfig {
  return {
    statusAsOfDate: normalizeDotDate(raw?.statusAsOfDate) || DEFAULTS.statusAsOfDate,
    letterCutoffDate: ARREARS_FROZEN_LETTER_CUTOFF,
    updatedAt: raw?.updatedAt || '',
  };
}

function readFromFile(): ArrearsImportConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Partial<ArrearsImportConfig>;
    return normalizeConfig(raw);
  } catch {
    return { ...DEFAULTS, letterCutoffDate: ARREARS_FROZEN_LETTER_CUTOFF };
  }
}

function writeToFile(next: ArrearsImportConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}

/** DB 우선, 없으면 로컬 파일(개발용) */
export async function readArrearsImportConfig(): Promise<ArrearsImportConfig> {
  try {
    const fromDb = await getAppConfig<Partial<ArrearsImportConfig>>(CONFIG_KEY);
    if (fromDb && (fromDb.statusAsOfDate || fromDb.updatedAt)) {
      return normalizeConfig(fromDb);
    }
  } catch {
    /* DB unavailable — file */
  }
  return readFromFile();
}

export async function writeArrearsImportConfig(
  patch?: Partial<ArrearsImportConfig>,
): Promise<ArrearsImportConfig> {
  const cur = await readArrearsImportConfig();
  const next: ArrearsImportConfig = {
    statusAsOfDate:
      normalizeDotDate(patch?.statusAsOfDate) || cur.statusAsOfDate || DEFAULTS.statusAsOfDate,
    letterCutoffDate: ARREARS_FROZEN_LETTER_CUTOFF,
    updatedAt: new Date().toISOString(),
  };

  await setAppConfig(CONFIG_KEY, next as unknown as Record<string, unknown>);

  try {
    writeToFile(next);
  } catch {
    /* Vercel read-only fs — DB write is enough */
  }

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
