'use client';

import { useCallback, useState } from 'react';

const DEFAULT_ACCEPT = '.json,.xml,.csv,.txt,.101,.102,.103,.hwp';

interface FilingUploadZoneProps {
  title: string;
  description: string;
  accept?: string;
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  accent?: 'emerald' | 'violet' | 'indigo';
}

const ACCENT = {
  emerald: {
    drag: 'border-emerald-500 bg-emerald-50',
    hover: 'hover:border-emerald-400 hover:bg-emerald-50/30',
    icon: 'from-emerald-600 to-teal-600',
    text: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  violet: {
    drag: 'border-violet-500 bg-violet-50',
    hover: 'hover:border-violet-400 hover:bg-violet-50/30',
    icon: 'from-violet-600 to-purple-600',
    text: 'text-violet-600',
    badge: 'bg-violet-100 text-violet-700',
  },
  indigo: {
    drag: 'border-indigo-500 bg-indigo-50',
    hover: 'hover:border-indigo-400 hover:bg-indigo-50/30',
    icon: 'from-indigo-600 to-slate-700',
    text: 'text-indigo-600',
    badge: 'bg-indigo-100 text-indigo-700',
  },
};

export default function FilingUploadZone({
  title,
  description,
  accept = DEFAULT_ACCEPT,
  onFileSelect,
  isLoading,
  accent = 'emerald',
}: FilingUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputId = `filing-input-${accent}`;
  const style = ACCENT[accent];

  const handleFile = useCallback(
    (file: File) => {
      setFileName(file.name);
      onFileSelect(file);
    },
    [onFileSelect],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      className={`
        relative flex flex-col items-center justify-center
        border-2 border-dashed rounded-2xl p-10 transition-all duration-200 cursor-pointer
        ${isDragging ? `${style.drag} scale-[1.01]` : `border-gray-300 bg-white ${style.hover}`}
      `}
      onClick={() => !isLoading && document.getElementById(inputId)?.click()}
    >
      <input
        id={inputId}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
        disabled={isLoading}
      />

      {isLoading ? (
        <>
          <div
            className={`w-14 h-14 border-4 border-t-transparent rounded-full animate-spin mb-4 ${style.text.replace('text-', 'border-')}`}
          />
          <p className={`text-base font-medium ${style.text}`}>파일 분석·검증 중...</p>
          <p className="text-sm text-gray-500 mt-1">전자신고 데이터를 읽고 검증 규칙을 적용합니다</p>
        </>
      ) : (
        <>
          <div
            className={`w-16 h-16 bg-gradient-to-br ${style.icon} rounded-2xl flex items-center justify-center mb-4 shadow-lg`}
          >
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
          </div>

          {fileName ? (
            <>
              <p className="text-base font-semibold text-gray-800">{fileName}</p>
              <p className={`text-sm ${style.text} mt-1`}>다른 파일을 선택하려면 클릭하세요</p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-gray-800 mb-1">{title}</p>
              <p className="text-sm text-gray-500 mb-3 text-center max-w-md">{description}</p>
              <span
                className={`inline-block px-4 py-1.5 text-xs font-medium rounded-full ${style.badge}`}
              >
                JSON · XML · CSV · 전자신고(.101 등)
              </span>
            </>
          )}
        </>
      )}
    </div>
  );
}
