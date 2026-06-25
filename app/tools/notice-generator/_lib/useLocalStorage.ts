import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';

// 값을 localStorage에 저장/복원하는 훅.
// useSyncExternalStore + getServerSnapshot로 SSR·하이드레이션 첫 렌더는 initialValue를
// 사용하고(서버와 일치 → 하이드레이션 불일치 방지), 이후 클라이언트에서 localStorage 값을 읽는다.
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  // initialValue 참조를 1회 고정 (스냅샷 반환값의 참조 안정성 확보 → 무한 렌더 방지)
  const [initialStable] = useState(initialValue);
  // raw 문자열이 같으면 동일 파싱 결과를 반환하는 캐시
  const cache = useRef<{ raw: string | null; parsed: T }>({
    raw: null,
    parsed: initialStable,
  });

  const subscribe = useCallback(
    (onChange: () => void) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) onChange();
      };
      window.addEventListener('storage', onStorage);
      window.addEventListener(`local-storage:${key}`, onChange);
      return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(`local-storage:${key}`, onChange);
      };
    },
    [key]
  );

  const getSnapshot = useCallback((): T => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === cache.current.raw) return cache.current.parsed;
      const parsed = raw !== null ? (JSON.parse(raw) as T) : initialStable;
      cache.current = { raw, parsed };
      return parsed;
    } catch {
      return initialStable;
    }
  }, [key, initialStable]);

  const getServerSnapshot = useCallback(() => initialStable, [initialStable]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    action => {
      const current = getSnapshot();
      const next =
        typeof action === 'function' ? (action as (prev: T) => T)(current) : action;
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // 저장 실패(용량/권한)는 조용히 무시
      }
      // 같은 탭 내 다른 인스턴스에 변경 알림
      window.dispatchEvent(new Event(`local-storage:${key}`));
    },
    [key, getSnapshot]
  );

  return [value, setValue];
}
