/**
 * 청년들 ID.xlsx 시트 파서 (비품 주문 제외)
 */
import { parseSuimcheoRows, detectSuimcheoManagementLayout, cellText, parseBool } from './youth-id-parse.mjs';

export { parseSuimcheoRows, detectYouthIdWorkbook, detectSuimcheoManagementLayout } from './youth-id-parse.mjs';

const MANAGER_BLOCKS = [
  { manager: '블루', col: 0 },
  { manager: '다야', col: 6 },
  { manager: '윈터', col: 11 },
  { manager: '리아', col: 16 },
  { manager: '페리', col: 21 },
];

const CHECKLIST_KEYS = [
  'contractSent', 'consent', 'cms', 'assignee', 'programClient',
  'blueholeClient', 'tpClient', 'semoReport', 'bizAccount', 'kakaoRoom',
];

function excelDateSerial(v) {
  if (typeof v === 'number' && v > 30000 && v < 60000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  return cellText(v);
}

function headerIndex(headerRow, ...names) {
  for (const name of names) {
    const idx = headerRow.findIndex(h => cellText(h).includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseIntakeInquiries(rows) {
  if (!rows.length) return [];
  const h = rows[0].map(cellText);
  const col = {
    inquiryDate: headerIndex(h, '문의일'),
    companyName: headerIndex(h, '업체명'),
    phone: headerIndex(h, '전화'),
    channel: headerIndex(h, '유입'),
    consultant: headerIndex(h, '초회'),
    inquiryContent: headerIndex(h, '문의내'),
    blueholeCase: headerIndex(h, '블루홀케이스', '블루홀'),
    note: headerIndex(h, '특이'),
    proposedFee: headerIndex(h, '제안'),
    industry: headerIndex(h, '업종'),
    businessNo: headerIndex(h, '사업자'),
    representative: headerIndex(h, '대표자'),
    repPhone: headerIndex(h, '대표 연락'),
    admin: headerIndex(h, '관리자'),
    adminPhone: headerIndex(h, '관리자 연락'),
    address: headerIndex(h, '주소'),
    email: headerIndex(h, '이메일'),
    contractStatus: headerIndex(h, '계약'),
  };

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const companyName = col.companyName >= 0 ? cellText(row[col.companyName]) : '';
    const phone = col.phone >= 0 ? cellText(row[col.phone]) : '';
    if (!companyName && !phone) continue;
    const key = `inquiry||${r}||${companyName || phone}`;
    out.push({
      excelKey: key,
      companyName: companyName || '(미입력)',
      phone,
      channel: col.channel >= 0 ? cellText(row[col.channel]) : '',
      consultant: col.consultant >= 0 ? cellText(row[col.consultant]) : '',
      inquiryDate: col.inquiryDate >= 0 ? excelDateSerial(row[col.inquiryDate]) : '',
      inquiryContent: col.inquiryContent >= 0 ? cellText(row[col.inquiryContent]) : '',
      contractStatus: '',
      proposedFee: col.proposedFee >= 0 && typeof row[col.proposedFee] === 'number' ? row[col.proposedFee] : null,
      industry: col.industry >= 0 ? cellText(row[col.industry]) : '',
      businessNo: col.businessNo >= 0 ? cellText(row[col.businessNo]) : '',
      representative: col.representative >= 0 ? cellText(row[col.representative]) : '',
      address: col.address >= 0 ? cellText(row[col.address]) : '',
      contractStatus: col.contractStatus >= 0 ? cellText(row[col.contractStatus]) : '',
      extra: {
        blueholeCase: col.blueholeCase >= 0 ? cellText(row[col.blueholeCase]) : '',
        note: col.note >= 0 ? cellText(row[col.note]) : '',
        repPhone: col.repPhone >= 0 ? cellText(row[col.repPhone]) : '',
        admin: col.admin >= 0 ? cellText(row[col.admin]) : '',
        adminPhone: col.adminPhone >= 0 ? cellText(row[col.adminPhone]) : '',
        email: col.email >= 0 ? cellText(row[col.email]) : '',
      },
    });
  }
  return out;
}

export function parseIntakeProcesses(rows) {
  if (!rows.length) return [];
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const companyName = cellText(row[0]);
    if (!companyName) continue;
    const checklist = Object.fromEntries(CHECKLIST_KEYS.map(k => [k, false]));
    CHECKLIST_KEYS.forEach((k, i) => {
      checklist[k] = parseBool(row[4 + i]);
    });
    out.push({
      excelKey: `process||${companyName}`,
      companyName,
      feeStartDate: excelDateSerial(row[1]),
      monthlyFee: typeof row[2] === 'number' ? row[2] : null,
      channel: cellText(row[3]),
      checklist,
    });
  }
  return out;
}

export function parseChurnRows(rows) {
  if (!rows.length) return [];
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const companyName = cellText(row[0]);
    if (!companyName) continue;
    out.push({
      excelKey: `churn||${companyName}`,
      companyName,
      churnedAt: excelDateSerial(row[1]),
      feeAmount: typeof row[2] === 'number' ? row[2] : null,
      dataCleanup: cellText(row[3]),
      churnType: cellText(row[4]),
      earlySign: cellText(row[5]),
      reason: cellText(row[6]) || cellText(row[4]) || '기타',
      manager: cellText(row[7]),
      businessNo: cellText(row[9]),
      representative: cellText(row[10]),
    });
  }
  return out;
}

export function parseMeetingSchedule(rows, sheetName) {
  const out = [];
  if (!rows.length) return out;

  if (sheetName === '미팅 스케쥴') {
    for (const block of MANAGER_BLOCKS) {
      const { manager, col } = block;
      for (let r = 2; r < rows.length; r++) {
        const row = rows[r];
        const companyName = cellText(row[col]);
        if (!companyName) continue;
        out.push({
          excelKey: `meet-sched||${manager}||${companyName}`,
          sourceSheet: sheetName,
          companyName,
          manager,
          trialBalanceDate: cellText(row[col + 1]),
          reportType: cellText(row[col + 2]),
          visitType: cellText(row[col + 3]),
          notes: cellText(row[col + 4]),
          feeNote: cellText(row[col + 5]),
          nextSchedule: cellText(row[col + 6]),
          scheduleLabel: '',
          visitDetail: {},
        });
      }
    }
    return out;
  }

  if (sheetName === '미팅스케쥴 관리') {
    for (const block of MANAGER_BLOCKS) {
      const { manager, col } = block;
      for (let r = 2; r < rows.length; r++) {
        const row = rows[r];
        const entityType = cellText(row[col + 1]);
        const companyName = cellText(row[col + 2]);
        const scheduleLabel = cellText(row[col + 3]);
        if (!companyName) continue;
        out.push({
          excelKey: `meet-mgmt||${manager}||${companyName}`,
          sourceSheet: sheetName,
          companyName,
          manager,
          scheduleLabel,
          visitDetail: { entityType },
          trialBalanceDate: '',
          reportType: '',
          visitType: '',
          notes: '',
          feeNote: '',
          nextSchedule: '',
        });
      }
    }
    return out;
  }

  if (sheetName === '청년들 방문미팅') {
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const companyName = cellText(row[1]);
      if (!companyName) continue;
      out.push({
        excelKey: `visit||${companyName}||${r}`,
        sourceSheet: sheetName,
        companyName,
        manager: cellText(row[3]),
        scheduleLabel: excelDateSerial(row[2]),
        trialBalanceDate: '',
        reportType: '',
        visitType: '',
        notes: '',
        feeNote: '',
        nextSchedule: '',
        visitDetail: {
          consultant2: cellText(row[4]),
          request: cellText(row[5]),
          reportGuide: cellText(row[6]),
          feeGuide: cellText(row[7]),
          appInstall: cellText(row[8]),
          reportKeep: cellText(row[9]),
          referral: cellText(row[10]),
          attendee: cellText(row[11]),
          memo: cellText(row[13]),
        },
      });
    }
  }
  return out;
}

