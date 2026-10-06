'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import DismissalNoticeSheet, {
  NOTICE_KIND_LABEL,
  type DismissalNoticeKind,
} from '@/app/arrears/bond/DismissalNoticeSheet';
import { uploadBondAttachment } from '@/app/arrears/bond/bondUpload';
import { useArrearsLetterData } from '@/app/arrears/bond/useArrearsLetterData';
import { portalBtnPrimary, portalBtnSecondary, portalInput } from '@/app/components/portal/uiClasses';
import type { ArrearsEntryDto } from '@/app/types/arrears';
import {
  type BondContact,
  type BondNotice,
  type BondNoticeDefaults,
  type BondRecipient,
} from '@/app/types/bond';
import { buildMultiPagePdfBlob, downloadBlob } from '@/lib/arrearsLetterPdf';

type Props = {
  entry: ArrearsEntryDto;
  /** 해임 구분으로 정해지는 공문 종류 (유예·기장) */
  kind: DismissalNoticeKind;
  /** 화면 표시용 해임 구분 이름 */
  churnLabel: string;
  recipient?: BondRecipient;
  notices: BondNotice[];
  contact: BondContact;
  /** 담당 선택 목록 (기본값 + 이전에 쓴 담당) */
  contacts: BondContact[];
  /** 관리자가 지정한 발신일자·입금기한 일괄값 (빈 값이면 오늘·7일 뒤) */
  defaults: BondNoticeDefaults;
  nextDocNo: string;
  /** 문서번호 선택 목록 (다음 번호부터 연속) */
  docNoOptions: string[];
  /** PATCH 응답(records·contact·nextDocNo) 반영 */
  onPayload: (data: unknown) => void;
  onClose: () => void;
};

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim() || '업체';
}

type PickOption = { value: string; label: string };

