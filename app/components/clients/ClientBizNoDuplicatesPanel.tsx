'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ClientRecord } from '@/app/types/client';
import { getClientCategory } from '@/app/utils/clientsGrouping';
import {
  businessEntityTypeForCategory,
  duplicateIdKind,
  isCorporateDuplicateClient,
} from '@/app/utils/clientBizNo';
import { formatBusinessNo, formatCorporateNo, formatResidentNo } from '@/app/utils/idFormat';
import { portalBtnDanger, portalBtnSecondary } from '@/app/components/portal/uiClasses';

function formatDate(iso: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ko-KR');
}

export default function ClientBizNoDuplicatesPanel({
  client,
  canEdit,
}: {
  client: ClientRecord;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [matches, setMatches] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const bizDigits = (client.businessNo || '').replace(/\D/g, '');
  const corpDigits = (client.corporateNo || '').replace(/\D/g, '');
  const resDigits = (client.residentNo || '').replace(/\D/g, '');
  const hasBizNo = bizDigits.length === 10;
  const isCorporate = isCorporateDuplicateClient(client);
  const idKind = duplicateIdKind(client);
  const canCheckDuplicates =
    hasBizNo && (isCorporate ? corpDigits.length === 13 : resDigits.length === 13);

  const load = useCallback(async () => {
    if (!canCheckDuplicates) {
      setMatches([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        bizNo: bizDigits,
        entity: client.businessEntityType || '',
        category: getClientCategory(client),
      });
      if (isCorporate) params.set('corporateNo', corpDigits);
      else params.set('residentNo', resDigits);
      const res = await fetch(`/api/clients/by-business-no?${params}`, {
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as { clients?: ClientRecord[]; error?: string };
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setMatches(data.clients ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [bizDigits, corpDigits, resDigits, canCheckDuplicates, client, isCorporate]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (target: ClientRecord) => {
    if (!canEdit) return;
    const ok = window.confirm(
      `「${target.companyName || '업체명 없음'}」 중복 등록을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`,
    );
    if (!ok) return;
    setActingId(target.id);
    setError('');
    try {
      const res = await fetch(`/api/clients/${target.id}`, { method: 'DELETE' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || '삭제 실패');
      if (target.id === client.id) {
        router.push('/clients/directory');
        router.refresh();
        return;
      }
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setActingId(null);
    }
  };

  const handleSetUnused = async (target: ClientRecord) => {
    if (!canEdit) return;
    setActingId(target.id);
    setError('');
    try {
      const nextIntake = { ...(target.intakeData ?? {}), category: '미사용' };
      const res = await fetch(`/api/clients/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intakeData: nextIntake }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || '저장 실패');
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setActingId(null);
    }
  };

  const duplicates = matches.length > 1;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700">
        <span>
          <span className="text-slate-500">등록일</span>{' '}
          <span className="font-semibold tabular-nums">{formatDate(client.createdAt)}</span>
        </span>
        {hasBizNo && (
          <span>
            <span className="text-slate-500">사업자번호</span>{' '}
            <span className="font-mono font-semibold">{formatBusinessNo(client.businessNo)}</span>
          </span>
        )}
        {idKind === 'corporate' && corpDigits.length === 13 && (
          <span>
            <span className="text-slate-500">법인등록번호</span>{' '}
            <span className="font-mono font-semibold">{formatCorporateNo(client.corporateNo)}</span>
          </span>
        )}
        {idKind === 'personal' && resDigits.length === 13 && (
          <span>
            <span className="text-slate-500">주민등록번호</span>{' '}
            <span className="font-mono font-semibold">{formatResidentNo(client.residentNo)}</span>
          </span>
        )}
      </div>

      {!canCheckDuplicates ? (
        <p className="text-slate-400">
          {isCorporate
            ? '사업자번호(10자리)와 법인등록번호(13자리)가 모두 있어야 중복 확인을 할 수 있습니다.'
            : '사업자번호(10자리)와 주민등록번호(13자리)가 모두 있어야 중복 확인을 할 수 있습니다.'}
        </p>
      ) : loading ? (
        <p className="text-slate-400">
          {isCorporate ? '동일 사업자·법인등록번호 조회 중…' : '동일 사업자·주민등록번호 조회 중…'}
        </p>
      ) : error ? (
        <p className="text-rose-600">{error}</p>
      ) : duplicates ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-2.5">
          <p className="mb-2 font-semibold text-amber-900">
            {isCorporate
              ? `사업자번호·법인등록번호 동일 ${matches.length}건 — 중복 등록이 의심됩니다`
              : `사업자번호·주민등록번호 동일 ${matches.length}건 — 중복 등록이 의심됩니다`}
          </p>
          <ul className="space-y-2">
            {matches.map(m => {
              const isCurrent = m.id === client.id;
              const busy = actingId === m.id;
              return (
                <li
                  key={m.id}
                  className={`rounded-md border px-2.5 py-2 ${
                    isCurrent ? 'border-blue-200 bg-white' : 'border-amber-100 bg-white/90'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isCurrent ? (
                          <span className="font-semibold text-slate-900">{m.companyName || '(이름 없음)'}</span>
                        ) : (
                          <Link
                            href={`/clients/${m.id}`}
                            className="font-semibold text-blue-700 hover:underline"
                          >
                            {m.companyName || '(이름 없음)'}
                          </Link>
                        )}
                        {isCurrent && (
                          <span className="rounded bg-blue-100 px-1.5 py-px text-[10px] font-bold text-blue-800">
                            현재
                          </span>
                        )}
                        <span className="rounded bg-slate-100 px-1.5 py-px text-[10px] font-medium text-slate-600">
                          {getClientCategory(m)}
                        </span>
                        {m.status === 'churned' && (
                          <span className="rounded bg-slate-200 px-1.5 py-px text-[10px] font-bold text-slate-600">
                            해임
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        담당 {m.manager?.trim() || '미지정'} · 등록 {formatDate(m.createdAt)}
                      </p>
                    </div>
                    {canEdit && !isCurrent && (
                      <div className="flex flex-wrap gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(m)}
                          className={`${portalBtnDanger} !px-2 !py-1 !text-[10px]`}
                          title="잘못 중복 등록된 건 삭제"
                        >
                          {busy ? '처리 중…' : '중복 삭제'}
                        </button>
                        <Link
                          href={`/clients/churn?prefillClientId=${m.id}`}
                          className={`${portalBtnSecondary} !px-2 !py-1 !text-[10px] inline-flex items-center`}
                        >
                          유출 등록
                        </Link>
                        <button
                          type="button"
                          disabled={busy || getClientCategory(m) === '미사용'}
                          onClick={() => void handleSetUnused(m)}
                          className={`${portalBtnSecondary} !px-2 !py-1 !text-[10px]`}
                          title="대분류를 미사용으로 변경"
                        >
                          미사용 처리
                        </button>
                      </div>
                    )}
                    {canEdit && isCurrent && (
                      <div className="flex flex-wrap gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(m)}
                          className={`${portalBtnDanger} !px-2 !py-1 !text-[10px]`}
                        >
                          {busy ? '처리 중…' : '이 건 삭제'}
                        </button>
                        <Link
                          href={`/clients/churn?prefillClientId=${m.id}`}
                          className={`${portalBtnSecondary} !px-2 !py-1 !text-[10px] inline-flex items-center`}
                        >
                          유출 등록
                        </Link>
                        <button
                          type="button"
                          disabled={busy || getClientCategory(m) === '미사용'}
                          onClick={() => void handleSetUnused(m)}
                          className={`${portalBtnSecondary} !px-2 !py-1 !text-[10px]`}
                        >
                          미사용 처리
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {canEdit && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-800/90">
              잘못 중복 등록된 건은 <b>삭제</b>, 실제 수임 종료는 <b>유출 등록</b>, 목록에서 빼두려면 <b>미사용</b>으로
              변경하세요.
            </p>
          )}
        </div>
      ) : (
        <p className="text-slate-500">
          {isCorporate
            ? '사업자번호·법인등록번호가 모두 같은 다른 수임처가 없습니다.'
            : '사업자번호·주민등록번호가 모두 같은 다른 수임처가 없습니다.'}
        </p>
      )}
    </div>
  );
}
