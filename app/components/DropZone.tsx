'use client';

import { useCallback, useState } from 'react';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
}

export default function DropZone({ onFileSelect, isLoading }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (file.type !== 'application/pdf') {
        alert('PDF 파일만 업로드 가능합니다.');
        return;
      }
      setFileName(file.name);
      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      className={`
        relative flex flex-col items-center justify-center
        border-2 border-dashed rounded-2xl p-12 transition-all duration-200 cursor-pointer
        ${isDragging
          ? 'border-blue-500 bg-blue-50 scale-[1.01]'
          : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'
        }
      `}
      onClick={() => !isLoading && document.getElementById('pdf-input')?.click()}
    >
      <input
        id="pdf-input"
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleChange}
        disabled={isLoading}
      />

      {isLoading ? (
        <>
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-lg font-medium text-blue-600">신고서 분석 중...</p>
          <p className="text-sm text-gray-500 mt-1">PDF에서 데이터를 추출하고 있습니다</p>
        </>
      ) : (
        <>
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-5 shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>

          {fileName ? (
            <>
              <p className="text-base font-semibold text-gray-800">{fileName}</p>
              <p className="text-sm text-blue-500 mt-1">다른 파일을 선택하려면 클릭하세요</p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-gray-800 mb-1">
                종합소득세 신고서 PDF 업로드
              </p>
              <p className="text-sm text-gray-500 mb-3">
                파일을 여기에 드래그하거나 클릭하여 선택하세요
              </p>
              <span className="inline-block px-4 py-1.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                PDF 파일만 지원
              </span>
            </>
          )}
        </>
      )}
    </div>
  );
}
