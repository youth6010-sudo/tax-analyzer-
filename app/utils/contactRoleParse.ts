const ROLE_PATTERNS: { pattern: RegExp; role: string }[] = [
  { pattern: /사모|사모님/, role: '사모' },
  { pattern: /노무/, role: '담당_노무사' },
  { pattern: /대표|대표님/, role: '대표' },
  { pattern: /사장|사장님/, role: '사장' },
  { pattern: /이사/, role: '이사' },
  { pattern: /과장/, role: '과장' },
  { pattern: /실장/, role: '실장' },
  { pattern: /팀장|부장|원장|매니저|대리|직원|실무/, role: '직원' },
];

/** 엑셀 '이름' 컬럼 → 이름·역할 분리 */
export function parseContactNameRole(raw: string): { name: string; role: string } {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (!t) return { name: '', role: '' };

  for (const { pattern, role } of ROLE_PATTERNS) {
    if (pattern.test(t)) {
      const name = t
        .replace(pattern, '')
        .replace(/님$/g, '')
        .replace(/\s*(대표|사장|이사|과장|실장|원장|매니저|대리|직원|사모).*$/i, '')
        .trim();
      return { name: name || t, role };
    }
  }

  return { name: t, role: '' };
}
