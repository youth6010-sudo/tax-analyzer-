export default function NoticeHeader() {
  return (
    <div className="border-b border-slate-200/80 bg-white/80">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-300 via-pink-300 to-violet-300 text-lg shadow-sm shadow-rose-200/50">
          <span aria-hidden>💌</span>
        </div>
        <div>
          <h1 className="flex items-center gap-1.5 text-base font-extrabold tracking-tight text-slate-800 sm:text-lg">
            세무 신고 안내 문구 생성기
            <span aria-hidden className="text-sm">
              ✨
            </span>
          </h1>
          <p className="text-xs text-slate-500 sm:text-sm">
            세목·기간만 콕! 고르면 마감일 자동 계산 + 안내 멘트 뚝딱 🐣
          </p>
        </div>
      </div>
    </div>
  );
}
