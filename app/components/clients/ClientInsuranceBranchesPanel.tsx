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
import { formatBusinessNo } from '@/app/utils/idFormat';
import {
  CONTACT_PURPOSE_CHIPS,
  contactPurposeTags,
  filterContactsByPurpose,
  filterInsuranceBranches,
  formatContactNumberRanges,
  hasVisibleContact,
  INSURANCE_ORGS,
  rankContactsForOffice,
  type ContactPurposeId,
  type InsuranceBranch,
  type InsuranceBranchDataset,
  type InsuranceDeptContact,
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

function CallContextBanner({
  businessNo,
  companyName,
}: {
  businessNo?: string;
  companyName?: string;
}) {
  const formatted = businessNo ? formatBusinessNo(businessNo) : '';
  if (!formatted && !companyName?.trim()) return null;
  return (
    <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5">
      <p className="text-[11px] font-semibold text-emerald-700">통화 시 알려줄 정보</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {companyName?.trim() ? (
          <p className="text-sm font-semibold text-slate-900">{companyName.trim()}</p>
        ) : null}
        {formatted ? (
          <>
            <p className="text-sm font-semibold tabular-nums text-slate-900">{formatted}</p>
            <CopyButton text={formatted} label="사업자번호 복사" />
          </>
        ) : null}
      </div>
    </div>
  );
}

function ContactRow({ item, showTags = false }: { item: InsuranceDeptContact; showTags?: boolean }) {
  const phones = formatContactNumberRanges(item.phone);
  const faxes = formatContactNumberRanges(item.fax);
  const tags = showTags ? contactPurposeTags(item) : [];
  return (
    <li className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          <p className="font-medium text-slate-800">{item.label}</p>
          {tags.map(tag => (
            <span
              key={tag}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700"
            >
              {tag}
            </span>
          ))}
        </div>
        {item.role ? <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">{item.role}</p> : null}
      </div>
      <div className="shrink-0 text-right">
        {phones.length ? (
          <p className="font-semibold tabular-nums text-slate-900">{phones.join(', ')}</p>
        ) : (
          <p className="text-[10px] text-slate-400">번호 없음</p>
        )}
        {faxes.length ? (
          <p className="text-[10px] tabular-nums text-slate-500">팩스 {faxes.join(', ')}</p>
        ) : null}
      </div>
    </li>
  );
}

function ResultCard({ branch, org }: { branch: InsuranceBranch; org: InsuranceOrgId }) {
  const allContacts = useMemo(
    () => (branch.departmentPhones ?? []).filter(hasVisibleContact),
    [branch.departmentPhones],
  );
  const ranked = useMemo(() => rankContactsForOffice(allContacts, org), [allContacts, org]);
  const [purpose, setPurpose] = useState<ContactPurposeId>('recommend');

  const filtered = useMemo(() => {
    if (purpose === 'recommend') return ranked;
    return filterContactsByPurpose(allContacts, org, purpose);
  }, [allContacts, org, purpose, ranked]);

  let displayTop: InsuranceDeptContact[];
  let restContacts: InsuranceDeptContact[];
  if (purpose === 'recommend') {
    displayTop = ranked.slice(0, 3);
    restContacts = ranked.slice(3);
  } else if (purpose === 'all') {
    displayTop = filtered.slice(0, 6);
    restContacts = filtered.slice(6);
  } else {
    displayTop = filtered.slice(0, 4);
    restContacts = filtered.slice(4);
  }

  const phoneDisplay = formatContactNumberRanges(branch.phone);
  const faxDisplay = formatContactNumberRanges(branch.fax);

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
            <p className="text-base font-semibold tabular-nums text-slate-900">
              {phoneDisplay[0] || branch.phone || '—'}
            </p>
            {faxDisplay.length ? (
              <p className="text-[11px] tabular-nums text-slate-500">팩스 {faxDisplay.join(', ')}</p>
            ) : null}
          </div>
          {phoneDisplay.length ? <CopyButton text={phoneDisplay[0]} label="전화" /> : null}
          {faxDisplay.length ? <CopyButton text={faxDisplay[0]} label="팩스" /> : null}
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

      {allContacts.length ? (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 p-2">
          <p className="mb-1.5 text-[11px] font-semibold text-slate-600">업무별 연락처</p>
          <div className="mb-2 flex flex-wrap gap-1">
            {CONTACT_PURPOSE_CHIPS.map(chip => {
              const checked = purpose === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setPurpose(chip.id)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    checked
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-500'
                  }`}
                  aria-pressed={checked}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
          {filtered.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              이 지사에 해당 업무 번호가 없습니다. 위 대표번호로 문의해 주세요.
            </p>
          ) : (
            <ul className="space-y-1.5 text-[11px] text-slate-700">
              {displayTop.map((item, idx) => (
                <ContactRow
                  key={`${item.label}-${item.phone}-${idx}`}
                  item={item}
                  showTags={purpose === 'recommend'}
                />
              ))}
            </ul>
          )}
          {restContacts.length ? (
            <details className="mt-2 text-[11px] text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-500">나머지 연락처 {restContacts.length}건</summary>
              <ul className="mt-2 space-y-1.5">
                {restContacts.map((item, idx) => (
                  <ContactRow key={`${item.label}-${item.phone}-rest-${idx}`} item={item} />
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function ClientInsuranceBranchesPanel({
  address,
  businessNo,
  companyName,
}: {
  address?: string;
  businessNo?: string;
  companyName?: string;
}) {
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
      <CallContextBanner businessNo={businessNo} companyName={companyName} />

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
            <li key={branch.id}>
              <ResultCard branch={branch} org={org} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
