'use client';

import { useState } from 'react';

import { portalBtnSecondary } from '@/app/components/portal/uiClasses';
import {
  buildBlueholeRegisterText,
  inquiryBlueholeCase,
  type InquiryRow,
  type ProcessRow,
} from './intakeUtils';

export default function BlueholeRegisterCopyButton({
  inquiry,
  process = null,
  className = '',
}: {
  inquiry: InquiryRow;
  process?: ProcessRow | null;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (inquiryBlueholeCase(inquiry.extra).trim()) return null;

  const text = buildBlueholeRegisterText(inquiry, process);
  if (!text.trim()) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('블루홀 등록용 내용을 복사하세요:', text);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`${portalBtnSecondary} text-xs px-2.5 py-1.5 ${className}`}
    >
      {copied ? '복사됨' : '블루홀 등록용 복사'}
    </button>
  );
}
