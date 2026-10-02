'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import DismissalNoticeSheet, {
  formatNoticeDate,
  NOTICE_FILE_VERSION,
  NOTICE_VERSION_LABEL,
} from '@/app/arrears/bond/DismissalNoticeSheet';
import { useArrearsLetterData } from '@/app/arrears/bond/useArrearsLetterData';
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';
import { arrearsChurnStatusLabel, type ArrearsEntryDto } from '@/app/types/arrears';
import {
  todayIsoDate,
  type BondContact,
  type BondNotice,
  type BondNoticeVersion,
  type BondRecipient,
} from '@/app/types/bond';
import { buildMultiPagePdfBlob, downloadBlob } from '@/lib/arrearsLetterPdf';

type Props = {
  entry: ArrearsEntryDto;
  recipient?: BondRecipient;
  notices: BondNotice[];
  contact: BondContact;
  nextDocNo: string;
  /** PATCH 응답(records·contact·nextDocNo) 반영 */
  onPayload: (data: unknown) => void;
  onClose: () => void;
};

const VERSIONS: BondNoticeVersion[] = ['v1', 'v1.5', 'v2'];

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim() || '업체';
}

/** 확정 → v2, 대기·유예·특수 → v1 (저장된 v1 기한이 지났으면 v1.5) */
function defaultVersion(status: string, lastV1: BondNotice | undefined, today: string): BondNoticeVersion {
  if (status === 'confirmed') return 'v2';
  if (lastV1?.deadline && lastV1.deadline < today) return 'v1.5';
  return 'v1';
}

