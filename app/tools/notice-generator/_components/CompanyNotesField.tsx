import type { ReactNode } from 'react';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  companyName: string;
  onCompanyNameChange: (value: string) => void;
  materials: string;
  onMaterialsChange: (value: string) => void;
  materialsPlaceholder?: string;
  notes: string;
  onNotesChange: (value: string) => void;
  notesPlaceholder?: string;
  clientLinked?: boolean;
  saveState?: SaveState;
  clientPicker?: ReactNode;
  // 원천세 전용: 급여대장 작성 체크박스
  showPayroll?: boolean;
  payrollByUs?: boolean;
  onPayrollChange?: (value: boolean) => void;
  // 수임처 연결 시 명시적 저장
  onSave?: () => void;
};

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'saving') {
    return <span className="text-[11px] font-semibold text-slate-400">저장 중…</span>;
  }
  if (state === 'saved') {
    return <span className="text-[11px] font-semibold text-emerald-600">저장됨 ✓</span>;
  }
  if (state === 'error') {
    return <span className="text-[11px] font-semibold text-rose-500">저장 실패</span>;
  }
  return null;
}

export default function CompanyNotesField({
  companyName,
  onCompanyNameChange,
  materials,
  onMaterialsChange,
  materialsPlaceholder,
  notes,
  onNotesChange,
  notesPlaceholder,
  clientLinked = false,
  saveState = 'idle',
  clientPicker,
  showPayroll = false,
  payrollByUs = false,
  onPayrollChange,
  onSave,
}: Props) {
  const inputClass =
    'w-full rounded-2xl border border-rose-100 bg-white/70 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100';

  return (
    <section className="rounded-3xl border border-white bg-white/75 p-4 shadow-[0_10px_30px_-12px_rgba(244,114,182,0.35)] backdrop-blur-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-rose-100 to-pink-200 text-sm">
            🏢
          </span>
          업체 정보 · 필요자료
        </h2>
      </div>

      {clientPicker && (
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            수임처 연결 <span className="text-slate-400">(선택 시 세목별 필요자료·특이사항 자동 불러오기)</span>
          </label>
          {clientPicker}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            업체명 (선택) · 서식의 {'{업체명}'}에 반영
          </label>
          <input
            type="text"
            value={companyName}
            onChange={e => onCompanyNameChange(e.target.value)}
            placeholder="예) (주)리미세무"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            업체별 필요자료 · 서식의 {'{필요자료}'}에 반영{' '}
            <span className="text-slate-400">
              {clientLinked ? '(세목별로 수임처에 자동 저장)' : '(업체마다 이 부분만 교체)'}
            </span>
          </label>
          <textarea
            value={materials}
            onChange={e => onMaterialsChange(e.target.value)}
            rows={4}
            placeholder={materialsPlaceholder ?? '- 매출/매입 세금계산서\n- 카드/현금영수증 매출 내역'}
            className={`${inputClass} resize-y`}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            업체 특이사항 / 기존 제출자료 · 서식의 {'{특이사항}'}에 반영
          </label>
          <textarea
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            rows={2}
            placeholder={notesPlaceholder ?? '예) 4분기 매입 세금계산서는 이미 수령함.'}
            className={`${inputClass} resize-y`}
          />
        </div>

        {showPayroll && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-2.5">
            <input
              type="checkbox"
              checked={payrollByUs}
              onChange={e => onPayrollChange?.(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500"
            />
            <span className="text-xs leading-relaxed text-slate-600">
              <span className="font-bold text-slate-800">급여대장 작성 (우리가 작성)</span>
              <br />
              체크 시 <b>신고안내</b> 문구, 미체크 시 <b>자료요청</b> 문구로 생성됩니다.
            </span>
          </label>
        )}
      </div>

      {clientLinked && onSave && (
        <div className="mt-4 flex items-center justify-end gap-3">
          <SaveBadge state={saveState} />
          <button
            type="button"
            onClick={onSave}
            disabled={saveState === 'saving'}
            className="rounded-full bg-gradient-to-r from-rose-400 to-pink-400 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:from-rose-500 hover:to-pink-500 active:scale-95 disabled:opacity-60"
          >
            💾 수임처에 저장
          </button>
        </div>
      )}
    </section>
  );
}
