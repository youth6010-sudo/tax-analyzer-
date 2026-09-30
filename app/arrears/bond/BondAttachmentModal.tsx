'use client';

import { useRef } from 'react';
import CenterModal from '@/app/components/portal/CenterModal';
import { portalBtnPrimary, portalBtnSecondary } from '@/app/components/portal/uiClasses';
import { todayIsoDate, type BondAttachment } from '@/app/types/bond';

type Props = {
  open: boolean;
  /** 내용증명 · 지급명령 · (추후) 해임통보 */
  stepLabel: string;
  companyName: string;
  attachments: BondAttachment[];
  onChange: (next: BondAttachment[]) => void;
  onClose: () => void;
  readOnly?: boolean;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim() || '업체';
}

/** 2025-01-15_내용증명_OO업체.pdf — 같은 이름이면 (2), (3) … */
function buildFilename(
  stepLabel: string,
  companyName: string,
  original: string,
  taken: Set<string>,
): string {
  const dot = original.lastIndexOf('.');
  const ext = dot > 0 ? original.slice(dot) : '';
  const base = `${todayIsoDate()}_${stepLabel}_${safeName(companyName)}`;
  let name = `${base}${ext}`;
  for (let n = 2; taken.has(name); n++) name = `${base}(${n})${ext}`;
  taken.add(name);
  return name;
}

function download(att: BondAttachment) {
  const a = document.createElement('a');
  a.href = att.url;
  a.download = att.filename;
  a.click();
}

export default function BondAttachmentModal({
  open,
  stepLabel,
  companyName,
  attachments,
  onChange,
  onClose,
  readOnly,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // TODO: 저장은 로컬 state(목업) — 서버 스토리지 연결 시 url을 업로드 결과로 교체
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const taken = new Set(attachments.map(a => a.filename));
    const added: BondAttachment[] = [...files].map(f => ({
      id: crypto.randomUUID(),
      filename: buildFilename(stepLabel, companyName, f.name, taken),
      url: URL.createObjectURL(f),
      size: f.size,
      uploadedAt: new Date().toISOString(),
      mimeType: f.type || 'application/octet-stream',
      source: 'manual',
    }));
    onChange([...attachments, ...added]);
  };

  const remove = (att: BondAttachment) => {
    if (!window.confirm(`「${att.filename}」을(를) 삭제할까요?`)) return;
    if (att.url.startsWith('blob:')) URL.revokeObjectURL(att.url);
    onChange(attachments.filter(a => a.id !== att.id));
  };

  return (
    <CenterModal
      open={open}
      title={`${stepLabel} 첨부파일`}
      description={`${companyName} · 지금은 브라우저에만 보관됩니다 (새로고침 시 사라짐)`}
      onClose={onClose}
    >
      <div className="space-y-3">
        {!readOnly ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button type="button" className={portalBtnPrimary} onClick={() => inputRef.current?.click()}>
              파일 업로드
            </button>
            <span className="text-[11px] text-slate-500">여러 파일을 한 번에 선택할 수 있습니다.</span>
          </div>
        ) : null}

        {attachments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
            첨부된 파일이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {attachments.map(att => (
              <li key={att.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                {/* TODO: 인라인 뷰어(PDF/이미지 미리보기) 추후 연결 — mimeType으로 분기 */}
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left font-medium text-blue-800 hover:underline"
                  title="다운로드"
                  onClick={() => download(att)}
                >
                  {att.filename}
                </button>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {att.uploadedAt.slice(0, 10)}
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums text-slate-500">
                  {formatSize(att.size)}
                </span>
                <button type="button" className={portalBtnSecondary} onClick={() => download(att)}>
                  다운로드
                </button>
                {!readOnly ? (
                  <button
                    type="button"
                    className="shrink-0 rounded px-2 py-1 text-rose-600 hover:bg-rose-50"
                    onClick={() => remove(att)}
                  >
                    삭제
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </CenterModal>
  );
}