export function parseReportDeliveries(rows) {
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const companyName = cellText(row[0]);
    if (!companyName) continue;
    const businessNo = cellText(row[1]);
    out.push({
      excelKey: `report||${companyName}||${businessNo || r}`,
      companyName,
      businessNo,
      externalManager: cellText(row[2]),
      semoSent: parseBool(row[3]),
      contractStatus: cellText(row[4]),
      entityType: cellText(row[5]),
      taxType: cellText(row[6]),
      program: cellText(row[7]),
      representative: cellText(row[8]),
      repPhone: cellText(row[9]),
    });
  }
  return out;
}

export function parseSettlementVisits(rows) {
  const managers = [];
  for (let c = 0; c < (rows[0]?.length ?? 0); c++) {
    const m = cellText(rows[0]?.[c]);
    if (m) managers.push({ name: m, col: c });
  }
  const out = [];
  for (const { name, col } of managers) {
    for (let r = 2; r < rows.length; r++) {
      const row = rows[r];
      const companyName = cellText(row[col + 2]);
      if (!companyName) continue;
      out.push({
        excelKey: `settle||${name}||${companyName}`,
        branchManager: name,
        entityType: cellText(row[col + 1]),
        companyName,
        visitDate: cellText(row[col + 3]),
        reportFormat: cellText(row[col + 4]),
      });
    }
  }
  return out;
}

