'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ClientRecord } from '@/app/types/client';
import { getClientDouzoneCode } from '@/app/utils/clientsGrouping';
import { buildClientDetailHref } from '@/app/utils/clientDetailNav';
import { formatBusinessNo, formatPersonOrCorpId } from '@/app/utils/idFormat';
import { formatPhoneWithContactName } from '@/app/utils/clientPhone';

/** 목록·헤더 공통 열 너비 */
export const CLIENT_ROW_GRID =
  'grid grid-cols-[minmax(0,2fr)_3.5rem_8.5rem_8.5rem_minmax(0,1.25fr)] gap-x-4';

export const CLIENT_ROW_GRID_NO_CODE =
  'grid grid-cols-[minmax(0,2.1fr)_8.5rem_8.5rem_minmax(0,1.35fr)] gap-x-4';

function Highlight({ text, query }: { text: string; query?: string }) {
  if (!text) return null;
  const q = query?.trim();
  if (!q) return <span>{text}</span>;
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-amber-200 text-gray-900 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </span>
  );
}

function dash(value: string): string {
  return value.trim() || '—';
}

export function ClientListHeader({ showCode }: { showCode: boolean }) {
  const label = 'portal-table-head uppercase';
  const grid = showCode ? CLIENT_ROW_GRID : CLIENT_ROW_GRID_NO_CODE;
  return (
    <div
      className={`${grid} items-center px-4 py-3 border-b border-gray-200 bg-slate-50 sticky top-0 z-10 backdrop-blur-sm`}
    >
      <span className={label}>업체명</span>
      {showCode && <span className={`${label} text-right`}>코드</span>}
      <span className={label}>사업자번호</span>
      <span className={label}>주민·법인</span>
      <span className={label}>연락처</span>
    </div>
  );
}

export default function ClientRowLine({
  client,
  query = '',
  returnTo,
  striped,
  showCode = false,
}: {
  client: ClientRecord;
  query?: string;
  returnTo?: string;
  striped?: boolean;
  showCode?: boolean;
}) {
  const router = useRouter();
  const isChurned = client.status === 'churned';
  const biz = formatBusinessNo(client.businessNo);
  const idNo = formatPersonOrCorpId(client.residentNo, client.corporateNo);
  const phone = formatPhoneWithContactName(client.phone, client.primaryContactName);
  const statusLabel = String(client.intakeData?.statusLabel ?? '').trim();
  const code = getClientDouzoneCode(client);
  const rep = client.representative?.trim() ?? '';
  const showRep = rep && rep !== client.companyName.trim();
  const grid = showCode ? CLIENT_ROW_GRID : CLIENT_ROW_GRID_NO_CODE;
  const detailPath = `/clients/${client.id}`;
  const href = buildClientDetailHref(client.id, returnTo);

  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={() => router.prefetch(detailPath)}
      onClick={e => {
        if (!returnTo) return;
        e.preventDefault();
        router.push(buildClientDetailHref(client.id, returnTo, window.scrollY));
      }}
      className={[
        'group block border-b border-gray-200/80 transition-colors',
        'hover:bg-blue-50/90 hover:border-blue-100/80',
        'border-l-[3px] border-l-transparent hover:border-l-blue-400',
        striped ? 'bg-slate-50/80' : 'bg-white',
        isChurned ? 'bg-red-50/40 hover:bg-red-50/70 hover:border-l-red-300' : '',
      ].join(' ')}
    >
      <div className={`${grid} items-center px-4 py-3 min-h-[3.5rem]`}>
        <div className="min-w-0">
          <p
            className={[
              'text-base font-semibold leading-snug text-gray-900 truncate group-hover:text-blue-900',
              isChurned ? 'line-through decoration-red-300/80 text-gray-600' : '',
            ].join(' ')}
            title={client.companyName}
          >
            <Highlight text={client.companyName} query={query} />
          </p>
          {showRep && (
            <p className="text-sm text-gray-600 truncate mt-0.5" title={rep}>
              대표 <Highlight text={rep} query={query} />
            </p>
          )}
          {isChurned && (
            <span className="inline-block mt-1 rounded-md bg-red-100 px-2 py-0.5 text-sm font-bold text-red-800">
              {statusLabel || '해임'}
            </span>
          )}
        </div>

        {showCode && (
          <span
            className="text-sm font-mono tabular-nums text-gray-600 text-right truncate"
            title={code || undefined}
          >
            <Highlight text={dash(code)} query={query} />
          </span>
        )}

        <span className="text-sm font-mono tabular-nums text-gray-800 truncate" title={dash(biz)}>
          <Highlight text={dash(biz)} query={query} />
        </span>

        <span className="text-sm font-mono tabular-nums text-gray-800 truncate" title={dash(idNo)}>
          <Highlight text={dash(idNo)} query={query} />
        </span>

        <span className="text-sm text-gray-800 truncate" title={dash(phone)}>
          <Highlight text={dash(phone)} query={query} />
        </span>
      </div>
    </Link>
  );
}
