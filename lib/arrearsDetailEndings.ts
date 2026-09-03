/**
 * 거래처별 현황 시트 말잔.
 * 현황표 잔액과 같으면 「불일치」로 보지 않음
 * (공문 과거내역 합 ≠ 현황표여도, 엑셀 두 파일 말잔이 같으면 OK).
 */
import fs from 'fs';
import path from 'path';
import { getAppConfig, setAppConfig } from '@/lib/appConfigDb';

const FILE_PATH = path.join(process.cwd(), 'data', 'arrears-detail-endings.json');
const CONFIG_KEY = 'arrears_detail_endings';

export type DetailEndingsMap = Record<string, number>;

function normalizeMap(raw: unknown): DetailEndingsMap {
  const out: DetailEndingsMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const code = String(k).trim();
    if (!code || code.startsWith('_')) continue;
    const n = Math.round(Number(v) || 0);
    out[code] = n;
  }
  return out;
}

function readFromFile(): DetailEndingsMap {
  try {
    return normalizeMap(JSON.parse(fs.readFileSync(FILE_PATH, 'utf8')));
  } catch {
    return {};
  }
}

function writeToFile(map: DetailEndingsMap): void {
  const sorted: DetailEndingsMap = {};
  for (const k of Object.keys(map).sort()) sorted[k] = Math.round(Number(map[k]) || 0);
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(FILE_PATH, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

export async function readArrearsDetailEndings(): Promise<DetailEndingsMap> {
  try {
    const fromDb = await getAppConfig<DetailEndingsMap>(CONFIG_KEY);
    if (fromDb && Object.keys(fromDb).length) return normalizeMap(fromDb);
  } catch {
    /* DB unavailable — file */
  }
  return readFromFile();
}

export async function writeArrearsDetailEndings(map: DetailEndingsMap): Promise<void> {
  const sorted: DetailEndingsMap = {};
  for (const k of Object.keys(map).sort()) sorted[k] = Math.round(Number(map[k]) || 0);
  try {
    await setAppConfig(CONFIG_KEY, sorted as unknown as Record<string, unknown>);
  } catch {
    /* ignore */
  }
  try {
    writeToFile(sorted);
  } catch {
    /* Vercel read-only fs — DB write is enough */
  }
}

/** 현황표 잔액과 거래처별 말잔이 같으면 엑셀 정합 */
export function isArrearsExcelBalanceAligned(
  externalCode: string,
  statusBalance: number,
  endings: DetailEndingsMap,
): boolean {
  const end = endings[String(externalCode || '').trim()];
  if (end == null) return false;
  return Math.round(end) === Math.round(statusBalance);
}
