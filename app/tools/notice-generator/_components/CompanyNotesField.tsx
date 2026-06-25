type Props = {
  companyName: string;
  onCompanyNameChange: (value: string) => void;
  materials: string;
  onMaterialsChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
};

export default function CompanyNotesField({
  companyName,
  onCompanyNameChange,
  materials,
  onMaterialsChange,
  notes,
  onNotesChange,
}: Props) {
  const inputClass =
    'w-full rounded-2xl border border-rose-100 bg-white/70 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100';

  return (
    <section className="rounded-3xl border border-white bg-white/75 p-4 shadow-[0_10px_30px_-12px_rgba(244,114,182,0.35)] backdrop-blur-sm sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-rose-100 to-pink-200 text-sm">
          🏢
        </span>
        업체 정보 · 필요자료
      </h2>

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
            <span className="text-slate-400">(업체마다 이 부분만 교체)</span>
          </label>
          <textarea
            value={materials}
            onChange={e => onMaterialsChange(e.target.value)}
            rows={4}
            placeholder={'- 매출/매입 세금계산서\n- 카드/현금영수증 매출 내역'}
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
            placeholder="예) 4분기 매입 세금계산서는 이미 수령함."
            className={`${inputClass} resize-y`}
          />
        </div>
      </div>
    </section>
  );
}
