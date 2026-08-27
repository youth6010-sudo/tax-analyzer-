import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { appConfig } from '@/db/schema';
import { getAppConfig, setAppConfig } from '@/lib/appConfigDb';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

type RateValue = { count: number; resetAt: number };

function asRateValue(raw: unknown): RateValue | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const count = Number(o.count);
  const resetAt = Number(o.resetAt);
  if (!Number.isFinite(count) || !Number.isFinite(resetAt)) return null;
  return { count, resetAt };
}

/** Postgres 공유 카운터 — Vercel 인스턴스 여러 개여도 동일하게 제한 */
export async function checkRateLimit(key: string): Promise<{ ok: boolean; retryAfterSec?: number }> {
  const configKey = `rate:${key}`;
  const now = Date.now();
  const prev = asRateValue(await getAppConfig<RateValue>(configKey));

  if (!prev || now > prev.resetAt) {
    await setAppConfig(configKey, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }

  if (prev.count >= MAX_ATTEMPTS) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((prev.resetAt - now) / 1000)) };
  }

  await setAppConfig(configKey, { count: prev.count + 1, resetAt: prev.resetAt });
  return { ok: true };
}

export async function clearRateLimit(key: string) {
  const db = getDb();
  await db.delete(appConfig).where(eq(appConfig.key, `rate:${key}`));
}
