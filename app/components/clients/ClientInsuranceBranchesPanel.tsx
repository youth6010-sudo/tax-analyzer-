'use client';

import { useEffect, useMemo, useState } from 'react';
import { PortalToolTabs } from '@/app/components/portal/PortalPageShell';
import {
  portalBtnSecondary,
  portalCard,
  portalEmptyState,
  portalFooterMeta,
  portalInput,
} from '@/app/components/portal/uiClasses';
import nhisData from '@/data/nhis-branches.json';
import npsData from '@/data/nps-branches.json';
import comwelData from '@/data/comwel-branches.json';
import {
  filterInsuranceBranches,
  INSURANCE_ORGS,
  type InsuranceBranch,
  type InsuranceBranchDataset,
  type InsuranceOrgId,
} from '@/app/utils/nhisBranches';

const DATASETS: Record<InsuranceOrgId, InsuranceBranchDataset> = {
  nhis: nhisData as InsuranceBranchDataset,
  nps: npsData as InsuranceBranchDataset,
  comwel: comwelData as InsuranceBranchDataset,
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      className={`${portalBtnSecondary} !px-2 !py-1 text-[11px]`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1200);
        } catch {
          /* noop */
        }
      }}
    >
      {done ? '복사됨' : label}
    </button>
  );
}

function prioritizeContacts(branch: InsuranceBranch) {
  const contacts = (branch.departmentPhones ?? []).filter(item => item.phone || item.fax);
  return [...contacts].sort((a, b) => {
    const score = (item: { label: string; role?: string; phone?: string }) => {
      const hay = `${item.label} ${item.role || ''}`;
      let value = item.phone ? 4 : 0;
      if (/지사장|총괄|행정지원|가입지원|연금지급|대표/.test(hay)) value += 6;
      if (/센터|TF|지원팀/.test(hay)) value -= 1;
      return value;
    };
    return score(b) - score(a);
  });
}

