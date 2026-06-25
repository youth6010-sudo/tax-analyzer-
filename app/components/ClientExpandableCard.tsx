'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ChurnSummary, ClientRecord, ClientSearchResult } from '@/app/types/client';
import { BUSINESS_ENTITY_LABEL, SERVICE_TYPE_LABEL } from '@/app/types/contact';
import { TAX_TYPES } from '@/app/config/taxTypes';
import { douzoneExtraEntries } from '@/app/config/douzoneFields';
import { CLIENT_FIELD_LABELS } from '@/app/config/clientFieldLabels';
import { formatPhoneWithContactName } from '@/app/utils/clientPhone';

const TAX_LABEL: Record<string, string> = Object.fromEntries(
  TAX_TYPES.map(t => [t.id, t.label]),
);

function Highlight({ text, query }: { text: string; query?: string }) {
  if (!text) return <span className="text-gray-300">-</span>;
  const q = query?.trim();
  if (!q) return <span>{text}</span>;
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-amber-300 text-gray-900 font-bold rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </span>
  );
}

type Props = {
  client: ClientRecord | ClientSearchResult;
  churn?: ChurnSummary | null;
  query?: string;
  onSelect?: (id: string) => void;
  asLink?: boolean;
};

export default function ClientExpandableCard({ client, churn, query = '', onSelect, asLink = false }: Props) {
  const [expanded, setExpanded] = useState(false);

  const isChurned = client.status === 'churned' && churn;
  const contactLabel =
    'matchedContactName' in client && client.matchedContactName
      ? client.matchedContactName
      : client.primaryContactName;
  const phoneDisplay = formatPhoneWithContactName(client.phone, contactLabel);

  const primary = isChurned
    ? [
        {
          label: '계약 종료',
          value: new Date(churn.churnedAt).toLocaleDateString('ko-KR'),
        },
        { label: '유출 사유', value: churn.reason },
        { label: '유형', value: churn.churnType },
        { label: '자료 정리', value: churn.dataCleanup },
        { label: '전조증상', value: churn.earlySign },
        {
          label: CLIENT_FIELD_LABELS.fee,
          value: churn.feeAmount != null ? `${churn.feeAmount.toLocaleString()}원` : '',
        },
      ]
    : [
        { label: '대표자', value: client.representative },
        { label: '사업자번호', value: client.businessNo, mono: true },
        { label: '전화번호', value: phoneDisplay, mono: true },
        { label: '휴대번호', value: client.mobilePhone, mono: true },
        { label: '담당자', value: client.manager },
      ];

  const extra: { label: string; value: string; mono?: boolean }[] = [
    { label: CLIENT_FIELD_LABELS.corporateNo, value: client.corporateNo, mono: true },
    { label: CLIENT_FIELD_LABELS.residentNo, value: client.residentNo, mono: true },
    { label: '팩스', value: client.fax, mono: true },
    ...(client.feeSummary != null ? [{ label: CLIENT_FIELD_LABELS.fee, value: client.feeSummary.toLocaleString() }] : []),
    ...(client.program ? [{ label: '프로그램', value: client.program }] : []),
    ...douzoneExtraEntries(client.intakeData ?? {}),
  ].filter(f => f.value && String(f.value).trim() !== '');

  const inner = (
    <>
      <div className="px-3 py-2.5 bg-blue-50 border-b border-blue-100 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black leading-snug text-gray-900">
            <Highlight text={client.companyName} query={query} />
            {client.status === 'intake' && (
              <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">유입중</span>
            )}
            {client.status === 'churned' && (
              <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-200 text-red-900">유출</span>
            )}
          </h3>
        </div>
        {extra.length > 0 && (
          <span
            role="presentation"
            onClick={e => { e.preventDefault(); e.stopPropagation(); setExpanded(v => !v); }}
            className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 cursor-pointer select-none"
          >
            {expanded ? '접기' : '더보기'}
          </span>
        )}
      </div>

      <div className="p-2.5 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {primary.map(({ label, value, mono }) => (
          <div key={label} className="rounded-lg px-2 py-1.5 text-[11px] bg-gray-50">
            <span className="text-[9px] font-bold text-gray-400 block">{label}</span>
            <span className={`font-semibold text-gray-800 ${mono ? 'font-mono' : ''}`}>
              <Highlight text={value || '-'} query={query} />
            </span>
          </div>
        ))}
      </div>

      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-gray-100">
          {isChurned && churn.detail.trim() && (
            <div className="rounded-lg px-2 py-1.5 text-[11px] bg-red-50 mt-2">
              <span className="text-[9px] font-bold text-red-400 block">상세 메모</span>
              <span className="font-semibold text-gray-800 whitespace-pre-line">{churn.detail}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-1 pt-2">
            {client.businessEntityType && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                {BUSINESS_ENTITY_LABEL[client.businessEntityType]}
              </span>
            )}
            {client.serviceTypes.map(t => (
              <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                {SERVICE_TYPE_LABEL[t]}
              </span>
            ))}
            {client.taxTypes.map(t => (
              <span key={t} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                {TAX_LABEL[t] ?? t}
              </span>
            ))}
          </div>
          {extra.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {extra.map(({ label, value, mono }) => (
                <div key={label} className="rounded-lg px-2 py-1.5 text-[11px] bg-gray-50/80">
                  <span className="text-[9px] font-bold text-gray-400 block">{label}</span>
                  <span className={`font-semibold text-gray-800 whitespace-pre-line ${mono ? 'font-mono' : ''}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  const cls = 'block w-full text-left rounded-xl border border-gray-100 bg-white overflow-hidden hover:border-blue-300 hover:shadow-md transition-all';

  if (asLink) {
    return (
      <Link href={`/clients/${client.id}`} className={cls}>
        {inner}
      </Link>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(client.id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(client.id);
        }
      }}
      className={cls}
    >
      {inner}
    </div>
  );
}
