/**
 * 청년들 ID.xlsx · 수임처관리 시트 파서
 */
export const MANAGER_BLOCKS = [
  { manager: '블루', col: 0, hasNo: true, colbert: false },
  { manager: '다야', col: 6, hasNo: false, colbert: true },
  { manager: '윈터', col: 11, hasNo: false, colbert: false },
  { manager: '리아', col: 16, hasNo: false, colbert: false },
  { manager: '페리', col: 21, hasNo: false, colbert: true },
];

export function cellText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' && value > 1000000000) return String(Math.trunc(value));
  return String(value).trim();
}

export function mapEntityType(label) {
  const s = String(label ?? '').trim();
  if (s.includes('법인')) return 'corporate';
  if (s.includes('개인')) return 'individual';
  if (s.includes('비사업') || s.includes('면세')) return 'nonBusiness';
  return '';
}

export function parseBool(value) {
  if (value === true || value === 'O' || value === 'o' || value === 'Y') return true;
  if (value === false || value === 'X' || value === 'x' || value === 'N' || value === '') return false;
  return Boolean(value);
}

export function parseSuimcheoRows(rows) {
  const parsed = [];
  for (const block of MANAGER_BLOCKS) {
    const { col, hasNo, colbert, manager } = block;
    const typeOff = hasNo ? 1 : 0;
    const companyOff = hasNo ? 2 : 1;
    const summaryOff = hasNo ? 3 : 2;
    const programOff = hasNo ? 4 : 3;
    const flagOff = hasNo ? 5 : 4;

    for (let r = 2; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const companyName = cellText(row[col + companyOff]);
      if (!companyName || companyName === '업체명') continue;

      parsed.push({
        companyName,
        manager,
        businessEntityType: mapEntityType(row[col + typeOff]),
        feeSummary: typeof row[col + summaryOff] === 'number' ? row[col + summaryOff] : null,
        program: cellText(row[col + programOff]),
        converted: hasNo ? parseBool(row[col + flagOff]) : false,
        colbert: colbert ? parseBool(row[col + flagOff]) : false,
      });
    }
  }
  return parsed;
}

export function detectYouthIdWorkbook(sheetNames) {
  return sheetNames.includes('수임처관리') && sheetNames.includes('청년들ID');
}