export default function DismissalNoticeModal({
  entry,
  recipient,
  notices,
  contact: savedContact,
  nextDocNo,
  onPayload,
  onClose,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { data, error: loadError } = useArrearsLetterData(entry.id);
  const today = todayIsoDate();
  const lastV1 = [...notices].reverse().find(n => n.version === 'v1');

  const [version, setVersion] = useState<BondNoticeVersion>(() =>
    defaultVersion(entry.churnMgmtStatus, lastV1, today),
  );
  const [docNo, setDocNo] = useState(nextDocNo);
  const [sentDate, setSentDate] = useState(today);
  const [closingDateEdit, setClosingDate] = useState<string | null>(null);
  const [recipientName, setRecipientName] = useState(recipient?.상호 || entry.companyName);
  const [periodEdit, setPeriod] = useState<string | null>(null);
  const [amountEdit, setAmountText] = useState<string | null>(null);
  const [deadlineEdit, setDeadline] = useState<string | null>(null);
  const [prevDeadline, setPrevDeadline] = useState(lastV1?.deadline ?? '');
  const [contact, setContact] = useState<BondContact>(savedContact);
  const [saveContact, setSaveContact] = useState(false);
  const [busy, setBusy] = useState<'' | 'download' | 'save'>('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const closingDate = closingDateEdit ?? sentDate;
  const deadline = deadlineEdit ?? addDays(sentDate, 7);
  const period =
    periodEdit ??
    (data?.firstMonth ? `${data.firstMonth.replace('-', '.')} ~ ${data.lastMonth.replace('-', '.')}` : '');
  const amountText = amountEdit ?? (data ? data.balance.toLocaleString('ko-KR') : '');
  const amount = Number(amountText.replace(/[^\d]/g, '')) || 0;
  const filename = `세무보수_미수금_안내문_${safeName(recipientName)}_${NOTICE_FILE_VERSION[version]}.pdf`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const run = async (save: boolean) => {
    if (version === 'v1.5' && !prevDeadline && !window.confirm('v1 입금 기한이 비어 있습니다. 그대로 만들까요?')) return;
    const pages = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('.notice-page') ?? []);
    if (!pages.length) return;
    setBusy(save ? 'save' : 'download');
    setError('');
    setDone('');
    try {
      downloadBlob(await buildMultiPagePdfBlob(pages), filename);
      if (save) {
        const res = await fetch('/api/arrears/bond', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: [
              {
                id: entry.id,
                patch: { 해임통보: { date: sentDate } },
                appendNotice: { version, docNo, sentDate, deadline: version === 'v1.5' ? '' : deadline },
              },
            ],
            contact: saveContact ? contact : undefined,
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((d as { error?: string }).error || '기록 저장 실패');
        onPayload(d);
        setDone('발송 기록을 저장했습니다. 보낸 안내문 스캔본은 해임통보 폴더에 올려 주세요.');
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
  const setC = (k: keyof BondContact, v: string) => setContact(prev => ({ ...prev, [k]: v }));

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="flex w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">해임통보 안내문 생성</h3>
            <p className="text-xs text-slate-500">
              {entry.companyName} · 해임 상태 {arrearsChurnStatusLabel(entry.churnMgmtStatus) || '없음'}
              {notices.length
                ? ` · 발송 기록 ${notices.map(n => `${n.version}(${n.sentDate.slice(5).replace('-', '/')})`).join(', ')}`
                : ''}
            </p>
          </div>
          <button type="button" className={portalBtnSecondary} disabled={!!busy} onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="w-80 shrink-0 space-y-3 overflow-y-auto border-r border-slate-100 p-4">
            {field(
              '버전',
              <select
                className={portalInput}
                value={version}
                onChange={e => setVersion(e.target.value as BondNoticeVersion)}
              >
                {VERSIONS.map(v => (
                  <option key={v} value={v}>
                    {NOTICE_VERSION_LABEL[v]}
                  </option>
                ))}
              </select>,
            )}
            {field('문서번호', <input className={portalInput} value={docNo} onChange={e => setDocNo(e.target.value)} />)}
            <div className="grid grid-cols-2 gap-2">
              {field('발신일자', <input type="date" className={portalInput} value={sentDate} onChange={e => setSentDate(e.target.value)} />)}
              {field('끝 날짜', <input type="date" className={portalInput} value={closingDate} onChange={e => setClosingDate(e.target.value)} />)}
            </div>
            {field('수신 (○○ 대표님 귀하)', <input className={portalInput} value={recipientName} onChange={e => setRecipientName(e.target.value)} />)}
            {field('귀속기간', <input className={portalInput} value={period} onChange={e => setPeriod(e.target.value)} placeholder="2018.07 ~ 2026.08" />)}
            {field('금액(원)', <input className={`${portalInput} text-right tabular-nums`} value={amountText} onChange={e => setAmountText(e.target.value)} inputMode="numeric" />)}
            {version === 'v1.5'
              ? field('v1 입금 기한 (2항 인용)', <input type="date" className={portalInput} value={prevDeadline} onChange={e => setPrevDeadline(e.target.value)} />)
              : field('입금 기한', <input type="date" className={portalInput} value={deadline} onChange={e => setDeadline(e.target.value)} />)}

            <p className="pt-2 text-xs font-bold text-slate-800">담당 (7항 아래)</p>
            {field('담당', <input className={portalInput} value={contact.담당} onChange={e => setC('담당', e.target.value)} placeholder="TAX팀 김평진 팀장" />)}
            {field('전화', <input className={portalInput} value={contact.전화} onChange={e => setC('전화', e.target.value)} />)}
            {field('이메일', <input className={portalInput} value={contact.이메일} onChange={e => setC('이메일', e.target.value)} />)}
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" className="rounded border-slate-300" checked={saveContact} onChange={e => setSaveContact(e.target.checked)} />
              이 담당을 기본값으로 저장 (기록 저장 시)
            </label>

            {error || loadError ? <p className="text-xs text-rose-600">{error || loadError}</p> : null}
            {done ? <p className="text-xs text-emerald-700">{done}</p> : null}

            <div className="flex flex-col gap-2 pt-2">
              <button type="button" className={portalBtnSecondary} disabled={!data || !!busy} onClick={() => void run(false)}>
                {busy === 'download' ? 'PDF 만드는 중…' : 'PDF 다운로드'}
              </button>
              <button type="button" className={portalBtnPrimary} disabled={!data || !!busy || !sentDate || !docNo.trim()} onClick={() => void run(true)}>
                {busy === 'save' ? '저장 중…' : '다운로드 + 기록 저장'}
              </button>
              <p className="text-[11px] leading-snug text-slate-400">
                기록 저장 = 해임통보 날짜를 발신일로, 버전·문서번호·기한을 발송 기록에 남김. 파일명: {filename}
              </p>
            </div>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto bg-slate-100 p-6">
            {!data ? (
              <p className="py-20 text-center text-sm text-slate-500">{loadError || '미수 내역 불러오는 중…'}</p>
            ) : (
              <div ref={sheetRef} className="mx-auto w-[720px]">
                <DismissalNoticeSheet
                  content={{
                    version,
                    docNo,
                    sentDateLabel: formatNoticeDate(sentDate),
                    recipientName,
                    period,
                    amount,
                    deadlineLabel: formatNoticeDate(deadline),
                    prevDeadlineLabel: formatNoticeDate(prevDeadline),
                    closingDateLabel: formatNoticeDate(closingDate),
                    contact,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
