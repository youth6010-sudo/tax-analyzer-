'use client';

import { buildBlueholeFilingCaseUrl } from '../../config/bluehole';

export default function BlueholeCaseLink({
  value,
  className = '',
}: {
  value: string;
  className?: string;
}) {
  const trimmed = value.trim();
  if (!trimmed) return <span className="text-gray-400">-</span>;

  const href = buildBlueholeFilingCaseUrl(trimmed);
  if (!href) {
    return <span className={`text-gray-600 ${className}`}>{trimmed}</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className={`text-blue-600 font-semibold hover:underline ${className}`}
    >
      {trimmed.startsWith('#') ? trimmed : `#${trimmed.replace(/^#\s*/, '')}`}
    </a>
  );
}