export function parseWorkChecklists(rows) {
  if (rows.length < 3) return [];
  const header = rows[0] || [];
  const tasks = (rows[1] || []).map(cellText);

  const staffCols = [];
  header.forEach((cell, c) => {
    const name = cellText(cell);
    if (name && ['인디', '페리', '블루', '다야', '윈터', '리아', '찰리'].includes(name)) {
      staffCols.push({ staffName: name, col: c });
    }
  });

  const out = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    const period = cellText(row[0]);
    const weekLabel = cellText(row[4]) || '';
    if (!period) continue;

    for (const { staffName, col } of staffCols) {
      const checks = {};
      for (let c = 0; c < tasks.length; c++) {
        const task = tasks[c];
        if (!task || task === '월간업무' || task === '주간업무') continue;
        checks[task] = cellText(row[c]) || '';
      }
      if (col < row.length && cellText(row[col])) {
        for (let c = col; c < Math.min(col + 8, tasks.length); c++) {
          const task = tasks[c];
          if (!task || task === '월간업무' || task === '주간업무') continue;
          const val = cellText(row[c]);
          if (val) checks[task] = val;
        }
      }
      out.push({
        excelKey: `check||${period}||${weekLabel}||${staffName}||${r}`,
        period,
        weekLabel,
        staffName,
        checks,
      });
    }
  }
  return out;
}

export function mergeChecklists(prev, next) {
  const out = { ...prev };
  for (const [k, v] of Object.entries(next)) {
    if (v === true) out[k] = true;
    else if (out[k] === undefined) out[k] = v;
  }
  return out;
}

function companyKey(name) {
  return String(name ?? '').trim().normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

/** 유입관리 블루홀케이스 → 유입프로세스 블루홀 거래처 등록 (엑셀 운영 방식) */
function enrichProcessesWithInquiries(processes, inquiries) {
  const inqByName = new Map();
  for (const i of inquiries) {
    const code = String(i.extra?.blueholeCase ?? '').trim();
    if (!code) continue;
    const key = companyKey(i.companyName);
    if (key) inqByName.set(key, code);
  }

  return processes.map(p => {
    const code = inqByName.get(companyKey(p.companyName));
    if (!code) return p;
    return {
      ...p,
      checklist: {
        ...p.checklist,
        blueholeClient: Boolean(p.checklist?.blueholeClient) || true,
      },
    };
  });
}

export function parseWorkbook(wb, XLSX) {
  const get = name => {
    if (!wb.Sheets[name]) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
  };

  let clientRows = get('수임처관리');
  if (!clientRows.length) {
    for (const name of wb.SheetNames) {
      const rows = get(name);
      if (detectSuimcheoManagementLayout(rows)) {
        clientRows = rows;
        break;
      }
    }
  }

  const inquiries = parseIntakeInquiries(get('유입관리'));
  const processes = enrichProcessesWithInquiries(
    parseIntakeProcesses(get('유입프로세스')),
    inquiries,
  );

  return {
    clients: parseSuimcheoRows(clientRows),
    inquiries,
    processes,
    churns: parseChurnRows(get('유출')),
  };
}
