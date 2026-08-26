import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, resolve } from 'path';

const downloads = resolve(process.env.USERPROFILE || '', 'Downloads');
const cacheDir = resolve('.cache', 'insurance-import');

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function normalizeSpace(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(s) {
  return normalizeSpace(
    String(s || '')
      .replace(/&#40;/g, '(')
      .replace(/&#41;/g, ')')
      .replace(/&#39;/g, "'")
      .replace(/&#034;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/<br\s*\/?>/gi, '\n'),
  );
}

function stripHtml(s) {
  return normalizeSpace(decodeHtml(String(s || '').replace(/<[^>]+>/g, ' ')));
}

function classifyRole(name) {
  if (/지역본부/.test(name)) return '지역본부';
  if (/본부/.test(name)) return '본부';
  if (/상담센터/.test(name)) return '상담센터';
  if (/종합센터/.test(name)) return '종합센터';
  if (/위원회|심사센터/.test(name)) return '위원회';
  if (/출장소/.test(name)) return '출장소';
  return '지사';
}

function inferNpsHqName(shortName, jurisdiction, region, role) {
  if (role === '지역본부') return '';
  const southSeoulKeywords = [
    '강남',
    '서초',
    '송파',
    '강동',
    '강서',
    '양천',
    '영등포',
    '구로',
    '금천',
    '관악',
    '동작',
  ];
  if (region === '서울') {
    const hay = `${shortName} ${jurisdiction}`;
    return southSeoulKeywords.some(k => hay.includes(k)) ? '서울남부지역본부' : '서울북부지역본부';
  }
  if (['경기', '인천', '강원'].includes(region)) return '경인지역본부';
  if (['대전', '세종', '충남', '충북'].includes(region)) return '대전세종지역본부';
  if (['전남광주', '전북', '제주'].includes(region)) return '광주지역본부';
  if (['대구', '경북', '울산'].includes(region)) return '대구지역본부';
  if (['부산', '경남'].includes(region)) return '부산지역본부';
  return '';
}

function normalizeName(s) {
  return String(s || '')
    .replace(/\s+/g, '')
    .replace(/^국민연금공단\s*/, '')
    .replace(/^국민건강보험공단\s*/, '')
    .replace(/^근로복지공단\s*/, '')
    .trim();
}

function toSafeFilePart(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

/** 실제 전화번호만 허용 — 업무 설명 한글이 phone 칸에 들어가지 않게 */
function isLikelyPhone(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') return false;
  if (/[가-힣]/.test(text)) return false;
  // 0xx-xxx-xxxx / 02-xxx-xxxx / 15xx-xxxx / 1588-xxxx 등
  if (/\d{2,4}-\d{3,4}-\d{4}/.test(text)) return true;
  if (/^(15|16|18)\d{2}-\d{4}$/.test(text)) return true;
  if (/^\d{9,11}$/.test(text.replace(/\D/g, '')) && text.replace(/\D/g, '').length >= 9) return true;
  return false;
}

function pickPhone(...candidates) {
  for (const c of candidates) {
    const t = String(c || '').trim();
    if (isLikelyPhone(t)) return t;
  }
  return '';
}

function decodeJsString(raw) {
  return raw.replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\').trim();
}

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

async function fetchCached(url, cacheName, options = {}) {
  ensureDir(cacheDir);
  const path = resolve(cacheDir, cacheName);
  if (existsSync(path)) {
    return readFileSync(path, 'utf8');
  }
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(path, text, 'utf8');
  return text;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

function parseSimpleTableRows(html) {
  const rows = [];
  const bodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!bodyMatch) return rows;
  let lastLabel = '';
  for (const m of bodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = m[1];
    const cells = [...rowHtml.matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi)].map(x => stripHtml(x[2]));
    if (!cells.length) continue;
    if (cells[0]) lastLabel = cells[0];
    rows.push(cells.map((c, i) => (i === 0 && !c ? lastLabel : c)));
  }
  return rows;
}

/** 셀 안 <p> 단위로 추출 — 가입지원부처럼 전화·업무·팩스가 1:1로 나뉜 행 처리 */
function extractCellParagraphs(cellHtml) {
  const fromP = [...String(cellHtml || '').matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => stripHtml(m[1]))
    .filter(Boolean);
  if (fromP.length) return fromP;
  const plain = stripHtml(cellHtml);
  return plain ? [plain] : [];
}

function splitPhoneTokens(text) {
  const out = [];
  for (const part of String(text || '').split(/\s+/)) {
    const picked = pickPhone(part);
    if (picked) out.push(picked);
  }
  return out;
}

/** 국민연금 지사조직 부명 테이블 — 담당업무(열3)까지 파싱, 병렬 <p>는 항목별로 분리 */
function parseNpsDepartmentPhones(detailHtml) {
  const tableHtml = extractTableByCaption(detailHtml, '지사조직의 부명');
  const bodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!bodyMatch) return [];

  const items = [];
  for (const m of bodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi)].map(x => x[2]);
    if (cells.length < 4) continue;
    const label = stripHtml(cells[0]);
    if (!label || label === '부명') continue;

    const phones = extractCellParagraphs(cells[1]).flatMap(splitPhoneTokens);
    const roles = extractCellParagraphs(cells[2]);
    const faxes = extractCellParagraphs(cells[3]).flatMap(splitPhoneTokens);

    const slotCount = Math.max(phones.length, roles.length, faxes.length, 1);
    for (let i = 0; i < slotCount; i += 1) {
      const phone = phones[i] ?? (phones.length === 1 ? phones[0] : '');
      const role = roles[i] ?? (roles.length === 1 ? roles[0] : '');
      const fax = faxes[i] ?? (faxes.length === 1 ? faxes[0] : '');
      if (!phone && !fax) continue;
      items.push({
        label,
        phone: phone && isLikelyPhone(phone) ? phone : pickPhone(phone),
        role,
        fax: fax && isLikelyPhone(fax) ? fax : pickPhone(fax),
      });
    }
  }

  return uniqueDeptRows(items, item => item);
}

function extractTableByCaption(html, keyword) {
  const safe = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(`<table[\\s\\S]*?<caption>[\\s\\S]*?${safe}[\\s\\S]*?<\\/caption>[\\s\\S]*?<\\/table>`, 'i'));
  return m ? m[0] : '';
}

function extractTableAfterHeading(html, keyword) {
  const safe = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(new RegExp(`${safe}[\\s\\S]*?<table[\\s\\S]*?<\\/table>`, 'i'));
  return m ? m[0] : '';
}

function uniqueDeptRows(rows, mapper) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const item = mapper(row);
    if (!item || !item.label) continue;
    // 전화가 업무 문구로 잘못 들어가지 않도록; 팩스/라벨만 있어도 유지
    if (item.phone && !isLikelyPhone(item.phone)) item.phone = '';
    const key = `${item.label}|${item.role || ''}|${item.phone}|${item.fax || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function writeDataset({ outName, source, updated, branches }) {
  ensureDir(resolve('data'));
  const outPath = resolve('data', outName);
  writeFileSync(outPath, JSON.stringify({ source, updated, branches }, null, 2), 'utf8');
  console.log(`wrote ${branches.length} → ${outPath}`);
}

async function importNps() {
  const csvPath = resolve(downloads, '국민연금공단_지사_및_상담센터_현황_20260701.csv');
  const rows = parseCsv(readCsvEucKr(csvPath));
  const header = rows[0] || [];
  const iName = colIndex(header, ['지사(센터)명', '지사명']);
  const iZip = colIndex(header, ['우편번호']);
  const iAddr = colIndex(header, ['주소']);
  const iPhone = colIndex(header, ['전화번호']);
  const iFax = colIndex(header, ['fax', 'FAX']);

  const rootHtml = await fetchCached(
    'https://www.nps.or.kr/pbcpgdnc/ognzprsn/getOHAG0021M0.do?menuId=MN24001022',
    'nps-root.html',
  );
  const metaByName = new Map();
  const indexed = new Map();
  for (const m of rootHtml.matchAll(/jisaList\[(\d+)\]\[(\d+)\] = "([^"]*)";/g)) {
    const index = m[1];
    const field = Number(m[2]);
    const value = decodeJsString(m[3]);
    const entry = indexed.get(index) ?? {};
    entry[field] = value;
    indexed.set(index, entry);
  }
  for (const entry of indexed.values()) {
    if (!entry[0]) continue;
    metaByName.set(normalizeName(entry[0]), {
      region: entry[1] || '',
      code: entry[2] || '',
      jurisdiction: entry[4] || '',
      extra: entry[7] || '',
    });
  }

  const branches = await mapLimit(
    rows.slice(1).filter(cols => cols?.[iName]?.trim()),
    8,
    async cols => {
      const shortName = cols[iName].trim();
      const meta = metaByName.get(normalizeName(shortName)) ?? {};
      const detailUrl = meta.code
        ? `https://www.nps.or.kr/pbcpgdnc/ognzprsn/getOHAG0013M0List.do?menuId=MN24001022&brofCd=${meta.code}&brofNm=${encodeURIComponent(shortName)}`
        : '';
      let departmentPhones = [];
      let hqName = '';
      const role = classifyRole(shortName);
      if (detailUrl) {
        const detailHtml = await fetchCached(detailUrl, `nps-${meta.code}.html`);
        departmentPhones = parseNpsDepartmentPhones(detailHtml);
      }
      hqName = inferNpsHqName(shortName, meta.jurisdiction || '', meta.region || '', role);
      return {
        id: meta.code || shortName,
        name: `국민연금공단 ${shortName}`,
        shortName,
        address: (cols[iAddr] || '').trim(),
        zip: (cols[iZip] || '').trim(),
        phone: (cols[iPhone] || '').trim(),
        fax: iFax >= 0 ? (cols[iFax] || '').trim() : '',
        jurisdiction: meta.jurisdiction || '',
        hours: '',
        role,
        hqName,
        sourceUrl:
          detailUrl || 'https://www.nps.or.kr/pbcpgdnc/ognzprsn/getOHAG0012M0.do?menuId=MN24001022',
        departmentPhones,
      };
    },
  );

  writeDataset({
    outName: 'nps-branches.json',
    source: basename(csvPath),
    updated: '2026-07-01',
    branches,
  });
}

