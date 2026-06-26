// 앱 전역 설정(key-value) — 블루홀 중계기 주소/비밀 등 런타임 구성에 사용
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { appConfig } from '@/db/schema';

export async function getAppConfig<T = Record<string, unknown>>(key: string): Promise<T | null> {
  const db = getDb();
  const [row] = await db.select().from(appConfig).where(eq(appConfig.key, key)).limit(1);
  return row ? (row.value as T) : null;
}

export async function setAppConfig(key: string, value: Record<string, unknown>): Promise<void> {
  const db = getDb();
  await db
    .insert(appConfig)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: new Date() } });
}

export interface BlueholeRelayConfig {
  url: string;
  secret: string;
  updatedAt?: string;
}

/** 사무실 중계기(터널) 주소·비밀. 없으면 null(=직접 호출). */
export async function getBlueholeRelay(): Promise<BlueholeRelayConfig | null> {
  const v = await getAppConfig<BlueholeRelayConfig>('bluehole_relay');
  return v && v.url && v.secret ? v : null;
}

export async function setBlueholeRelay(url: string, secret: string): Promise<void> {
  await setAppConfig('bluehole_relay', { url, secret, updatedAt: new Date().toISOString() });
}
