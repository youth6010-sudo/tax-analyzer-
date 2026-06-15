'use client';

import { useCallback, useEffect, useState } from 'react';
import { TAX_TYPES, type TaxTypeId } from '@/app/config/taxTypes';
import { buildBlueholeFilingCaseUrl } from '@/app/config/bluehole';
import { filingPeriodLabel } from '@/lib/taxFilingSchedule';
import type { TaxFilingCheckRecord } from '@/lib/taxFilingDb';

const FILING_TABS: TaxTypeId[] = ['withholding', 'vat', 'corporate', 'comprehensive'];

export default function TaxFilingPanel() {
  const [taxType, setTaxType] = useState<TaxTypeId>('withholding');
  const [periodKey, setPeriodKey] = useState('');
  const [checks, setChecks] = useState<TaxFilingCheckRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (tt: TaxTypeId, pk?: string) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ taxType: tt });
      if (pk) q.set('periodKey', pk);
      const res = await fetch(`/api/dashboard/filing-checks?${q}`);
      const data = await res.json();
      if (res.ok) {
        setChecks(data.checks ?? []);
        if (data.periodKey) setPeriodKey(data.periodKey);
        if (data.taxType) setTaxType(data.taxType);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(taxType, periodKey || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxType]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/dashboard/filing-checks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setChecks(prev => prev.map(c => (c.id === id ? data.check : c)));
      }
    } finally {
      setSavingId(null);
    }
  };

  const label = filingPeriodLabel(taxType, periodKey);
  const taxLabel = TAX_TYPES.find(t => t.id === taxType)?.label ?? taxType;

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white overflow-hidden">
      <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
        <h2 className="text-sm font-black text-emerald-900">세무 신고 체크</h2>
        <p className="text-[10px] text-emerald-800/70 mt-0.5">
          블루홀 케이스에서 신고 확인 후 완료·접수개수·특이사항을 기록하세요.
        </p>
      </div>

      <div className="px-4 py-2 flex flex-wrap gap-1 border-b border-gray-100">
        {FILING_TABS.map(tt => (
          <button
            key={tt}
            type="button"
            onClick={() => {
              setTaxType(tt);
              setPeriodKey('');
            }}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${
              taxType === tt ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {TAX_TYPES.find(t => t.id === tt)?.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-2 text-[10px] font-semibold text-gray-600">
        {label || `${taxLabel} · ${periodKey}`}
      </div>

      {loading ? (
        <p className="px-4 py-6 text-xs text-gray-400">불러오는 중…</p>
      ) : checks.length === 0 ? (
        <p className="px-4 py-6 text-xs text-gray-400">
          해당 세목 담당 수임처가 없거나 현재 신고 기간이 아닙니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-xs">
            <thead>
              <tr className="bg-gray-50 text-[10px] font-bold text-gray-500">
                <th className="px-3 py-2 text-left">업체명</th>
                <th className="px-3 py-2 text-left">블루홀 케이스</th>
                <th className="px-3 py-2 text-center">완료</th>
                <th className="px-3 py-2 text-right">접수개수</th>
                <th className="px-3 py-2 text-left">특이사항</th>
              </tr>
            </thead>
            <tbody>
              {checks.map(c => {
                const caseUrl = c.blueholeCaseId ? buildBlueholeFilingCaseUrl(c.blueholeCaseId) : null;
                return (
                  <tr key={c.id} className="border-t border-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{c.companyName}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          defaultValue={c.blueholeCaseId}
                          placeholder="#213241"
                          disabled={savingId === c.id}
                          onBlur={e => {
                            const v = e.target.value.trim();
                            if (v !== c.blueholeCaseId) void patch(c.id, { blueholeCaseId: v });
                          }}
                          className="w-24 border border-gray-200 rounded px-1.5 py-1 text-[10px]"
                        />
                        {caseUrl && (
                          <a href={caseUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-[10px]">
                            열기
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={c.status === 'done'}
                        disabled={savingId === c.id}
                        onChange={e => void patch(c.id, { status: e.target.checked ? 'done' : 'pending' })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        defaultValue={c.acceptanceCount ?? ''}
                        disabled={savingId === c.id}
                        onBlur={e => {
                          const raw = e.target.value.trim();
                          const n = raw === '' ? null : Number(raw.replace(/,/g, ''));
                          const next = n != null && !Number.isNaN(n) ? n : null;
                          if (next !== c.acceptanceCount) void patch(c.id, { acceptanceCount: next });
                        }}
                        className="w-16 border border-gray-200 rounded px-1.5 py-1 text-[10px] text-right font-mono"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        defaultValue={c.notes}
                        disabled={savingId === c.id}
                        placeholder="특이사항"
                        onBlur={e => {
                          const v = e.target.value;
                          if (v !== c.notes) void patch(c.id, { notes: v });
                        }}
                        className="w-full min-w-[8rem] border border-gray-200 rounded px-1.5 py-1 text-[10px]"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