async function importComwel() {
  const csvPath = resolve(downloads, '근로복지공단_공단 본부 및 지사 현황_20251231.csv');
  const csvRows = parseCsv(readCsvEucKr(csvPath));
  const csvHeader = csvRows[0] || [];
  const iName = colIndex(csvHeader, ['기관(지사)명', '기관명']);
  const iAddr = colIndex(csvHeader, ['주소']);
  const iJuris = colIndex(csvHeader, ['관할구역']);
  const iZip = colIndex(csvHeader, ['우편번호']);
  const iPhone = colIndex(csvHeader, ['대표전화번호', '전화번호']);
  const iFax = colIndex(csvHeader, ['대표전자팩스', '팩스', 'fax']);
  const iHours = colIndex(csvHeader, ['이용시간']);
  const listPages = [0, 10, 20, 30, 40, 50, 60];
  const detailSeeds = [];
  for (const offset of listPages) {
    const url =
      offset === 0
        ? 'https://www.comwel.or.kr/comwel/intr/srch/srch.jsp'
        : `https://www.comwel.or.kr/comwel/intr/srch/srch.jsp?mode=list&board_no=107&pager.offset=${offset}`;
    const html = await fetchCached(url, `comwel-list-${offset}.html`);
    for (const m of html.matchAll(
      /<td class="td">([^<]+)<\/td>\s*<td class="td">([^<]*)<\/td>[\s\S]*?article_no=([0-9]+)/g,
    )) {
      detailSeeds.push({
        shortName: stripHtml(m[1]),
        jurisdiction: stripHtml(m[2]),
        articleNo: m[3],
      });
    }
  }

  const detailRows = await mapLimit(detailSeeds, 8, async row => {
    const detailUrl = `https://www.comwel.or.kr/comwel/intr/srch/srch.jsp?mode=view&article_no=${row.articleNo}&board_wrapper=%2Fcomwel%2Fintr%2Fsrch%2Fsrch.jsp&pager.offset=0&board_no=107`;
    const html = await fetchCached(detailUrl, `comwel-${row.articleNo}.html`);
    const branchCode = ((html.match(/var branchcd = '([^']+)'/i) || [])[1] || '').trim();
    const title = stripHtml((html.match(/<title>[^()]*\(([^)]+)\)<\/title>/i) || [])[1] || row.shortName);
    const zip = ((html.match(/우편번호[^0-9]*([0-9]{5})/i) || [])[1] || '').trim();
    const phone = ((html.match(/대표전화[^0-9]*([0-9\-]{9,14})/i) || [])[1] || '').trim();
    const fax = ((html.match(/대표전자팩스[^0-9]*([0-9\-]{9,14})/i) || [])[1] || '').trim();
    const address = stripHtml((html.match(/<th[^>]*>주소<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i) || [])[1] || '');
    const departmentPhones = [];
    const deptTable = extractTableAfterHeading(html, '부서 연락처');
    const deptSeeds = [...deptTable.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
    for (const deptRowHtml of deptSeeds) {
      const cells = [...deptRowHtml.matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi)].map(x => stripHtml(x[2]));
      if (cells.length < 4 || !cells[0] || cells[0] === '부서') continue;
      const deptName = cells[0];
      const faxNo = cells[1] || '';
      const taskText = cells[2] || '';
      const optionValues = [
        ...new Set(
          [...deptRowHtml.matchAll(/<option value="([^"]*)"/gi)]
            .map(x => stripHtml(x[1]))
            .filter(Boolean),
        ),
      ];
      if (!branchCode || !optionValues.length) {
        departmentPhones.push({ label: deptName, fax: faxNo, role: taskText, phone: '' });
        continue;
      }
      const ajaxRows = await mapLimit(optionValues, 4, async catas => {
        const body = `branchCode=${encodeURIComponent(branchCode)}&catas=${encodeURIComponent(catas)}&deptname=${encodeURIComponent(deptName)}`;
        const ajaxHtml = await fetchCached(
          'https://www.comwel.or.kr/_custom/kcom/_common/board/srch/serive_ajax.jsp',
          `comwel-ajax-${row.articleNo}-${toSafeFilePart(deptName)}-${toSafeFilePart(catas)}.html`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body,
          },
        );
        const cleaned = ajaxHtml.replace(/<!--[\s\S]*?-->/g, '');
        return [...cleaned.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => {
          const parts = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => stripHtml(x[1]));
          if (parts.length < 4 || parts[0] === '부서') return null;
          return {
            label: parts[0] || deptName,
            phone: pickPhone(parts[1]),
            role: [parts[2], parts[3]].filter(Boolean).join(' · '),
            fax: faxNo,
          };
        });
      });
      const directs = uniqueDeptRows(
        ajaxRows.flat().filter(Boolean),
        item => item,
      );
      if (directs.length) {
        departmentPhones.push(...directs);
      } else {
        departmentPhones.push({ label: deptName, fax: faxNo, role: taskText, phone: '' });
      }
    }
    return [
      normalizeName(title),
      {
        id: row.articleNo,
        name: `근로복지공단 ${title}`,
        shortName: title,
        address,
        zip,
        phone,
        fax,
        jurisdiction: row.jurisdiction,
        hours: '평일 09:00~18:00',
        role: classifyRole(title),
        hqName: /지역본부/.test(title) ? '' : title.replace(/(지사|센터).*$/, '지역본부'),
        sourceUrl: detailUrl,
        departmentPhones,
      },
    ];
  });
  const detailMap = new Map(detailRows);

  const branches = csvRows
    .slice(1)
    .filter(cols => cols?.[iName]?.trim())
    .map((cols, idx) => {
      const shortName = cols[iName].trim();
      const detail = detailMap.get(normalizeName(shortName));
      return detail ?? {
        id: String(idx + 1),
        name: `근로복지공단 ${shortName}`,
        shortName,
        address: (cols[iAddr] || '').trim(),
        zip: (cols[iZip] || '').trim(),
        phone: (cols[iPhone] || '').trim(),
        fax: iFax >= 0 ? (cols[iFax] || '').trim() : '',
        jurisdiction: (cols[iJuris] || '').trim(),
        hours: iHours >= 0 ? (cols[iHours] || '').trim() : '',
        role: classifyRole(shortName),
        hqName: '',
        sourceUrl: 'https://www.comwel.or.kr/comwel/intr/srch/srch.jsp',
        departmentPhones: [],
      };
    });

  writeDataset({
    outName: 'comwel-branches.json',
    source: basename(csvPath),
    updated: new Date().toISOString().slice(0, 10),
    branches,
  });
}

