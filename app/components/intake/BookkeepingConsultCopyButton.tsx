'use client';

import { useState } from 'react';
import { portalBtnSecondary } from '@/app/components/portal/uiClasses';

export default function BookkeepingConsultCopyButton({
  text,
  className = '',
  label = '블루홀 등록용 복사',
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!text.trim()) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('기장상담지 내용을 복사하세요:', text);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`${portalBtnSecondary} text-xs px-2.5 py-1.5 ${className}`}
    >
      {copied ? '복사됨' : label}
    </button>
  );
}