function ResultCard({ branch }: { branch: InsuranceBranch }) {
  const priorityContacts = prioritizeContacts(branch);
  const topContacts = priorityContacts.slice(0, 2);
  const restContacts = priorityContacts.slice(2);

  return (
    <article className={`${portalCard} p-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="text-sm font-bold text-slate-900">{branch.shortName}</h4>
            {branch.role ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {branch.role}
              </span>
            ) : null}
          </div>
          {branch.hqName ? <p className="mt-0.5 text-[11px] text-slate-500">{branch.hqName}</p> : null}
        </div>
        <div className="flex items-start gap-1.5">
          <div className="text-right">
            <p className="text-[10px] font-medium text-slate-400">대표번호</p>
            <p className="text-base font-semibold tabular-nums text-slate-900">{branch.phone || '—'}</p>
            {branch.fax ? <p className="text-[11px] tabular-nums text-slate-500">팩스 {branch.fax}</p> : null}
          </div>
          <CopyButton text={branch.phone} label="전화" />
          {branch.fax ? <CopyButton text={branch.fax} label="팩스" /> : null}
        </div>
      </div>

      {branch.jurisdiction ? (
        <p className="mt-2 rounded-lg bg-blue-50/70 px-3 py-2 text-[11px] leading-relaxed text-blue-900">
          <span className="mr-1.5 font-semibold text-blue-600">관할</span>
          {branch.jurisdiction}
        </p>
      ) : null}

      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
        {branch.zip ? <span className="mr-1.5 tabular-nums text-slate-400">({branch.zip})</span> : null}
        {branch.address || '—'}
      </p>

      {topContacts.length ? (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 p-2">
          <p className="mb-1 text-[11px] font-semibold text-slate-600">핵심 연락처</p>
          <ul className="space-y-1.5 text-[11px] text-slate-700">
            {topContacts.map((item, idx) => (
              <li key={`${item.label}-${item.phone}-${idx}`} className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800">{item.label}</p>
                  {item.role ? <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">{item.role}</p> : null}
                </div>
                <div className="shrink-0 text-right">
                  {item.phone ? <p className="font-semibold tabular-nums text-slate-900">{item.phone}</p> : null}
                  {item.fax ? <p className="text-[10px] tabular-nums text-slate-500">팩스 {item.fax}</p> : null}
                </div>
              </li>
            ))}
          </ul>
          {restContacts.length ? (
            <details className="mt-2 text-[11px] text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-500">나머지 연락처 {restContacts.length}건</summary>
              <ul className="mt-2 space-y-1">
                {restContacts.map((item, idx) => (
                  <li key={`${item.label}-${item.phone}-rest-${idx}`} className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <span className="font-medium text-slate-800">{item.label}</span>
                    {item.role ? <span className="text-slate-500">{item.role}</span> : null}
                    {item.phone ? <span className="tabular-nums">{item.phone}</span> : null}
                    {item.fax ? <span className="tabular-nums text-slate-500">팩스 {item.fax}</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : branch.departmentPhones?.length ? (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 p-2">
          <p className="mb-1 text-[11px] font-semibold text-slate-600">업무별 연락처</p>
          <ul className="space-y-1 text-[11px] text-slate-700">
            {branch.departmentPhones.slice(0, 2).map((item, idx) => (
              <li key={`${item.label}-${item.phone}-${idx}`} className="flex flex-wrap gap-x-2 gap-y-0.5">
                <span className="font-medium text-slate-800">{item.label}</span>
                {item.role ? <span className="text-slate-500">{item.role}</span> : null}
                {item.phone ? <span className="tabular-nums">{item.phone}</span> : null}
                {item.fax ? <span className="tabular-nums text-slate-500">팩스 {item.fax}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export default function ClientInsuranceBranchesPanel({ address }: { address?: string }) {
  const addressText = String(address ?? '').trim();
  const [org, setOrg] = useState<InsuranceOrgId>('nhis');
  const [query, setQuery] = useState(addressText);

  useEffect(() => {
    setQuery(addressText);
  }, [addressText]);

  const data = DATASETS[org];
  const results = useMemo(() => filterInsuranceBranches(data.branches, query, 6), [data.branches, query]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          수임처 주소를 검색어로 자동 적용합니다.
          {!addressText ? ' 주소가 없으면 수동 검색으로만 찾을 수 있습니다.' : ''}
        </p>
        {addressText ? (
          <button
            type="button"
            className={`${portalBtnSecondary} !px-2 !py-1 text-[11px]`}
            onClick={() => setQuery(addressText)}
          >
            주소 다시 적용
          </button>
        ) : null}
      </div>

      <PortalToolTabs
        className="mb-3"
        value={org}
        onChange={setOrg}
        tabs={INSURANCE_ORGS.map(o => ({ id: o.id, label: o.shortLabel, accent: o.accent }))}
      />

      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={addressText || '주소나 지사명으로 검색'}
        className={`${portalInput} mb-2 w-full text-sm`}
      />

      <p className={`${portalFooterMeta} mb-3`}>
        {INSURANCE_ORGS.find(o => o.id === org)?.label} · {data.branches.length}개 기관
        {query.trim() ? ` · ${results.length}건` : ''}
      </p>

      {!query.trim() ? (
        <div className={portalEmptyState}>
          <p className="font-medium text-slate-700">주소가 비어 있습니다</p>
          <p className="mt-1 text-sm text-slate-500">위 검색창에 지역·구·동을 입력하면 바로 찾을 수 있습니다.</p>
        </div>
      ) : results.length === 0 ? (
        <div className={portalEmptyState}>
          <p className="font-medium text-slate-700">검색 결과가 없습니다</p>
          <p className="mt-1 text-sm text-slate-500">긴 주소는 시·구·동 위주로 자동 정리해 다시 찾습니다. 그래도 없으면 지사명으로 검색해 보세요.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {results.map(branch => (
            <li key={`${org}-${branch.id}`}>
              <ResultCard branch={branch} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
