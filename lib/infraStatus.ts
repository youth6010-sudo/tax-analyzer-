/**
 * 런타임 인프라 상태 (비밀값 미포함) — UI 칩·관리자 안내용
 */
import { sql } from 'drizzle-orm';
import { getDb } from '@/db';

export type InfraStatus = {
  provider: 'supabase' | 'neon' | 'other';
  region: string;
  regionLabel: string;
  hostKind: string;
  /** 내부 표시용 — Free/Pro는 결제 UI에서 확인, Seoul Supabase면 Pro로 안내 */
  planLabel: string;
  badge: string;
  projectRef: string | null;
  storageConfigured: boolean;
  databaseReady: boolean;
};

function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function userOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return decodeURIComponent(new URL(url).username || '');
  } catch {
    return '';
  }
}

/** pooler user `postgres.<ref>` → project ref */
export function supabaseProjectRefFromDatabaseUrl(url: string | undefined): string | null {
  const user = userOf(url);
  const m = user.match(/^postgres\.([a-z0-9]+)$/i);
  if (m) return m[1];
  const host = hostOf(url);
  const h = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  if (h) return h[1];
  return null;
}

export function getInfraStatus(): InfraStatus {
  const url = process.env.DATABASE_URL;
  const host = hostOf(url);
  const databaseReady = Boolean(url && host);

  let provider: InfraStatus['provider'] = 'other';
  if (/supabase/i.test(host)) provider = 'supabase';
  else if (/neon\.tech/i.test(host)) provider = 'neon';

  let region = 'unknown';
  let regionLabel = '리전 확인 중';
  if (/ap-northeast-2/i.test(host)) {
    region = 'ap-northeast-2';
    regionLabel = '서울';
  } else if (/eu-west-2/i.test(host)) {
    region = 'eu-west-2';
    regionLabel = '런던';
  } else if (/us-east/i.test(host)) {
    region = 'us-east';
    regionLabel = '미국 동부';
  }

  const projectRef = supabaseProjectRefFromDatabaseUrl(url);
  const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const storageConfigured = Boolean(
    serviceKey && (supabaseUrl || projectRef),
  );

  let planLabel = 'DB';
  let badge = 'DB';
  if (provider === 'supabase' && region === 'ap-northeast-2') {
    planLabel = 'Supabase Pro';
    badge = 'Seoul · Pro';
  } else if (provider === 'supabase') {
    planLabel = 'Supabase';
    badge = `Supabase · ${regionLabel}`;
  } else if (provider === 'neon') {
    planLabel = 'Neon';
    badge = `Neon · ${regionLabel}`;
  }

  return {
    provider,
    region,
    regionLabel,
    hostKind: host.includes('pooler') ? 'pooler' : host ? 'direct' : 'none',
    planLabel,
    badge,
    projectRef,
    storageConfigured,
    databaseReady,
  };
}

/** 실제 DB 연결 확인 (`SELECT 1`). 실패해도 throw하지 않음. */
export async function probeDatabaseReady(): Promise<boolean> {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

export function resolveSupabaseUrl(): string | null {
  const explicit = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  if (explicit) return explicit;
  const ref = supabaseProjectRefFromDatabaseUrl(process.env.DATABASE_URL);
  if (ref) return `https://${ref}.supabase.co`;
  return null;
}
