'use client';

import { useCallback, useEffect, useState } from 'react';
import { parseExternalRefs } from '@/lib/externalRefs';
import type { ExternalRefs } from '@/app/types/externalRefs';

export default function ExternalRefsPanel({
  clientId,
  intakeData,
  onUpdated,
}: {
  clientId: string;
  intakeData: Record<string, unknown>;
  onUpdated?: (intakeData: Record<string, unknown>) => void;
}) {
  const refs = parseExternalRefs(intakeData);
  const [tpId, setTpId] = useState(refs.tp?.id ?? '');
  const [semoId, setSemoId] = useState(refs.semorang?.id ?? '');
  const [wmId, setWmId] = useState(refs.wemembers?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const r = parseExternalRefs(intakeData);
    setTpId(r.tp?.id ?? '');
    setSemoId(r.semorang?.id ?? '');
    setWmId(r.wemembers?.id ?? '');
  }, [intakeData]);

  const save = useCallback(async (patch: Partial<ExternalRefs>) => {
    setSaving(true);
    setMsg(null);
    try {
      const nextRefs = { ...parseExternalRefs(intakeData), ...patch };
      for (const k of Object.keys(patch) as (keyof ExternalRefs)[]) {
        const entry = patch[k];
        if (entry?.id) {
          nextRefs[k] = { ...nextRefs[k], ...entry, registeredAt: entry.registeredAt ?? new Date().toISOString() };
        }
      }
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intakeData: { ...intakeData, externalRefs: nextRefs } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      onUpdated?.(data.client.intakeData);
      setMsg('저장되었습니다.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }, [clientId, intakeData, onUpdated]);

  return (
    <article className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
      <h2 className="text-sm font-black text-blue-900">외부 시스템 연동</h2>
      <p className="text-[10px] text-blue-800/70 mt-0.5">TP · 세무사랑 · 위멤버스 등록 ID</p>

      <div className="mt-3 space-y-3">
        {([
          ['TP', 'tp', tpId, setTpId] as const,
          ['세무사랑', 'semorang', semoId, setSemoId] as const,
          ['위멤버스', 'wemembers', wmId, setWmId] as const,
        ]).map(([label, key, val, setVal]) => (
          <div key={key}>
            <label className="text-[10px] font-bold text-gray-600">{label} ID</label>
            <div className="mt-1 flex gap-2">
              <input
                value={val}
                onChange={e => setVal(e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
              />
              <button
                type="button"
                disabled={saving || !val.trim()}
                onClick={() => void save({ [key]: { id: val.trim() } } as Partial<ExternalRefs>)}
                className="text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                저장
              </button>
            </div>
          </div>
        ))}
      </div>

      {msg && <p className="mt-2 text-xs text-gray-600">{msg}</p>}
    </article>
  );
}
