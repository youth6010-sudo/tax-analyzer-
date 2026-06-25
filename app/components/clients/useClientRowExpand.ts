'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildClientDetailHref } from '@/app/utils/clientDetailNav';

/** 업체명 클릭: 펼침/접기 토글 */
export function useClientRowExpand(clientId: string, returnTo?: string) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const prefetchDetail = useCallback(() => {
    router.prefetch(`/clients/${clientId}`);
  }, [router, clientId]);

  const onNameClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setExpanded(prev => !prev);
    },
    [],
  );

  const goToDetail = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      if (returnTo) {
        router.push(buildClientDetailHref(clientId, returnTo, window.scrollY));
      } else {
        router.push(`/clients/${clientId}`);
      }
    },
    [clientId, returnTo, router],
  );

  const nameButtonClass = [
    'text-left font-semibold text-slate-900 hover:text-blue-800',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 rounded-sm',
    'cursor-pointer transition-colors min-w-0 truncate',
  ].join(' ');

  return { expanded, onNameClick, goToDetail, prefetchDetail, nameButtonClass };
}
