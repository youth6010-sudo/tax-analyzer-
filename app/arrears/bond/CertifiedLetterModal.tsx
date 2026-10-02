'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import ArrearsLetterSheet from '@/app/arrears/ArrearsLetterSheet';
import CertifiedLetterSheet, { formatCertDate } from '@/app/arrears/bond/CertifiedLetterSheet';
import { uploadBondAttachment } from '@/app/arrears/bond/bondUpload';
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';
import {
  filterHiddenCancelledTaxInvoiceLines,
  formatArrearsLetterDate,
  hasPriorClosedLetterCycle,
  letterRunningBalances,
  linesForCurrentLetterCycle,
  resolveArrearsLetterAsOfDate,
  type ArrearsEntryDto,
  type ArrearsLetterLineDto,
} from '@/app/types/arrears';
import { todayIsoDate, type BondRecipient, type BondStoredRecord } from '@/app/types/bond';
import { fetchWithTimeout } from '@/app/utils/fetchTimeout';
import { formatArrearsLetterLineLabels } from '@/lib/arrearsLineLabel';
import { buildMultiPagePdfBlob, downloadBlob } from '@/lib/arrearsLetterPdf';

type Props = {
  entry: ArrearsEntryDto;
  recipient?: BondRecipient;
  onRecords: (records: Record<string, BondStoredRecord>) => void;
  onClose: () => void;
};

type LetterData = {
  lines: ArrearsLetterLineDto[];
  labelAsOf: string;
  letterDateLabel: string;
};

/** 내역 라벨의 「YYYY년 M월」 중 가장 이른·늦은 달 → 「2026 . 04 .」 */
function periodFromLabels(labels: string[]): { from: string; to: string } {
  const keys: string[] = [];
  for (const l of labels) {
    const m = /(\d{4})년\s*(\d{1,2})월/.exec(l);
    if (m) keys.push(`${m[1]}-${m[2].padStart(2, '0')}`);
  }
  keys.sort();
  const fmt = (k?: string) => (k ? `${k.slice(0, 4)} . ${k.slice(5)} .` : '');
  return { from: fmt(keys[0]), to: fmt(keys[keys.length - 1]) };
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim() || '업체';
}

function emptyRecipient(entry: ArrearsEntryDto): BondRecipient {
  return { 상호: entry.companyName, 구분: '', 등록번호: entry.businessNo || '', 사업장주소: '', 실제주소: '' };
}

