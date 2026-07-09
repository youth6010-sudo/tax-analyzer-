import NoticeRichTextField from './NoticeRichTextField';
import { NOTICE_EDITOR_SHORTCUT_HINT } from '../_lib/noticeEditorShortcuts';
import {
  noticeBtnPrimary,
  noticeLabel,
  noticeSection,
  noticeSectionTitle,
  noticeTwoCol,
} from './noticeUi';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

type Props = {
  materials: string;
  onMaterialsChange: (value: string) => void;
  materialsPlaceholder?: string;
  notes: string;
  onNotesChange: (value: string) => void;
  notesPlaceholder?: string;
  clientLinked?: boolean;
  saveState?: SaveState;
  showPayroll?: boolean;
  payrollByUs?: boolean;
  onPayrollChange?: (value: boolean) => void;
  onSave?: () => void;
};

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'saving') {
    return <span className="text-[11px] font-semibold text-slate-400">저장 중…</span>;
  }
  if (state === 'saved') {
    return <span className="text-[11px] font-semibold text-emerald-600">저장됨</span>;
  }
  if (state === 'error') {
    return <span className="text-[11px] font-semibold text-red-600">저장 실패</span>;
  }
  return null;
}

export default function CompanyNotesField({
  materials,
  onMaterialsChange,
  materialsPlaceholder,
  notes,
  onNotesChange,
  notesPlaceholder,
  clientLinked = false,
  saveState = 'idle',
  showPayroll = false,
  payrollByUs = false,
  onPayrollChange,
  onSave,
}: Props) {
  return (
    <section className={noticeSection}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className={noticeSectionTitle}>수임처 정보</h2>
        <span className="text-[10px] text-slate-400">{NOTICE_EDITOR_SHORTCUT_HINT}</span>
      </div>

      <div className={`${noticeTwoCol} mt-3`}>
        <div className="min-w-0">
          <label className={noticeLabel}>
            기존 수취 자료
            {clientLinked && (
              <span className="font-normal text-slate-400"> (세목별 저장)</span>
            )}
          </label>
          <NoticeRichTextField
            value={materials}
            onChange={onMaterialsChange}
            rows={5}
            placeholder={materialsPlaceholder ?? '- 매출/매입 세금계산서\n- 카드/현금영수증 매출 내역'}
          />
        </div>

        <div className="min-w-0">
          <label className={noticeLabel}>특이사항</label>
          <NoticeRichTextField
            value={notes}
            onChange={onNotesChange}
            rows={5}
            placeholder={notesPlaceholder ?? '예) 4분기 매입 세금계산서는 이미 수령함.'}
          />
        </div>
      </div>

      {clientLinked && onSave && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          {showPayroll ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={payrollByUs}
                onChange={e => onPayrollChange?.(e.target.checked)}
                className="h-4 w-4 shrink-0 accent-blue-600"
              />
              <span>
                <span className="font-semibold text-slate-800">급여대장 작성</span>
                <span className="text-slate-500"> (우리가 작성)</span>
              </span>
            </label>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <SaveBadge state={saveState} />
            <button
              type="button"
              onClick={onSave}
              disabled={saveState === 'saving'}
              className={`${noticeBtnPrimary} disabled:opacity-60`}
            >
              수임처에 저장
            </button>
          </div>
        </div>
      )}

      {!clientLinked && showPayroll && (
        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={payrollByUs}
            onChange={e => onPayrollChange?.(e.target.checked)}
            className="h-4 w-4 shrink-0 accent-blue-600"
          />
          <span>
            <span className="font-semibold text-slate-800">급여대장 작성</span>
            {' — '}체크 시 신고안내, 미체크 시 자료요청 문구
          </span>
        </label>
      )}
    </section>
  );
}
