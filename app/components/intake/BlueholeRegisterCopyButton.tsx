'use client';

import BookkeepingConsultCopyButton from './BookkeepingConsultCopyButton';
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
  if (inquiryBlueholeCase(inquiry.extra).trim()) return null;

  const text = buildBlueholeRegisterText(inquiry, process);
  return <BookkeepingConsultCopyButton text={text} className={className} />;
}
