'use client';

import { useEffect, useState } from 'react';
import type { BlueholeCaseSummary } from '@/lib/integrations/bluehole/types';
import BlueholeCaseLink from '../intake/BlueholeCaseLink';

export default function BlueholeCasePreview({ caseId }: { caseId: string }) {
  const [summary, setSummary] = useState<BlueholeCaseSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = caseId.trim().replace(/^#\s*/, '');
    if (!id) {
      setSummary(null);
      return;
    }
    setLoading(true);
    fetch(`/api/integrations/bluehole/case/${encodeURIComponent(id)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => setSummary(data?.case ?? null))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [caseId]);

  if (loading) return <span className="text-[10px] text-gray-400">조회 중…</span>;
  if (!summary) return null;

  return (
    <div className="mt-2 rounded-lg border border-blue-100 bg-white px-2 py-1.5 text-[10px] text-gray-700">
      {summary.title && <p className="font-semibold">{summary.title}</p>}
      <div className="flex flex-wrap gap-2 mt-0.5">
        {summary.status && <span className="text-blue-700">상태: {summary.status}</span>}
        {summary.manager && <span>담당: {summary.manager}</span>}
        <span className="text-gray-400">{summary.source === 'api' ? 'API' : '링크'}</span>
      </div>
      <BlueholeCaseLink value={summary.id} className="text-[10px] mt-0.5 inline-block" />
    </div>
  );
}
