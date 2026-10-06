'use client';

import { useEffect, useMemo, useState } from 'react';
import NoticeDefaultsLogTable from '@/app/arrears/bond/NoticeDefaultsLogTable';
import CenterModal from '@/app/components/portal/CenterModal';
import { portalBtnSecondary } from '@/app/components/portal/uiClasses';
import type {
  BondAttachmentStepKey,
  BondChangeLogEntry,
  BondDocLogEntry,
  BondNoticeDefaultsLogEntry,
  BondNoticeEdit,
} from '@/app/types/bond';

type Tab = BondAttachmentStepKey | 'defaults';

type Props = {
  log: BondDocLogEntry[];
  nextDocNo: string;
  defaultsLog: BondNoticeDefaultsLogEntry[];
  /** 미수관리 항목 id → 거래처명 */
  companyNames: Map<string, string>;
  canEditEntry: (entryId: string) => boolean;
  onEditNotice: (n: BondNoticeEdit) => void;
  initialTab?: Tab;
  onClose: () => void;
};

const STEP_TABS: BondAttachmentStepKey[] = ['내용증명', '해임통보', '회수일정', '지급명령'];

const dot = (iso: string) => (iso ? iso.replace(/-/g, '.') : '-');
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

function atKo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const TH = 'whitespace-nowrap border-r border-slate-200 px-2.5 py-2 text-center last:border-r-0';
const TD = 'whitespace-nowrap border-r border-slate-100 px-2.5 py-1.5 text-center last:border-r-0';

