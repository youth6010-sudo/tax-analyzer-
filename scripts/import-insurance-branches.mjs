import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, basename } from 'path';

function parseCsv(t) {
  const rows = [];
  let row = [];
  let cell = '';
  let i = 0;
  let inQ = false;
  while (i < t.length) {
    const c = t[i];
    if (inQ) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (c === '"') {
        inQ = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function readCsvEucKr(csvPath) {
  const buf = readFileSync(csvPath);
  return new TextDecoder('euc-kr').decode(buf).replace(/^\uFEFF/, '');
}

function colIndex(header, aliases) {
  const norm = header.map(h => String(h || '').replace(/\s+/g, '').toLowerCase());
  for (const a of aliases) {
    const i = norm.findIndex(h => h.includes(a.replace(/\s+/g, '').toLowerCase()));
    if (i >= 0) return i;
  }
  return -1;
}

function writeDataset({ outName, source, updated, branches }) {
  mkdirSync(resolve('data'), { recursive: true });
  const outPath = resolve('data', outName);
  writeFileSync(
    outPath,
    JSON.stringify({ source, updated, branches }, null, 2),
    'utf8',
  );
  console.log(`wrote ${branches.length} → ${outPath}`);
}

const downloads = resolve(process.env.USERPROFILE || '', 'Downloads');

/** 국민건강보험공단 */
{
  const csvPath = resolve(downloads, '국민건강보험공단_공단 본부 및 지사 현황_20250224.csv');
  const rows = parseCsv(readCsvEucKr(csvPath));
  const header = rows[0] || [];
  const iName = colIndex(header, ['기관명']);
  const iAddr = colIndex(header, ['주소']);
  const iZip = colIndex(header, ['우편번호']);
  const iPhone = colIndex(header, ['전화번호']);
  const iJuris = colIndex(header, ['관할구역', '지사관할']);
  const branches = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (!cols?.[iName]?.trim()) continue;
    const name = cols[iName].trim();
    let jurisdiction = (cols[iJuris] || '').trim();
    if (jurisdiction === '0') jurisdiction = '';
    branches.push({
      id: String(r),
      name,
      shortName: name.replace(/^국민건강보험공단\s*/, ''),
      address: (cols[iAddr] || '').trim(),
      zip: (cols[iZip] || '').trim(),
      phone: (cols[iPhone] || '').trim(),
      fax: '',
      jurisdiction,
      hours: '',
    });
  }
  writeDataset({
    outName: 'nhis-branches.json',
    source: basename(csvPath),
    updated: '2025-02-24',
    branches,
  });
}

/** 근로복지공단 */
{
  const csvPath = resolve(downloads, '근로복지공단_공단 본부 및 지사 현황_20251231.csv');
  const rows = parseCsv(readCsvEucKr(csvPath));
  const header = rows[0] || [];
  const iName = colIndex(header, ['기관(지사)명', '기관명']);
  const iAddr = colIndex(header, ['주소']);
  const iJuris = colIndex(header, ['관할구역']);
  const iZip = colIndex(header, ['우편번호']);
  const iPhone = colIndex(header, ['대표전화번호', '전화번호']);
  const iFax = colIndex(header, ['대표전자팩스', '팩스', 'fax']);
  const iHours = colIndex(header, ['이용시간']);
  const branches = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (!cols?.[iName]?.trim()) continue;
    const shortName = cols[iName].trim();
    branches.push({
      id: String(r),
      name: `근로복지공단 ${shortName}`,
      shortName,
      address: (cols[iAddr] || '').trim(),
      zip: (cols[iZip] || '').trim(),
      phone: (cols[iPhone] || '').trim(),
      fax: iFax >= 0 ? (cols[iFax] || '').trim() : '',
      jurisdiction: (cols[iJuris] || '').trim(),
      hours: iHours >= 0 ? (cols[iHours] || '').trim() : '',
    });
  }
  writeDataset({
    outName: 'comwel-branches.json',
    source: basename(csvPath),
    updated: '2025-12-31',
    branches,
  });
}

/** 국민연금공단 */
{
  const csvPath = resolve(downloads, '국민연금공단_지사_및_상담센터_현황_20260701.csv');
  const rows = parseCsv(readCsvEucKr(csvPath));
  const header = rows[0] || [];
  const iName = colIndex(header, ['지사(센터)명', '지사명']);
  const iZip = colIndex(header, ['우편번호']);
  const iAddr = colIndex(header, ['주소']);
  const iPhone = colIndex(header, ['전화번호']);
  const iFax = colIndex(header, ['fax', 'FAX']);
  const branches = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (!cols?.[iName]?.trim()) continue;
    const shortName = cols[iName].trim();
    branches.push({
      id: String(r),
      name: `국민연금공단 ${shortName}`,
      shortName,
      address: (cols[iAddr] || '').trim(),
      zip: (cols[iZip] || '').trim(),
      phone: (cols[iPhone] || '').trim(),
      fax: iFax >= 0 ? (cols[iFax] || '').trim() : '',
      jurisdiction: '',
      hours: '',
    });
  }
  writeDataset({
    outName: 'nps-branches.json',
    source: basename(csvPath),
    updated: '2026-07-01',
    branches,
  });
}
