'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import AppHeader from '@/app/components/AppHeader';
import {
  portalAlertError,
  portalAlertInfo,
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
} from '@/app/components/portal/uiClasses';

type SheetCount = { total: number; skipped: number };
type Summary = {
  inquiries: SheetCount;
  processes: SheetCount;
  churns: SheetCount;
  sheets: { inquiries: boolean; processes: boolean; churns: boolean };
};
type Preview = {
  fileName: string;
  summary: Summary;
  sample: {
    inquiries: { companyName: string; consultant: string; inquiryDate: string }[];
    churns: { companyName: string; manager: string; churnedAt: string }[];
  };
};
type CommitStats = {
  inquiries: { inserted: number; updated: number; skipped: number };
  processes: { inserted: number; updated: number; skipped: number };
  churns: { inserted: number; updated: number; skipped: number; clientsMarkedChurned: number };
};

const SHEET_META = [
  { key: 'inquiries' as const, label: '유입관리' },
  { key: 'processes' as const, label: '유입프로세스' },
  { key: 'churns' as const, label: '유출' },
];

export default function DataImportAdmin() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [committed, setCommitted] = useState<CommitStats | null>(null);
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCommitted(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onSelect = (f: File | null) => {
    setFile(f);
    setPreview(null);
    setCommitted(null);
    setError(null);
  };

  const runPreview = async () => {
    if (!file) return;
    setBusy('preview');
    setError(null);
    setCommitted(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/data-import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '미리보기 실패');
      setPreview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '미리보기 실패');
    } finally {
      setBusy(null);
    }
  };

  const runCommit = async () => {
    if (!file || !preview) return;
    const s = preview.summary;
    const willApply =
      s.inquiries.total - s.inquiries.skipped +
      (s.processes.total - s.processes.skipped) +
      (s.churns.total - s.churns.skipped);
    if (!confirm(`유입·유출 ${willApply}건을 DB에 반영(upsert)합니다. 진행할까요?\n\n수임처 명단(roster)은 변경되지 않으며, 동일 항목은 중복 없이 갱신됩니다.`)) {
      return;
    }
    setBusy('commit');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/admin/data-import/commit', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '반영 실패');
      setCommitted(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : '반영 실패');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader />
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
          ← 홈
        </Link>
        <h1 className="mt-2 text-xl font-black text-gray-900">유입·유출 업로드</h1>
        <p className="mt-1 text-sm text-gray-500">
          청년들 ID.xlsx의 <b>유입관리·유입프로세스·유출</b> 시트를 업로드해 미리 확인한 뒤 반영합니다. 수임처 명단(roster)은 변경되지 않으며, 동일 항목은 중복 없이 갱신(upsert)됩니다.
        </p>

        <article className={`${portalCard} mt-4 p-5`}>
          <h2 className="text-sm font-bold text-slate-800">업로드 대상과 반영 항목</h2>
          <div className="mt-3 space-y-3 text-sm text-slate-600">
            <div>
              <p className="font-semibold text-slate-700">유입관리</p>
              <p>
                문의일자, 업체명, 전화번호, 유입채널, 초회상담자, 문의내용, 블루홀케이스, 특이사항,
                제안금액, 업종, 사업자번호, 대표자, 대표 연락처, 관리자, 관리자 연락처, 주소,
                이메일, 계약유무
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">유입프로세스</p>
              <p>
                업체명, 수수료 발생일, 월 수수료, 유입 경로와 체크리스트 10개 항목을 반영합니다.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-700">유출</p>
              <p>업체명, 계약 종료일, 수수료, 자료 정리, 유형, 전조증상, 유출 사유, 담당자를 반영합니다.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
              시트명은 반드시 <b>유입관리</b>, <b>유입프로세스</b>, <b>유출</b>이어야 합니다. 날짜는
              가능하면 <b>YYYY-MM-DD</b> 형식으로 맞춰 주세요. 업체명 표기가 시트마다 다르면
              자동 연결이 실패할 수 있습니다.
            </div>
          </div>
        </article>

        <article className={`${portalCard} mt-6 p-5`}>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={e => onSelect(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700"
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={!file || busy !== null}
              className={portalBtnPrimary}
            >
              {busy === 'preview' ? '분석 중…' : '미리보기'}
            </button>
            {(file || preview || committed) && (
              <button type="button" onClick={reset} className={portalBtnSecondary} disabled={busy !== null}>
                초기화
              </button>
            )}
          </div>
        </article>

        {error && <div className={`${portalAlertError} mt-4`}>{error}</div>}

        {preview && !committed && (
          <article className={`${portalCard} mt-4 p-5`}>
            <h2 className="text-sm font-bold text-slate-800">미리보기 — {preview.fileName}</h2>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {SHEET_META.map(({ key, label }) => {
                const c = preview.summary[key];
                const found = preview.summary.sheets[key];
                return (
                  <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center">
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    {found ? (
                      <>
                        <p className="mt-1 text-lg font-black tabular-nums text-slate-900">
                          {c.total - c.skipped}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          반영{c.skipped > 0 ? ` · 제외 ${c.skipped}` : ''}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-xs text-slate-400">시트 없음</p>
                    )}
                  </div>
                );
              })}
            </div>

            {preview.sample.inquiries.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-500">유입 샘플</p>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                  {preview.sample.inquiries.map((r, i) => (
                    <li key={i} className="truncate">
                      · {r.companyName}
                      {r.consultant && <span className="text-slate-400"> / {r.consultant}</span>}
                      {r.inquiryDate && <span className="text-slate-400"> / {r.inquiryDate}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.sample.churns.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-slate-500">유출 샘플</p>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                  {preview.sample.churns.map((r, i) => (
                    <li key={i} className="truncate">
                      · {r.companyName}
                      {r.manager && <span className="text-slate-400"> / {r.manager}</span>}
                      {r.churnedAt && <span className="text-slate-400"> / {r.churnedAt}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void runCommit()}
                disabled={busy !== null}
                className={portalBtnPrimary}
              >
                {busy === 'commit' ? '반영 중…' : '확인하고 반영'}
              </button>
              <span className="text-xs text-slate-400">중복 항목은 갱신, 새 항목은 추가됩니다.</span>
            </div>
          </article>
        )}

        {committed && (
          <article className={`${portalCard} mt-4 p-5`}>
            <div className={portalAlertInfo}>반영이 완료되었습니다.</div>
            <ul className="mt-3 space-y-1 text-sm text-slate-700">
              <li>
                유입관리: 신규 {committed.inquiries.inserted} · 갱신 {committed.inquiries.updated}
                {committed.inquiries.skipped > 0 && ` · 제외 ${committed.inquiries.skipped}`}
              </li>
              <li>
                유입프로세스: 신규 {committed.processes.inserted} · 갱신 {committed.processes.updated}
                {committed.processes.skipped > 0 && ` · 제외 ${committed.processes.skipped}`}
              </li>
              <li>
                유출: 신규 {committed.churns.inserted} · 갱신 {committed.churns.updated}
                {committed.churns.skipped > 0 && ` · 제외 ${committed.churns.skipped}`}
                {committed.churns.clientsMarkedChurned > 0 && ` · 수임처 해임 처리 ${committed.churns.clientsMarkedChurned}`}
              </li>
            </ul>
            <button type="button" onClick={reset} className={`${portalBtnSecondary} mt-4`}>
              새 파일 올리기
            </button>
          </article>
        )}
      </main>
    </div>
  );
}
