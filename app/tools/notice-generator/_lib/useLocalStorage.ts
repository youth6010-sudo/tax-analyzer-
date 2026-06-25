import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

// 값을 localStorage에 저장/복원하는 훅.
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 저장 실패(용량/권한)는 조용히 무시
    }
  }, [key, value]);

  return [value, setValue];
}
