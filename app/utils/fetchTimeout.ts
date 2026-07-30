/** 로딩 UI를 붙잡는 fetch에 공통 타임아웃을 건다. */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const { signal: outer, ...rest } = init;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal =
    outer && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([outer, timeout])
      : timeout;
  return fetch(input, { ...rest, signal });
}