/** 직접 입력 + ▾ 목록에서 선택 */
function PickInput({
  value,
  onChange,
  options,
  onPick,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: PickOption[];
  onPick?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex gap-1">
      <input className={`${portalInput} min-w-0 flex-1`} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      {options.length ? (
        <select
          aria-label="목록에서 선택"
          title="목록에서 선택"
          className={`${portalInput} w-10 shrink-0 cursor-pointer px-1`}
          value=""
          onChange={e => {
            if (!e.target.value) return;
            (onPick ?? onChange)(e.target.value);
          }}
        >
          <option value="">▾</option>
          {options.map((o, i) => (
            <option key={`${o.value}-${i}`} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

export default function DismissalNoticeModal({
  entry,
  kind,
  churnLabel,
  recipient,
  notices,
  contact: savedContact,
  contacts,
  defaults,
  nextDocNo,
  docNoOptions,
  onPayload,
  onClose,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { data, error: loadError } = useArrearsLetterData(entry.id);
  const version = kind;
  const [docNo, setDocNo] = useState(nextDocNo);
  const [sentDate, setSentDate] = useState(defaults.sentDate);
  const [recipientName, setRecipientName] = useState(recipient?.상호 || entry.companyName);
  const [periodEdit, setPeriod] = useState<string | null>(null);
  const [amountEdit, setAmountText] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(defaults.deadline);
  const [contact, setContact] = useState<BondContact>(savedContact);
  const [saveContact, setSaveContact] = useState(false);
  const [busy, setBusy] = useState<'' | 'download' | 'save'>('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const datesReady = !!sentDate && !!deadline;
  const period =
    periodEdit ??
    (data?.firstMonth ? `${data.firstMonth.replace('-', '.')} ~ ${data.lastMonth.replace('-', '.')}` : '');
  const amountText = amountEdit ?? (data ? data.balance.toLocaleString('ko-KR') : '');
  const amount = Number(amountText.replace(/[^\d]/g, '')) || 0;
  const filename = `세무보수_미수금_안내문_${safeName(recipientName)}_v.${kind}.pdf`;

  const docNoPick: PickOption[] = [
    ...(docNoOptions.length ? docNoOptions : [nextDocNo]).map((v, i) => ({
      value: v,
      label: i === 0 ? `${v} (다음 번호)` : v,
    })),
    ...notices.map(n => ({ value: n.docNo, label: `${n.docNo} (이전 ${n.version} · ${n.sentDate})` })),
  ].filter(o => o.value);
  const contactKey = (c: BondContact) => `${c.담당}|${c.전화}|${c.이메일}`;
  const contactPick: PickOption[] = contacts.map(c => ({
    value: contactKey(c),
    label: [c.담당, c.전화, c.이메일].filter(Boolean).join(' · '),
  }));
  const phonePick = uniq(contacts.map(c => c.전화)).map(v => ({ value: v, label: v }));
  const emailPick = uniq(contacts.map(c => c.이메일)).map(v => ({ value: v, label: v }));
  const pickContact = (key: string) => {
    const c = contacts.find(x => contactKey(x) === key);
    if (c) setContact(c);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const run = async (save: boolean) => {
    const pages = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>('.notice-page') ?? []);
    if (!pages.length) return;
    setBusy(save ? 'save' : 'download');
    setError('');
    setDone('');
    try {
      const blob = await buildMultiPagePdfBlob(pages);
      downloadBlob(blob, filename);
      if (save) {
        await uploadBondAttachment({
          id: entry.id,
          step: '해임통보',
          file: blob,
          filename,
          sentDate,
          source: 'generated',
          patch: { 해임통보: { date: sentDate } },
        });
      }
      const res = await fetch('/api/arrears/bond', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: save
            ? [
                {
                  id: entry.id,
                  patch: { 해임통보: { date: sentDate } },
                  appendNotice: { version, docNo, sentDate, deadline, contact },
                },
              ]
            : [],
          contact: save && saveContact ? contact : undefined,
          usedDocNo: docNo,
          issue: {
            entryId: entry.id,
            companyName: entry.companyName,
            version,
            sentDate,
            deadline,
            contact,
          },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d as { error?: string }).error || (save ? '기록 저장 실패' : '문서번호 반영 실패'));
      onPayload(d);
      setDone(
        save
          ? '해임통보 폴더에 PDF를 저장하고 발송 기록을 남겼습니다.'
          : `PDF를 만들었습니다. 다음 문서번호는 ${(d as { nextDocNo?: string }).nextDocNo ?? ''}입니다.`,
      );
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
              {entry.companyName} · 해임 상태 {churnLabel}
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
              '공문 종류 (해임 구분으로 자동 결정)',
              <p className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-semibold text-slate-800">
                {NOTICE_KIND_LABEL[kind]}
              </p>,
            )}
            {field('문서번호', <PickInput value={docNo} onChange={setDocNo} options={docNoPick} />)}
            {field('발신일자 (일괄 저장값, 수정 가능)', <input type="date" className={portalInput} value={sentDate} onChange={e => setSentDate(e.target.value)} />)}
            {field('수신 (○○ 대표님 귀하)', <input className={portalInput} value={recipientName} onChange={e => setRecipientName(e.target.value)} />)}
            {field('귀속기간', <input className={portalInput} value={period} onChange={e => setPeriod(e.target.value)} placeholder="2018.07 ~ 2026.08" />)}
            {field('금액(원)', <input className={`${portalInput} text-right tabular-nums`} value={amountText} onChange={e => setAmountText(e.target.value)} inputMode="numeric" />)}
            {field(
              `${kind === '기장' ? '입금 기한 (다음 날 계약 해지)' : '입금 기한'} · 일괄 저장값`,
              <input type="date" className={portalInput} value={deadline} onChange={e => setDeadline(e.target.value)} />,
            )}

            <p className="pt-2 text-xs font-bold text-slate-800">담당 (7항 아래)</p>
            {field(
              '담당 (업체 담당자 기준 자동, 선택 시 전화·이메일 함께)',
              <PickInput
                value={contact.담당}
                onChange={v => setC('담당', v)}
                options={contactPick}
                onPick={pickContact}
                placeholder="TAX팀 김평진 팀장"
              />,
            )}
            {field('전화', <PickInput value={contact.전화} onChange={v => setC('전화', v)} options={phonePick} />)}
            {field('이메일', <PickInput value={contact.이메일} onChange={v => setC('이메일', v)} options={emailPick} />)}
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" className="rounded border-slate-300" checked={saveContact} onChange={e => setSaveContact(e.target.checked)} />
              이 담당을 기본값으로 저장 (기록 저장 시)
            </label>

            {error || loadError ? <p className="text-xs text-rose-600">{error || loadError}</p> : null}
            {done ? <p className="text-xs text-emerald-700">{done}</p> : null}

            <div className="flex flex-col gap-2 pt-2">
              {!datesReady ? <p className="text-xs text-amber-600">발신일자와 입금 기한이 있어야 생성할 수 있습니다.</p> : null}
              <button type="button" className={portalBtnSecondary} disabled={!data || !!busy || !datesReady} onClick={() => void run(false)}>
                {busy === 'download' ? 'PDF 만드는 중…' : 'PDF 다운로드'}
              </button>
              <button type="button" className={portalBtnPrimary} disabled={!data || !!busy || !datesReady || !docNo.trim()} onClick={() => void run(true)}>
                {busy === 'save' ? '저장 중…' : '다운로드 + 기록 저장'}
              </button>
              <p className="text-[11px] leading-snug text-slate-400">
                기록 저장 = PDF를 해임통보 폴더에 올리고, 해임통보 날짜를 발신일로, 버전·문서번호·기한을 발송 기록에 남김. 파일명: {filename}
              </p>
            </div>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto bg-slate-100 p-6">
            {!data ? (
              <p className="py-20 text-center text-sm text-slate-500">{loadError || '미수 내역 불러오는 중…'}</p>
            ) : (
              <div ref={sheetRef} className="mx-auto w-[720px]">
                <DismissalNoticeSheet
                  content={{ kind, docNo, sentDate, recipientName, period, amount, deadline, contact }}
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
