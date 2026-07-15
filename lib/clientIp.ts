/**
 * 클라이언트 IP 추출·정규화·allowlist 매칭 (청년들 ID 회사망 제한 등)
 */

/** IPv4-mapped IPv6 → IPv4, 소문자·trim */
export function normalizeIp(raw: string): string {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }
  // "a.b.c.d:port" (일부 프록시) — IPv6 콜론과 구분
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);
  if (ipv4WithPort) ip = ipv4WithPort[1];
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice('::ffff:'.length);
  }
  return ip;
}

/** x-forwarded-for 첫 값 우선, 없으면 x-real-ip */
export function clientIpFromHeaders(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }
  const real = headers.get('x-real-ip');
  if (real) return normalizeIp(real);
  return '';
}

export function parseIpAllowlist(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map(normalizeIp)
    .filter(Boolean);
}

export function isIpInAllowlist(ip: string, allowlist: string[]): boolean {
  if (!ip || allowlist.length === 0) return false;
  const normalized = normalizeIp(ip);
  return allowlist.some(allowed => allowed === normalized);
}

const DEV_LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * 청년들 ID 접근용 IP 허용 여부.
 * - production: YOUTH_IDS_ALLOWED_IPS 에 있을 때만 (비어 있으면 fail-closed)
 * - development: loopback 항상 허용 + allowlist에 있으면 허용
 */
export function isYouthIdsIpAllowed(
  ip: string,
  allowlistRaw: string | undefined | null = process.env.YOUTH_IDS_ALLOWED_IPS,
): boolean {
  const allowlist = parseIpAllowlist(allowlistRaw);
  const normalized = normalizeIp(ip);

  if (process.env.NODE_ENV === 'development') {
    if (DEV_LOOPBACK.has(normalized)) return true;
    if (allowlist.length > 0) return isIpInAllowlist(normalized, allowlist);
    return true;
  }

  return isIpInAllowlist(normalized, allowlist);
}
