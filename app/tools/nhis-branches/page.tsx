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

function ResultCard({ branch, org }: { branch: InsuranceBranch; org: InsuranceOrgId }) {
  return (
    <article className={`${portalCard} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">{branch.shortName}</h2>
          <p className="mt-0.5 text-xs text-slate-400">{branch.name}</p>
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
      ) : org === 'nps' ? (
        <p className="mt-3 text-xs text-slate-400">
          국민연금 공개 데이터에는 관할구역이 없습니다. 주소·지사명으로 확인하세요.
        </p>
      ) : (
        <p className="mt-3 text-xs text-slate-400">관할구역 정보 없음 (본부·지역본부 등)</p>
      )}

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[4.5rem_1fr]">
        <dt className="text-slate-400">주소</dt>
        <dd className="text-slate-800">
          {branch.zip ? (
            <span className="mr-1.5 tabular-nums text-slate-500">({branch.zip})</span>
          ) : null}
          {branch.address || '—'}
        </dd>
        <dt className="text-slate-400">전화</dt>
        <dd className="font-medium tabular-nums text-slate-800">
          {branch.phone || '—'}
          {branch.phone === '1577-1000' ? (
            <span className="ml-2 text-[11px] font-normal text-slate-400">공단 대표번호</span>
          ) : null}
        </dd>
        {branch.fax ? (
          <>
            <dt className="text-slate-400">팩스</dt>
            <dd className="tabular-nums text-slate-700">{branch.fax}</dd>
          </>
        ) : null}
        {branch.hours ? (
          <>
            <dt className="text-slate-400">이용</dt>
            <dd className="text-slate-700">{branch.hours}</dd>
          </>
        ) : null}
      </dl>
    </article>
  );
}

export default function InsuranceBranchesPage() {
  const [org, setOrg] = useState<InsuranceOrgId>('nhis');
  const [query, setQuery] = useState('');

  const data = DATASETS[org];
  const orgMeta = INSURANCE_ORGS.find(o => o.id === org)!;

  const results = useMemo(
    () => filterInsuranceBranches(data.branches, query, 12),
    [data.branches, query],
  );

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
            수임처 주소의 구·동, 또는 지사명으로 찾습니다. 공단 탭을 바꾼 뒤 같은 검색어로 비교할 수 있습니다.
          </p>
        </div>
      )}

      {showEmpty && (
        <div className={portalEmptyState}>
          <p className="font-medium text-slate-700">검색 결과가 없습니다</p>
          <p className="mt-1 text-sm text-slate-500">구·동 이름을 짧게 바꿔 보세요.</p>
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
