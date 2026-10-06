'use client';

import CenterModal from '@/app/components/portal/CenterModal';
import { portalBtnSecondary } from '@/app/components/portal/uiClasses';
import type { BondDocLogEntry } from '@/app/types/bond';

type Props = {
  log: BondDocLogEntry[];
  nextDocNo: string;
  onClose: () => void;
};

const dot = (iso: string) => (iso ? iso.replace(/-/g, '.') : '-');

function issuedAtKo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const TH = 'whitespace-nowrap border-r border-slate-200 px-2.5 py-2 text-center last:border-r-0';
const TD = 'whitespace-nowrap border-r border-slate-100 px-2.5 py-1.5 text-center last:border-r-0';

export default function DismissalDocLogModal({ log, nextDocNo, onClose }: Props) {
  return (
    <CenterModal
      open
      title="해임통보 안내문 발급 대장"
      description={`문서번호 순으로 표시합니다. 다음 문서번호: ${nextDocNo || '-'}`}
      onClose={onClose}
      widthClass="max-w-5xl"
    >
      <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-100 font-bold text-slate-700">
            <tr>
              <th className={TH}>문서번호</th>
              <th className={TH}>거래처명</th>
              <th className={TH}>버전</th>
              <th className={TH}>발송일</th>
              <th className={TH}>입금 기한</th>
              <th className={TH}>안내문 담당</th>
              <th className={TH}>저장</th>
              <th className={TH}>생성</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {log.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                  발급된 해임통보 안내문이 없습니다.
                </td>
              </tr>
            ) : (
              log.map((l, i) => (
                <tr key={`${l.docNo}-${l.issuedAt}-${i}`} className="text-slate-700">
                  <td className={`${TD} font-semibold text-slate-900`}>{l.docNo}</td>
                  <td className={`${TD} text-left`}>{l.companyName || '-'}</td>
                  <td className={TD}>{l.version}</td>
                  <td className={TD}>{dot(l.sentDate)}</td>
                  <td className={TD}>{dot(l.deadline)}</td>
                  <td className={TD}>{l.contact?.담당 || '-'}</td>
                  <td className={TD}>
                    {l.saved ? (
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                        폴더 저장
                      </span>
                    ) : (
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-500">
                        PDF만
                      </span>
                    )}
                  </td>
                  <td className={`${TD} text-slate-500`}>
                    {l.issuedBy} {issuedAtKo(l.issuedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" className={portalBtnSecondary} onClick={onClose}>
          닫기
        </button>
      </div>
    </CenterModal>
  );
}
