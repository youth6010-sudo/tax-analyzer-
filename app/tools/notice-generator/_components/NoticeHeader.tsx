export default function NoticeHeader() {
  return (
    <header className="border-b border-white/60 bg-white/60 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-300 via-pink-300 to-violet-300 text-xl shadow-md shadow-rose-200/60">
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
    </header>
  );
}
