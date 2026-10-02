'use client';

import { useMemo, useRef, useState } from 'react';
import CenterModal from '@/app/components/portal/CenterModal';
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';
import {
  formatSentDateKo,
  todayIsoDate,
  type BondAttachment,
  type BondAttachmentStepKey,
  type BondStoredRecord,
} from '@/app/types/bond';
import { deleteBondAttachment, signBondAttachmentUrl, uploadBondAttachment } from '@/app/arrears/bond/bondUpload';
import { readPdfCreationDate } from '@/app/arrears/bond/pdfCreationDate';

type Props = {
  open: boolean;
  entryId: string;
  step: BondAttachmentStepKey;
  companyName: string;
  attachments: BondAttachment[];
  /** 업로드 기본 발송일 — 해당 단계 날짜 */
  defaultSentDate: string;
  onRecords: (records: Record<string, BondStoredRecord>) => void;
  onClose: () => void;
  readOnly?: boolean;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim() || '업체';
}

/** 2026-09-29_내용증명_OO업체.pdf — 같은 이름이면 (2), (3) … */
function buildFilename(
  sentDate: string,
  stepLabel: string,
  companyName: string,
  original: string,
  taken: Set<string>,
): string {
  const dot = original.lastIndexOf('.');
  const ext = dot > 0 ? original.slice(dot) : '';
  return uniqueName(`${sentDate || todayIsoDate()}_${stepLabel}_${safeName(companyName)}`, ext, taken);
}

function uniqueName(base: string, ext: string, taken: Set<string>): string {
  let name = `${base}${ext}`;
  for (let n = 2; taken.has(name); n++) name = `${base}(${n})${ext}`;
  taken.add(name);
  return name;
}

/** 전자소송 보관용 원래 파일명 유지 */
function keepOriginalName(original: string, taken: Set<string>): string {
  const dot = original.lastIndexOf('.');
  const base = (dot > 0 ? original.slice(0, dot) : original).replace(/[\\/:*?"<>|]/g, '').trim() || '지급명령';
  return uniqueName(base, dot > 0 ? original.slice(dot) : '', taken);
}

export default function BondAttachmentModal({
  open,
  entryId,
  step,
  companyName,
  attachments,
  defaultSentDate,
  onRecords,
  onClose,
  readOnly,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sentDate, setSentDate] = useState(defaultSentDate || todayIsoDate());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isOrder = step === '지급명령';

  /** 최근 발송일 먼저, 같은 날 안에서는 올린 순 */
  const groups = useMemo(() => {
    const map = new Map<string, BondAttachment[]>();
    for (const a of attachments) {
      const k = a.sentDate || '';
      map.set(k, [...(map.get(k) ?? []), a]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === b ? 0 : !a ? 1 : !b ? -1 : b.localeCompare(a)))
      .map(([date, list]) => ({
        date,
        list: [...list].sort((x, y) => x.uploadedAt.localeCompare(y.uploadedAt)),
      }));
  }, [attachments]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('upload');
    setError('');
    setNotice('');
    const taken = new Set(attachments.map(a => a.filename));
    try {
      for (const f of [...files]) {
        if (isOrder) {
          const read = /\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? await readPdfCreationDate(f) : '';
          const date = read || sentDate;
          const { records } = await uploadBondAttachment({
            id: entryId,
            step,
            file: f,
            filename: keepOriginalName(f.name, taken),
            sentDate: date,
            patch: { 지급명령: { checked: true, date } },
          });
          onRecords(records);
          setNotice(
            read
              ? `PDF 작성일 ${formatSentDateKo(date)}을 신청일로 기록했습니다.`
              : `PDF 작성일을 찾지 못해 ${formatSentDateKo(date)}로 기록했습니다.`,
          );
          continue;
        }
        const { records } = await uploadBondAttachment({
          id: entryId,
          step,
          file: f,
          filename: buildFilename(sentDate, step, companyName, f.name, taken),
          sentDate,
        });
        onRecords(records);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패');
    } finally {
      setBusy('');
    }
  };

  const openFile = async (att: BondAttachment, download: boolean) => {
    // 팝업 차단 회피: 클릭 시점에 창을 먼저 연 뒤 URL 지정
    const win = download ? null : window.open('', '_blank');
    setError('');
    try {
      const url = await signBondAttachmentUrl(entryId, step, att.id, download);
      if (win) win.location.href = url;
      else {
        const a = document.createElement('a');
        a.href = url;
        a.download = att.filename;
        a.click();
      }
    } catch (e) {
      win?.close();
      setError(e instanceof Error ? e.message : '파일 열기 실패');
    }
  };

  const remove = async (att: BondAttachment) => {
    if (!window.confirm(`「${att.filename}」을(를) 삭제할까요?`)) return;
    setBusy(att.id);
    setError('');
    try {
      onRecords(await deleteBondAttachment(entryId, step, att.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setBusy('');
    }
  };

  return (
    <CenterModal open={open} title={`${step} 서류`} description={companyName} onClose={onClose} widthClass="max-w-2xl">
      <div className="space-y-3">
        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="hidden"
              onChange={e => {
                void addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              {isOrder ? '신청일' : '발송일'}
              <input
                type="date"
                className={`${portalInput} w-auto py-1 text-xs`}
                value={sentDate}
                onChange={e => setSentDate(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={portalBtnPrimary}
              disabled={!!busy || !sentDate}
              onClick={() => inputRef.current?.click()}
            >
              {busy === 'upload' ? '올리는 중…' : '파일 업로드'}
            </button>
            {isOrder ? (
              <p className="w-full text-[11px] text-slate-500">
                전자소송 보관용 PDF를 올리면 PDF 작성일을 읽어 지급명령 체크·날짜를 자동 기록합니다. (못 읽으면 위 신청일 사용)
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        {notice ? <p className="text-xs text-emerald-700">{notice}</p> : null}

        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
            보관된 서류가 없습니다.
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map(g => (
              <section key={g.date || 'none'}>
                <h3 className="mb-1 text-xs font-bold text-slate-700">
                  {g.date ? `${formatSentDateKo(g.date)} ${isOrder ? '신청' : '발송'} 서류` : '발송일 미지정'}
                </h3>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {g.list.map(att => (
                    <li key={att.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left font-medium text-blue-800 hover:underline"
                        title="새 탭에서 보기"
                        onClick={() => void openFile(att, false)}
                      >
                        {att.filename}
                      </button>
                      {att.source === 'generated' ? (
                        <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">서식생성</span>
                      ) : null}
                      <span className="w-16 shrink-0 text-right tabular-nums text-slate-500">
                        {formatSize(att.size)}
                      </span>
                      <button type="button" className={portalBtnSecondary} onClick={() => void openFile(att, true)}>
                        다운로드
                      </button>
                      {!readOnly ? (
                        <button
                          type="button"
                          className="shrink-0 rounded px-2 py-1 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          disabled={busy === att.id}
                          onClick={() => void remove(att)}
                        >
                          삭제
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </CenterModal>
  );
}