async function importNhis() {
  const rootHtml = await fetchCached(
    'https://www.nhis.or.kr/nhis/about/retrieveBranchList.do',
    'nhis-root.html',
  );
  const maxPage =
    Number((rootHtml.match(/fn_retrieveBranchList\(([0-9]+)\); return false;">[^<]*마지막페이지/i) || [])[1] || 24);
  const items = [];
  for (let page = 1; page <= maxPage; page++) {
    const html = await fetchCached(
      'https://www.nhis.or.kr/nhis/about/retrieveBranchListAjax.do',
      `nhis-list-${page}.html`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: `pageIndex=${page}&CT=&LOC=`,
      },
    );
    for (const m of html.matchAll(
      /<p>([^<]+)<\/p>[\s\S]*?\[우\.([0-9]{5})\]\s*([^<]+)<\/span>[\s\S]*?fn_showJisaInfo\('([^']*)','([^']*)'\)[\s\S]*?<a href="([^"]+)" class="btn md tertiary" title="새창열기">\s*연락처<\/a>/g,
    )) {
      items.push({
        shortName: stripHtml(m[1]),
        zip: m[2],
        address: stripHtml(m[3]),
        brchCd: m[4],
        pstnType: m[5],
        contactPath: m[6],
      });
    }
  }

  const branches = await mapLimit(items, 8, async item => {
    const infoHtml = await fetchCached(
      'https://www.nhis.or.kr/nhis/about/retrieveBranchInfo.do',
      `nhis-info-${item.brchCd}.html`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: `brchCd=${item.brchCd}&pstnType=${item.pstnType}`,
      },
    );
    const contactUrl = `https://www.nhis.or.kr${item.contactPath}`;
    const contactHtml = await fetchCached(contactUrl, `nhis-contact-${item.brchCd}.html`);
    const titleParts = decodeHtml((contactHtml.match(/<title>([^<]+)<\/title>/i) || [])[1] || '');
    const hqName = normalizeSpace((titleParts.split('<').map(s => s.trim()).filter(Boolean))[2] || '');
    const jurisdiction = stripHtml(
      (infoHtml.match(/지사관할 행정동[\s\S]*?<\/dt>[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/i) || [])[1] || '',
    );
    const deptRows = parseSimpleTableRows(extractTableByCaption(contactHtml, '부서안내/연락처 테이블'));
    const departmentPhones = uniqueDeptRows(deptRows, cells => {
      if (cells.length < 4) return null;
      return {
        label: cells[0],
        role: [cells[1], cells[2]].filter(Boolean).join(' · '),
        phone: pickPhone(cells[3]),
        fax: cells[4] || '',
      };
    });
    const phone =
      departmentPhones.find(d => isLikelyPhone(d.phone))?.phone || '1577-1000';
    const fax = departmentPhones[0]?.fax || '';
    return {
      id: item.brchCd,
      name: `국민건강보험공단 ${item.shortName}`,
      shortName: item.shortName,
      address: item.address,
      zip: item.zip,
      phone,
      fax,
      jurisdiction,
      hours: '',
      role: classifyRole(item.shortName),
      hqName,
      sourceUrl: contactUrl,
      departmentPhones,
    };
  });

  writeDataset({
    outName: 'nhis-branches.json',
    source: 'https://www.nhis.or.kr/nhis/about/retrieveBranchList.do',
    updated: new Date().toISOString().slice(0, 10),
    branches,
  });
}

const onlyNhis = process.argv.includes('--nhis-only');
const onlyNps = process.argv.includes('--nps-only');
const reparseNpsFromCache = process.argv.includes('--nps-reparse-cache');

async function reparseNpsDeptFromCache() {
  const datasetPath = resolve('data/nps-branches.json');
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf8'));
  let updated = 0;
  for (const branch of dataset.branches) {
    const cachePath = resolve(cacheDir, `nps-${branch.id}.html`);
    if (!existsSync(cachePath)) continue;
    const detailHtml = readFileSync(cachePath, 'utf8');
    const departmentPhones = parseNpsDepartmentPhones(detailHtml);
    if (departmentPhones.length) {
      branch.departmentPhones = departmentPhones;
      updated += 1;
    }
  }
  writeFileSync(datasetPath, JSON.stringify(dataset, null, 2), 'utf8');
  console.log(`re-parsed departmentPhones for ${updated} branches → ${datasetPath}`);
}

if (reparseNpsFromCache) {
  await reparseNpsDeptFromCache();
} else if (onlyNps) {
  await importNps();
} else if (onlyNhis) {
  await importNhis();
} else {
  await importNps();
  await importComwel();
  await importNhis();
}
