'use client';

import { useMemo, useState } from 'react';
import PortalPageShell, {
  PortalPageHeader,
  PortalToolTabs,
} from '@/app/components/portal/PortalPageShell';
import { PageHeaderIcon } from '@/app/components/dashboard/SidebarNavIcon';
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
  const [ok, setOk] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      className={`${portalBtnSecondary} !px-2 !py-1 text-[11px]`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          window.setTimeout(() => setOk(false), 1200);
        } catch {
          /* ignore */
        }
      }}
    >
      {ok ? '복사됨' : label}
    </button>
  );
}

function extractRegionTags(text: string) {
  const matches = String(text || '').match(/[가-힣]+(?:시|군|구)/g) ?? [];
  return [...new Set(matches)].slice(0, 4);
}

function ContactNumberBlock({
  value,
  label,
  compact = false,
}: {
  value?: string;
  label?: string;
  compact?: boolean;
}) {
  const numbers = formatContactNumberRanges(value);
  if (!numbers.length) return null;

  if (compact) {
    return (
      <p className="font-semibold tabular-nums break-all text-slate-900">
        {label ? `${label} ` : ''}
        {numbers.join(', ')}
      </p>
    );
  }

  return (
    <div>
      {numbers.map(number => (
        <p key={`${label || 'num'}-${number}`} className="font-semibold tabular-nums break-all text-slate-900">
          {label ? `${label} ` : ''}
          {number}
        </p>
      ))}
    </div>
  );
}