export default function CertifiedLetterModal({ entry, recipient, onRecords, onClose }: Props) {
  const certRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<LetterData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'download' | 'save'>('');
  const [done, setDone] = useState('');

  const [rcpt, setRcpt] = useState<BondRecipient>(() => recipient ?? emptyRecipient(entry));
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [amountText, setAmountText] = useState('');
  const [sentDate, setSentDate] = useState(todayIsoDate());
  const [noticeDate, setNoticeDate] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout(`/api/arrears/${entry.id}`, { cache: 'no-store' }, 20_000)
      .then(async res => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((d as { error?: string }).error || '미수 내역 조회 실패');
        return d as {
          item: ArrearsEntryDto;
          lines?: ArrearsLetterLineDto[];
          globalAsOfDate?: string;
          letterAsOfDate?: string;
        };
      })
      .then(d => {
        if (cancelled) return;
        const all = d.lines || [];
        // 미수 내역 화면 기본(미납 시점부터 표시)과 동일
        const cycle = hasPriorClosedLetterCycle(all) ? linesForCurrentLetterCycle(all) : all;
        const lines = filterHiddenCancelledTaxInvoiceLines(cycle, d.item.companyName);
        const globalAsOf = d.globalAsOfDate || '';
        const labelAsOf = globalAsOf || d.item.asOfDate || '';
        const letterDateLabel = formatArrearsLetterDate(
          resolveArrearsLetterAsOfDate(globalAsOf, { asOfDate: d.item.asOfDate, letterDate: '' }),
        );
        const labels = formatArrearsLetterLineLabels(lines, labelAsOf);
        const running = letterRunningBalances(lines);
        const period = periodFromLabels(labels.filter((_, i) => lines[i]!.amount > 0));
        setData({ lines, labelAsOf, letterDateLabel });
        setPeriodFrom(period.from);
        setPeriodTo(period.to);
        setAmountText((running.length ? running[running.length - 1]! : d.item.balance).toLocaleString('ko-KR'));
        setNoticeDate(letterDateLabel);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오기 실패');
      });
    return () => {
      cancelled = true;
    };
  }, [entry.id]);

  const labels = useMemo(
    () => (data ? formatArrearsLetterLineLabels(data.lines, data.labelAsOf) : []),
    [data],
  );
  const running = useMemo(() => (data ? letterRunningBalances(data.lines) : []), [data]);
  const amount = Number(amountText.replace(/[^\d]/g, '')) || 0;
  const companyLabel = rcpt.상호.trim() || entry.companyName;
  const filename = `내용증명_${safeName(companyLabel)}_첨부포함.pdf`;

  const setR = (k: keyof BondRecipient, v: string) => setRcpt(prev => ({ ...prev, [k]: v }) as BondRecipient);

  const buildPdf = async () => {
    const cert = certRef.current?.querySelector('.cert-letter') as HTMLElement | null;
    const notice = noticeRef.current?.querySelector('.arrears-letter') as HTMLElement | null;
    if (!cert || !notice) throw new Error('미리보기를 찾을 수 없습니다.');
    return buildMultiPagePdfBlob([cert, notice]);
  };

  const download = async (save: boolean) => {
    if (!rcpt.실제주소.trim() && !window.confirm('수신 주소가 비어 있습니다. 그대로 만들까요?')) return;
    setBusy(save ? 'save' : 'download');
    setError('');
    setDone('');
    try {
      const blob = await buildPdf();
      downloadBlob(blob, filename);
      if (save) {
        const { records } = await uploadBondAttachment({
          id: entry.id,
          step: '내용증명',
          file: new File([blob], filename, { type: 'application/pdf' }),
          filename,
          sentDate,
          source: 'generated',
          patch: { 내용증명: { checked: true, date: sentDate }, recipient: rcpt },
        });
        onRecords(records);
        setDone('발송서류로 저장했습니다. 내용증명 날짜도 발송일로 바뀌었습니다.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF 생성 실패');
    } finally {
      setBusy('');
    }
  };

  const field = (label: string, input: ReactNode) => (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      {label}
      {input}
    </label>
  );

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">내용증명 서식 생성</h3>
            <p className="text-xs text-slate-500">
              {entry.companyName} · 1쪽 내용증명 + 2쪽 미수 수수료 안내 (미수관리 내역 기준)
            </p>
          </div>
          <button type="button" className={portalBtnSecondary} disabled={!!busy} onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="w-80 shrink-0 space-y-3 overflow-y-auto border-r border-slate-100 p-4">
            <p className="text-xs font-bold text-slate-800">수신</p>
            {field('상호 (○○ 대표님 귀하)', <input className={portalInput} value={rcpt.상호} onChange={e => setR('상호', e.target.value)} />)}
            {field(
              '구분',
              <select className={portalInput} value={rcpt.구분} onChange={e => setR('구분', e.target.value)}>
                <option value="">선택</option>
                <option value="법인">법인 (법인등록번호)</option>
                <option value="개인">개인 (사업자등록번호)</option>
              </select>,
            )}
            {field('등록번호', <input className={portalInput} value={rcpt.등록번호} onChange={e => setR('등록번호', e.target.value)} />)}
            {field('사업장 주소', <textarea rows={2} className={portalInput} value={rcpt.사업장주소} onChange={e => setR('사업장주소', e.target.value)} />)}
            {field('실제 주소 (송달장소)', <textarea rows={2} className={portalInput} value={rcpt.실제주소} onChange={e => setR('실제주소', e.target.value)} />)}
            <p className="text-[11px] leading-snug text-slate-400">
              두 주소가 같으면 주소만, 다르면 등록번호와 「송달장소」로 표기됩니다.
            </p>

            <p className="pt-2 text-xs font-bold text-slate-800">본문</p>
            <div className="grid grid-cols-2 gap-2">
              {field('기간 시작', <input className={portalInput} value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} placeholder="2026 . 04 ." />)}
              {field('기간 끝', <input className={portalInput} value={periodTo} onChange={e => setPeriodTo(e.target.value)} placeholder="2026 . 08 ." />)}
            </div>
            {field('청구 금액(원)', <input className={`${portalInput} text-right tabular-nums`} value={amountText} onChange={e => setAmountText(e.target.value)} inputMode="numeric" />)}
            {field('발송일 (1쪽 날짜)', <input type="date" className={portalInput} value={sentDate} onChange={e => setSentDate(e.target.value)} />)}
            {field('미수 수수료 안내 날짜 (2쪽)', <input className={portalInput} value={noticeDate} onChange={e => setNoticeDate(e.target.value)} placeholder="2026.09.29" />)}

            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
            {done ? <p className="text-xs text-emerald-700">{done}</p> : null}

            <div className="flex flex-col gap-2 pt-2">
              <button type="button" className={portalBtnSecondary} disabled={!data || !!busy} onClick={() => void download(false)}>
                {busy === 'download' ? 'PDF 만드는 중…' : 'PDF 다운로드'}
              </button>
              <button type="button" className={portalBtnPrimary} disabled={!data || !!busy || !sentDate} onClick={() => void download(true)}>
                {busy === 'save' ? '저장 중…' : '다운로드 + 발송서류로 저장'}
              </button>
              <p className="text-[11px] leading-snug text-slate-400">파일명: {filename}</p>
            </div>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto bg-slate-100 p-6">
            {!data ? (
              <p className="py-20 text-center text-sm text-slate-500">{error || '미수 내역 불러오는 중…'}</p>
            ) : (
              <div className="mx-auto w-[720px] space-y-6">
                <div ref={certRef} className="shadow-sm">
                  <CertifiedLetterSheet
                    content={{
                      recipient: { ...rcpt, 상호: companyLabel },
                      periodFrom,
                      periodTo,
                      amount,
                      dateLabel: formatCertDate(sentDate),
                    }}
                  />
                </div>
                <div ref={noticeRef}>
                  <ArrearsLetterSheet
                    companyLabel={companyLabel}
                    letterDateLabel={noticeDate}
                    viewLines={data.lines}
                    labels={labels}
                    running={running}
                    emptyHint="등록된 미수 내역이 없습니다."
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
