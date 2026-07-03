'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import {
  portalBtnPrimary,
  portalBtnSecondary,
  portalInput,
  portalAlertError,
  portalAlertInfo,
} from '../portal/uiClasses';
import {
  formatNtsDate,
  isNtsAlert,
  ntsBadgeClass,
  normalizeNtsTaxType,
  ntsStatusLabel,
  ntsTaxTypeBadgeClass,
  type NtsStatusView,
} from '@/app/utils/ntsStatus';

interface ValidateResult {
  valid: boolean;
  validCode: string;
  message: string;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export default function ClientNtsPanel({
  clientId,
  businessNumber,
  representative,
  canEdit,
  openDatePrefill = '',
  initialNts = null,
  suppressChurnPrompt = false,
}: {
  clientId: string;
  businessNumber?: string;
  representative?: string;
  canEdit: boolean;
  openDatePrefill?: string;
  initialNts?: NtsStatusView | null;
  suppressChurnPrompt?: boolean;
}) {
  const normalizedBiz = (businessNumber || '').replace(/\D/g, '');
  const [nts, setNts] = useState<NtsStatusView | null>(initialNts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const check = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/clients/${clientId}/nts`, { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '조회 실패');
      if (!data.configured) {
        setError('국세청 API 키(NTS_SERVICE_KEY)가 설정되어 있지 않습니다.');
        return;
      }
      if (data.error) {
        setError(data.error as string);
        return;
      }
      setNts(data.nts as NtsStatusView);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  if (!normalizedBiz) {
    return null;
  }

  const alert = nts ? isNtsAlert(nts.statusCode) : false;
  const taxLabel = nts ? normalizeNtsTaxType(nts.taxType) : '';

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold text-gray-500">국세청 사업자상태</p>
        <button type="button" onClick={check} disabled={loading} className={portalBtnSecondary}>
          {loading ? '조회 중…' : '국세청 조회'}
        </button>
      </div>

      {error && <div className={`${portalAlertError} mb-2`}>{error}</div>}

      {nts ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${ntsBadgeClass(
                nts.statusCode,
              )}`}
            >
              {ntsStatusLabel(nts)}
            </span>
            {taxLabel && (
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${ntsTaxTypeBadgeClass(taxLabel)}`}
              >
                {taxLabel}
              </span>
            )}
            {nts.closedDate && (
              <span className="text-xs text-gray-500">폐업일 {formatNtsDate(nts.closedDate)}</span>
            )}
          </div>
          {nts.checkedAt && (
            <p className="text-[11px] text-gray-400">
              조회: {new Date(nts.checkedAt).toLocaleString('ko-KR')}
            </p>
          )}
          {alert && !suppressChurnPrompt && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-900">
              <b>{ntsStatusLabel(nts)}</b> 상태로 확인됩니다. 내용을 확인 후 유출(폐업·휴업) 등록을 진행하세요.
              <Link
                href={`/clients/churn?prefillClientId=${clientId}`}
                className="ml-1 font-semibold underline"
              >
                유출 등록 →
              </Link>
            </div>
          )}
        </div>
      ) : (
        <p className="py-1 text-sm text-gray-400">아직 조회하지 않았습니다.</p>
      )}

      {canEdit && (
        <ValidateSection
          clientId={clientId}
          representative={representative || ''}
          openDatePrefill={openDatePrefill}
        />
      )}
    </div>
  );
}

function ValidateSection({
  clientId,
  representative,
  openDatePrefill,
}: {
  clientId: string;
  representative: string;
  openDatePrefill: string;
}) {
  const [open, setOpen] = useState(false);
  const [startDt, setStartDt] = useState(openDatePrefill.replace(/\D/g, '').slice(0, 8));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ValidateResult | null>(null);

  const submit = useCallback(async () => {
    const digits = startDt.replace(/\D/g, '');
    if (digits.length !== 8) {
      setError('개업일자를 YYYYMMDD 8자리로 입력하세요.');
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/nts/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDt: digits, representative }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '진위확인 실패');
      if (!data.configured) {
        setError('국세청 API 키(NTS_SERVICE_KEY)가 설정되어 있지 않습니다.');
        return;
      }
      setResult({
        valid: !!data.valid,
        validCode: (data.validCode as string) || '',
        message: (data.message as string) || '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '진위확인 실패');
    } finally {
      setBusy(false);
    }
  }, [clientId, startDt, representative]);

  return (
    <div className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <span className="text-xs font-bold text-slate-600">진위확인 (개업일자·대표자 일치)</span>
        <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              개업일자 (YYYYMMDD)
              <input
                value={startDt}
                onChange={(e) => setStartDt(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="20200101"
                inputMode="numeric"
                className={`${portalInput} w-36 tabular-nums`}
              />
            </label>
            <div className="flex flex-col gap-1 text-xs text-slate-600">
              대표자
              <span className="px-1 py-2 font-semibold text-slate-800">{representative || '—'}</span>
            </div>
            <button type="button" onClick={submit} disabled={busy} className={portalBtnPrimary}>
              {busy ? '확인 중…' : '진위확인'}
            </button>
          </div>

          {error && <div className={portalAlertError}>{error}</div>}

          {result && (
            <div
              className={
                result.valid
                  ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900'
                  : 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900'
              }
            >
              {result.valid ? '✓ 입력값이 국세청 기록과 일치합니다.' : '✗ 일치하지 않습니다. 사업자번호·개업일자·대표자를 확인하세요.'}
              {result.message && <span className="ml-1 text-slate-500">({result.message})</span>}
            </div>
          )}

          <p className={portalAlertInfo}>
            개업일자가 정확해야 진위확인이 됩니다. 더존 출처는 개업일이 자동 입력됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