function ContactListItem({ item, showTags = false }: { item: InsuranceDeptContact; showTags?: boolean }) {
  const tags = showTags ? contactPurposeTags(item) : [];
  return (
    <li className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1">
          <p className="font-medium break-words text-slate-800">{item.label}</p>
          {tags.map(tag => (
            <span
              key={tag}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700"
            >
              {tag}
            </span>
          ))}
        </div>
        {item.role ? (
          <p className="mt-0.5 break-words text-[10px] leading-relaxed text-slate-500">{item.role}</p>
        ) : null}
      </div>
      <div className="max-w-[58%] shrink-0 text-right">
        <ContactNumberBlock value={item.phone} compact />
        <ContactNumberBlock value={item.fax} label="팩스" compact />
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
  const regionTags = extractRegionTags(branch.jurisdiction);
  const [purpose, setPurpose] = useState<ContactPurposeId>('recommend');
  const [contactQuery, setContactQuery] = useState('');

  const purposeFiltered = useMemo(() => {
    if (purpose === 'recommend') return ranked;
    return filterContactsByPurpose(allContacts, org, purpose);
  }, [allContacts, org, purpose, ranked]);

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim();
    if (!q) return purposeFiltered;
    return purposeFiltered.filter(item =>
      `${item.label} ${item.role || ''} ${item.phone || ''} ${item.fax || ''}`.includes(q),
    );
  }, [contactQuery, purposeFiltered]);

  let displayTop: InsuranceDeptContact[];
  let restContacts: InsuranceDeptContact[];
  if (contactQuery.trim()) {
    displayTop = filteredContacts;
    restContacts = [];
  } else if (purpose === 'recommend') {
    displayTop = ranked.slice(0, 3);
    restContacts = ranked.slice(3);
  } else if (purpose === 'all') {
    displayTop = filteredContacts.slice(0, 6);
    restContacts = filteredContacts.slice(6);
  } else {
    displayTop = filteredContacts.slice(0, 4);
    restContacts = filteredContacts.slice(4);
  }

  const hasAnyContacts = allContacts.length > 0;
  const showPurposeEmpty = hasAnyContacts && filteredContacts.length === 0;

  return (
    <article className={`${portalCard} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-base font-bold text-slate-900">{branch.shortName}</h2>
            {branch.role ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {branch.role}
              </span>
            ) : null}
          </div>
          {branch.hqName ? <p className="mt-0.5 text-[11px] text-slate-500">{branch.hqName}</p> : null}
        </div>
        <div className="flex flex-wrap gap-1">
          <CopyButton text={branch.address} label="주소 복사" />
          <CopyButton text={branch.phone} label="전화 복사" />
          {branch.fax ? <CopyButton text={branch.fax} label="팩스 복사" /> : null}
        </div>
      </div>

      {branch.jurisdiction ? (
        <p className="mt-3 rounded-lg bg-blue-50/70 px-3 py-2 text-sm leading-relaxed text-blue-900">
          <span className="mr-1.5 text-[11px] font-semibold text-blue-600">관할</span>
          {branch.jurisdiction}
        </p>
      ) : (
        <p className="mt-3 text-xs text-slate-400">관할구역 정보 없음 (본부·지역본부 등)</p>
      )}

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
        <div className="min-w-0 flex-1 text-sm text-slate-700">
          {branch.zip ? <span className="mr-1.5 tabular-nums text-slate-500">({branch.zip})</span> : null}
          {branch.address || '—'}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-medium text-slate-400">대표번호</p>
          <p className="font-semibold tabular-nums text-slate-900">{branch.phone || '—'}</p>
          {branch.fax ? <p className="text-[10px] tabular-nums text-slate-500">팩스 {branch.fax}</p> : null}
        </div>
      </div>
      {hasAnyContacts ? (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3">
          <p className="mb-1 text-xs font-semibold text-slate-600">업무별 연락처</p>
          <div className="mb-2 space-y-2">
            <div className="flex flex-wrap gap-1">
              {CONTACT_PURPOSE_CHIPS.map(chip => {
                const checked = purpose === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setPurpose(chip.id)}
                    className={`rounded-full border px-2 py-1 text-[10px] font-medium ${
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
            {regionTags.length ? (
              <div className="flex flex-wrap gap-1">
                {regionTags.map(label => {
                  const checked = contactQuery.trim() === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setContactQuery(prev => (prev.trim() === label ? '' : label))}
                      className={`rounded-full border px-2 py-1 text-[10px] font-medium ${
                        checked
                          ? 'border-blue-200 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-500'
                      }`}
                      aria-pressed={checked}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <input
                type="search"
                value={contactQuery}
                onChange={e => setContactQuery(e.target.value)}
                placeholder="지역·업무·부서명 검색"
                className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none ring-0"
              />
              {contactQuery.trim() ? (
                <button
                  type="button"
                  onClick={() => setContactQuery('')}
                  className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-500"
                >
                  검색 지우기
                </button>
              ) : null}
            </div>
          </div>
          {showPurposeEmpty ? (
            <p className="text-[11px] text-slate-500">
              {contactQuery.trim()
                ? '선택한 지역 또는 검색어에 맞는 연락처가 없습니다.'
                : '이 지사에 해당 업무 번호가 없습니다. 위 대표번호로 문의해 주세요.'}
            </p>
          ) : (
            <ul className="space-y-1.5 text-xs text-slate-700">
              {displayTop.map((item, idx) => (
                <ContactListItem
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
              <ul className="mt-2 space-y-1">
                {restContacts.map((item, idx) => (
                  <ContactListItem key={`${item.label}-${item.phone}-rest-${idx}`} item={item} />
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </article>
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
    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-3">
      <p className="text-[11px] font-semibold text-emerald-700">통화 시 알려줄 정보</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
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

export default function InsuranceBranchesPageClient({
  initialQuery = '',
  initialOrg = 'nhis',
  returnTo = '',
  returnLabel = '',
  businessNo = '',
  companyName = '',
}: {
  initialQuery?: string;
  initialOrg?: InsuranceOrgId;
  returnTo?: string;
  returnLabel?: string;
  businessNo?: string;
  companyName?: string;
}) {
  const [org, setOrg] = useState<InsuranceOrgId>(initialOrg);
  const [query, setQuery] = useState(initialQuery);

  const data = DATASETS[org];
  const orgMeta = INSURANCE_ORGS.find(o => o.id === org)!;
  const results = useMemo(() => filterInsuranceBranches(data.branches, query, 3), [data.branches, query]);

  const trimmed = query.trim();
  const showHint = trimmed.length === 0;
  const showEmpty = trimmed.length > 0 && results.length === 0;

  return (
    <PortalPageShell narrow>
      <PortalPageHeader
        title="4대보험 지사 찾기"
        description="건보·국민연금·근로복지(고용·산재) 지사를 지역·구·동·지사명으로 바로 검색합니다."
        icon={<PageHeaderIcon name="nhis-branches" />}
      />

      {returnTo ? (
        <div className="mb-4">
          <a href={returnTo} className={portalBtnSecondary}>
            {returnLabel ? `${returnLabel} 정보로 돌아가기` : '이전 수임처로 돌아가기'}
          </a>
        </div>
      ) : null}

      <CallContextBanner businessNo={businessNo} companyName={companyName} />

      <PortalToolTabs
        className="mb-4"
        value={org}
        onChange={setOrg}
        tabs={INSURANCE_ORGS.map(o => ({
          id: o.id,
          label: o.shortLabel,
          accent: o.accent,
        }))}
      />

      <div className="sticky top-0 z-10 -mx-1 mb-4 bg-[var(--background)]/95 px-1 pb-3 pt-1 backdrop-blur-sm">
        <label className="sr-only" htmlFor="insurance-search">
          지사 검색
        </label>
        <input
          id="insurance-search"
          type="search"
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="예: 해운대, 수영구, 기장, 부산진…"
          className={`${portalInput} w-full py-3 text-base`}
        />
        <p className={`${portalFooterMeta} mt-2`}>
          {orgMeta.label} · 기준일 {data.updated} · {data.branches.length}개
          {trimmed ? ` · ${results.length}건` : ''}
          {orgMeta.note ? ` · ${orgMeta.note}` : ''}
        </p>
      </div>

      {showHint && (
        <div className={portalEmptyState}>
          <p className="font-medium text-slate-700">검색어를 입력하세요</p>
          <p className="mt-1 text-sm text-slate-500">
            긴 주소를 넣어도 시·구·동 위주로 자동 정리해서 찾습니다. 공단 탭을 바꾼 뒤 같은 검색어로 비교할 수 있습니다.
          </p>
        </div>
      )}

      {showEmpty && (
        <div className={portalEmptyState}>
          <p className="font-medium text-slate-700">검색 결과가 없습니다</p>
          <p className="mt-1 text-sm text-slate-500">긴 주소는 자동 정리해 다시 찾습니다. 그래도 없으면 지역명이나 지사명으로 검색해 보세요.</p>
        </div>
      )}

      {results.length > 0 && (
        <ul className="space-y-3">
          {results.map(b => (
            <li key={`${org}-${b.id}`}>
              <ResultCard branch={b} org={org} />
            </li>
          ))}
        </ul>
      )}
    </PortalPageShell>
  );
}
