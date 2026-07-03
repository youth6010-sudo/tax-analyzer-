import type { TemplateSource, TemplateToken } from '../_lib/template';

type Props = {
  source: TemplateSource;
  onSourceChange: (source: TemplateSource) => void;
  hasCustom: boolean;
  onSave?: () => void;
  saveState?: 'idle' | 'saving' | 'saved' | 'error';
  saveLabel?: string;
};

const SAVE_BADGE: Record<NonNullable<Props['saveState']>, { text: string; cls: string } | null> = {
  idle: null,
  saving: { text: '저장 중…', cls: 'text-slate-400' },
  saved: { text: '저장됨', cls: 'text-emerald-600' },
  error: { text: '저장 실패', cls: 'text-rose-500' },
};

export function TemplateSourceToggle({
  source,
  onSourceChange,
  hasCustom,
  onSave,
  saveState = 'idle',
  saveLabel = '내 서식 저장',
}: Props) {
  const chip = (active: boolean) =>
    [
      'rounded-lg px-2.5 py-1 text-xs font-semibold border transition-colors',
      active
        ? 'border-blue-300 bg-blue-50 text-blue-900 shadow-sm'
        : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200/80',
    ].join(' ');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-0.5 rounded-xl bg-slate-100 p-0.5 ring-1 ring-slate-200">
        <button type="button" onClick={() => onSourceChange('default')} className={chip(source === 'default')}>
          기본 서식
        </button>
        <button
          type="button"
          onClick={() => onSourceChange('custom')}
          className={chip(source === 'custom')}
          title={hasCustom ? '저장된 내 서식 사용' : '내 서식을 편집·저장'}
        >
          내 서식{hasCustom ? '' : ' (미저장)'}
        </button>
      </div>
      {source === 'custom' && onSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={saveState === 'saving'}
          className="rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-60"
        >
          {saveLabel}
        </button>
      )}
      {SAVE_BADGE[saveState] && (
        <span className={`text-[11px] font-medium ${SAVE_BADGE[saveState]!.cls}`}>
          {SAVE_BADGE[saveState]!.text}
        </span>
      )}
    </div>
  );
}

export type { TemplateToken };