function ChangeLogTable({ rows, companyNames }: { rows: BondChangeLogEntry[]; companyNames: Map<string, string> }) {
  return (
    <div className="h-full overflow-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-100 font-bold text-slate-700">
          <tr>
            <th className={TH}>시각</th>
            <th className={TH}>처리자</th>
            <th className={TH}>거래처명</th>
            <th className={TH}>구분</th>
            <th className={TH}>내용</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                변경 이력이 없습니다.
              </td>
            </tr>
          ) : (
            rows.map((l, i) => (
              <tr key={`${l.at}-${l.entryId}-${i}`} className="text-slate-700">
                <td className={`${TD} tabular-nums text-slate-500`}>{atKo(l.at)}</td>
                <td className={TD}>{l.by || '-'}</td>
                <td className={`${TD} text-left font-medium text-slate-900`}>
                  {companyNames.get(l.entryId) || '(목록에 없음)'}
                </td>
                <td className={TD}>{l.action}</td>
                <td className="whitespace-pre-wrap break-all px-2.5 py-1.5 text-left">{l.detail || '-'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function DocLogTable({
  log,
  canEditEntry,
  onEdit,
}: {
  log: BondDocLogEntry[];
  canEditEntry: (entryId: string) => boolean;
  onEdit: (l: BondDocLogEntry) => void;
}) {
  return (
    <div className="h-full overflow-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-100 font-bold text-slate-700">
          <tr>
            <th className={TH}>문서번호</th>
            <th className={TH}>거래처명</th>
            <th className={TH}>버전</th>
            <th className={TH}>발송일</th>
            <th className={TH}>입금 기한</th>
            <th className={TH}>안내문 담당</th>
            <th className={TH}>생성</th>
            <th className={TH}>수정일</th>
            <th className={TH}>수정 사유</th>
            <th className={TH}>수정</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {log.length === 0 ? (
            <tr>
              <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                발급된 해임통보 안내문이 없습니다.
              </td>
            </tr>
          ) : (
            log.map((l, i) => (
              <tr key={`${l.docNo}-${l.issuedAt}-${i}`} className="text-slate-700">
                <td className={`${TD} font-semibold text-slate-900`} title={l.docNo}>
                  {l.docNo.replace(/^청년들-부산-추심-/, '')}
                  {!l.saved ? (
                    <span className="ml-1 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] font-normal text-slate-500">
                      PDF만
                    </span>
                  ) : null}
                </td>
                <td className={`${TD} text-left`}>{l.companyName || '-'}</td>
                <td className={TD}>{l.version}</td>
                <td className={TD}>{dot(l.sentDate)}</td>
                <td className={TD}>{dot(l.deadline)}</td>
                <td className={TD}>{l.contact?.담당 || '-'}</td>
                <td className={`${TD} text-slate-500`}>
                  {l.issuedBy} {atKo(l.issuedAt)}
                </td>
                <td className={`${TD} ${l.modifiedAt ? 'font-medium text-amber-700' : 'text-slate-400'}`}>
                  {l.modifiedAt ? `${l.modifiedBy ?? ''} ${atKo(l.modifiedAt)}` : '-'}
                </td>
                <td className="max-w-[240px] whitespace-normal break-all px-2.5 py-1.5 text-left text-slate-600">
                  {l.modifyReason || '-'}
                </td>
                <td className={TD}>
                  {l.saved && (l.version === '유예' || l.version === '기장') && canEditEntry(l.entryId) ? (
                    <button
                      type="button"
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => onEdit(l)}
                    >
                      수정
                    </button>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** 채권관리 이력관리 — 단계별 변경 이력 + 해임통보 발급 대장 + 일괄 날짜 이력 */
export default function BondHistoryModal({
  log: initialDocLog,
  nextDocNo,
  defaultsLog: initialDefaultsLog,
  companyNames,
  canEditEntry,
  onEditNotice,
  initialTab = '내용증명',
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState('');
  const [changeLog, setChangeLog] = useState<BondChangeLogEntry[] | null>(null);
  const [docLog, setDocLog] = useState(initialDocLog);
  const [defaultsLog, setDefaultsLog] = useState(initialDefaultsLog);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/arrears/bond/history', { cache: 'no-store' })
      .then(async res => {
        const d = (await res.json().catch(() => ({}))) as {
          error?: string;
          changeLog?: BondChangeLogEntry[];
          docLog?: BondDocLogEntry[];
          noticeDefaultsLog?: BondNoticeDefaultsLogEntry[];
        };
        if (!res.ok) throw new Error(d.error || '이력 조회 실패');
        if (cancelled) return;
        setChangeLog(d.changeLog ?? []);
        if (d.docLog) setDocLog(d.docLog);
        if (d.noticeDefaultsLog) setDefaultsLog(d.noticeDefaultsLog);
      })
      .catch(e => {
        if (!cancelled) setError(e instanceof Error ? e.message : '이력 조회 실패');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const qn = norm(q);
  const matchCompany = (name: string) => !qn || norm(name).includes(qn);
  const stepRows = useMemo(() => {
    const by = new Map<BondAttachmentStepKey, BondChangeLogEntry[]>(STEP_TABS.map(s => [s, []]));
    for (const l of changeLog ?? []) by.get(l.step)?.push(l);
    return by;
  }, [changeLog]);

  const tabBtn = (key: Tab, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setTab(key)}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
        tab === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );

  const filteredSteps = (step: BondAttachmentStepKey) =>
    (stepRows.get(step) ?? []).filter(l => matchCompany(companyNames.get(l.entryId) || ''));

  return (
    <CenterModal
      open
      title="채권관리 이력관리"
      description="단계별로 누가 언제 무엇을 바꿨는지 최신순으로 표시합니다."
      onClose={onClose}
      widthClass="max-w-6xl"
    >
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {STEP_TABS.map(s => {
          const changes = changeLog ? (stepRows.get(s)?.length ?? 0) : null;
          if (s === '해임통보') {
            return tabBtn(s, `해임통보 (발급 ${docLog.length}${changes === null ? '' : ` · 변경 ${changes}`})`);
          }
          return tabBtn(s, `${s}${changes === null ? '' : ` (${changes})`}`);
        })}
        {tabBtn('defaults', `해임통보 일괄 날짜 (${defaultsLog.length})`)}
        {tab !== 'defaults' ? (
          <input
            className="ml-auto h-8 w-56 rounded-md border border-slate-300 px-2 text-xs outline-none focus:border-blue-400"
            placeholder="거래처명 검색"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        ) : null}
      </div>

      {error ? <p className="mb-2 text-xs text-rose-600">{error}</p> : null}

      <div className="h-[calc(100vh-17rem)] max-h-[680px] min-h-[300px]">
        {tab === 'defaults' ? (
          <NoticeDefaultsLogTable log={defaultsLog} />
        ) : (
          <div className="flex h-full flex-col gap-3">
            {tab === '해임통보' ? (
              <section className="flex min-h-0 flex-[3] flex-col">
                <h3 className="mb-1 shrink-0 text-xs font-bold text-slate-700">
                  안내문 발급 대장{' '}
                  <span className="font-normal text-slate-500">· 문서번호 순 · 다음 번호 {nextDocNo || '-'}</span>
                </h3>
                <div className="min-h-0 flex-1">
                  <DocLogTable
                    log={docLog.filter(l => matchCompany(l.companyName))}
                    canEditEntry={canEditEntry}
                    onEdit={l =>
                      onEditNotice({
                        entryId: l.entryId,
                        docNo: l.docNo,
                        version: l.version,
                        sentDate: l.sentDate,
                        deadline: l.deadline,
                        contact: l.contact,
                        recipientName: l.recipientName,
                        period: l.period,
                        amount: l.amount,
                      })
                    }
                  />
                </div>
              </section>
            ) : null}
            <section className="flex min-h-0 flex-[2] flex-col">
              {tab === '해임통보' ? (
                <h3 className="mb-1 shrink-0 text-xs font-bold text-slate-700">
                  전체 변경 기록{' '}
                  <span className="font-normal text-slate-500">
                    · 해임통보 날짜 변경, 파일 추가·삭제, 안내문 발급·수정(사유 포함)을 시간순으로 남김
                  </span>
                </h3>
              ) : null}
              {changeLog === null && !error ? (
                <p className="py-10 text-center text-xs text-slate-500">이력 불러오는 중…</p>
              ) : (
                <div className="min-h-0 flex-1">
                  <ChangeLogTable rows={filteredSteps(tab)} companyNames={companyNames} />
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" className={portalBtnSecondary} onClick={onClose}>
          닫기
        </button>
      </div>
    </CenterModal>
  );
}
