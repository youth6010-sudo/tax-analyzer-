/**
 * 더존 수임처 export (수임처-YYYYMMDD.xlsx) 파서
 */
export function cellText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' && value > 1000000000) return String(Math.trunc(value));
  return String(value).trim();
}

export function formatBusinessNo(value) {
  const d = cellText(value).replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  return d;
}

export function formatDateValue(value) {
  const s = cellText(value).replace(/\D/g, '');
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return cellText(value);
}

export function parseFee(value) {
  if (typeof value === 'number') return value;
  const n = parseInt(String(value).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function mapEntityType(label) {
  const s = cellText(label);
  if (s.includes('법인')) return 'corporate';
  if (s.includes('개인')) return 'individual';
  if (s.includes('면세') || s.includes('비사업')) return 'nonBusiness';
  return '';
}

/** UI 대분류 허용 값 */
export const CANONICAL_CATEGORIES = ['개인', '법인', '신고대리', '미사용', '비사업자'];

/** 구 대분류·프로그램명 → canonical (빈 문자열이면 구분 fallback) */
export const CATEGORY_ALIASES = {
  세무사랑: '',
  더존: '',
  지주택: '',
  신고대리: '신고대리',
};

function categoryFromEntityType(entityType) {
  if (entityType === 'corporate') return '법인';
  if (entityType === 'individual') return '개인';
  if (entityType === 'nonBusiness') return '비사업자';
  return '';
}

/**
 * TP `대분류` — Excel 값 그대로 저장. 비어 있을 때만 구분 fallback.
 */
export function normalizeCategory(raw, entityType = '') {
  const s = cellText(raw);
  if (!s) return categoryFromEntityType(entityType);
  return s;
}

export function yn(value) {
  return cellText(value).toUpperCase() === 'Y';
}

/** 실명 → 포털 닉네임 */
export const REAL_TO_NICK = {
  구진혜: '블루',
  홍다예: '다야',
  박혜림: '리아',
  안혜빈: '윈터',
  김평진: '페리',
  신상협: '인디',
  이희만: '찰리',
};

export function mapManager(realName) {
  const trimmed = cellText(realName);
  return REAL_TO_NICK[trimmed] ?? trimmed;
}

function splitContactPhone(raw) {
  const t = cellText(raw);
  if (!t) return { phone: '', mobilePhone: '' };
  const d = t.replace(/\D/g, '');
  if (/^01[016789]/.test(d)) return { phone: '', mobilePhone: t };
  return { phone: t, mobilePhone: '' };
}

export function detectSuimcheoExport(rows) {
  if (!rows?.length) return false;
  const h = rows[0].map(cellText);
  return h.includes('상호') && h.includes('사업자등록번호') && h.includes('상태');
}

function headerIndex(headerRow, ...names) {
  for (const name of names) {
    const idx = headerRow.findIndex(h => cellText(h) === name || cellText(h).includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

function cell(row, idx) {
  return idx >= 0 ? cellText(row[idx]) : '';
}

export function parseSuimcheoExportRows(rows) {
  if (!detectSuimcheoExport(rows)) return [];

  const h = rows[0].map(cellText);
  const col = {
    category: headerIndex(h, '대분류'),
    code: headerIndex(h, '코드'),
    companyName: headerIndex(h, '상호'),
    businessNo: headerIndex(h, '사업자등록번호'),
    representative: headerIndex(h, '대표자'),
    entityType: headerIndex(h, '구분'),
    team: headerIndex(h, '팀'),
    manager: headerIndex(h, '담당'),
    fee: headerIndex(h, '기장료'),
    mainOffice: headerIndex(h, '주사업장'),
    industry: headerIndex(h, '업태'),
    item: headerIndex(h, '종목'),
    address: headerIndex(h, '주소'),
    openAge: headerIndex(h, '개업당시만나이'),
    gender: headerIndex(h, '성별'),
    idNo: headerIndex(h, '주민·법인번호'),
    openDate: headerIndex(h, '개업일'),
    status: headerIndex(h, '상태'),
    closedDate: headerIndex(h, '폐업일'),
    taxKind: headerIndex(h, '과세유형'),
    convertedDate: headerIndex(h, '변환일'),
    taxInvoice: headerIndex(h, '세금계산서'),
    invoiceAvailableDate: headerIndex(h, '발행가능일'),
    filingType: headerIndex(h, '신고유형'),
    report: headerIndex(h, '보고서'),
    program: headerIndex(h, '프로그램'),
    employed: headerIndex(h, '상용'),
    daily: headerIndex(h, '일용'),
    retirement: headerIndex(h, '퇴직'),
    bizIncome: headerIndex(h, '사업'),
    interestDividend: headerIndex(h, '이자배당'),
    otherTax: headerIndex(h, '기타'),
    proxyPay: headerIndex(h, '대납'),
    payrollHistory: headerIndex(h, '근로내역'),
    clientContact: headerIndex(h, '수임처담당'),
    phone: headerIndex(h, '연락처'),
    fax: headerIndex(h, '팩스'),
    email: headerIndex(h, '메일주소'),
    emailTax: headerIndex(h, '메일주소(세금계산서발행용)'),
    callNote: headerIndex(h, '통화유의'),
    posVendor: headerIndex(h, '포스사'),
    taxOfficeContact: headerIndex(h, '세무서담당'),
    taxOfficePhone: headerIndex(h, '세무서담당연락처'),
    notePayroll: headerIndex(h, '급여대장특이사항'),
    noteWithholding: headerIndex(h, '원천세특이사항'),
    noteDataEntry: headerIndex(h, '자료입력특이사항'),
    notePayrollHistory: headerIndex(h, '근로내역특이사항'),
    noteVat: headerIndex(h, '부가세특이사항'),
    noteComprehensive: headerIndex(h, '종소세특이사항'),
    noteCorporate: headerIndex(h, '법인세특이사항'),
    noteOther: headerIndex(h, '기타특이사항'),
    relatedCompanies: headerIndex(h, '관계회사명'),
  };

  const parsed = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const companyName = cell(row, col.companyName);
    if (!companyName) continue;

    const entityType = mapEntityType(row[col.entityType]);
    const idNo = cell(row, col.idNo);
    const statusRaw = cell(row, col.status);
    const closedDate = formatDateValue(row[col.closedDate]);
    const convertedDate = cell(row, col.convertedDate);
    const contact = splitContactPhone(row[col.phone]);
    const isClosed = Boolean(closedDate);

    parsed.push({
      code: cell(row, col.code),
      companyName,
      businessNo: formatBusinessNo(row[col.businessNo]),
      representative: cell(row, col.representative),
      businessEntityType: entityType,
      managerReal: cell(row, col.manager),
      manager: mapManager(row[col.manager]),
      feeSummary: parseFee(row[col.fee]),
      phone: contact.phone,
      fax: cell(row, col.fax),
      corporateNo: entityType === 'corporate' ? idNo : '',
      residentNo: entityType === 'individual' || entityType === 'nonBusiness' ? idNo : '',
      taxTypes: [],
      program: cell(row, col.program),
      converted: Boolean(convertedDate),
      status: isClosed || statusRaw !== '수임' ? 'churned' : 'active',
      intakeData: {
        mobilePhone: contact.mobilePhone,
        douzoneCode: cell(row, col.code),
        category: normalizeCategory(row[col.category], entityType),
        team: cell(row, col.team),
        mainOffice: cell(row, col.mainOffice),
        address: cell(row, col.address),
        industry: cell(row, col.industry),
        item: cell(row, col.item),
        openAge: cell(row, col.openAge),
        gender: cell(row, col.gender),
        openDate: formatDateValue(row[col.openDate]),
        closedDate,
        taxKind: cell(row, col.taxKind),
        convertedDate: formatDateValue(convertedDate),
        taxInvoice: cell(row, col.taxInvoice),
        invoiceAvailableDate: formatDateValue(row[col.invoiceAvailableDate]),
        filingType: cell(row, col.filingType),
        report: cell(row, col.report),
        email: cell(row, col.email),
        emailTax: cell(row, col.emailTax),
        callNote: cell(row, col.callNote),
        posVendor: cell(row, col.posVendor),
        taxOfficeContact: cell(row, col.taxOfficeContact),
        taxOfficePhone: cell(row, col.taxOfficePhone),
        clientContact: cell(row, col.clientContact),
        payrollHistory: cell(row, col.payrollHistory),
        relatedCompanies: cell(row, col.relatedCompanies),
        statusLabel: isClosed ? '폐업' : statusRaw,
        taxFlags: {
          employed: yn(row[col.employed]),
          daily: yn(row[col.daily]),
          retirement: yn(row[col.retirement]),
          bizIncome: yn(row[col.bizIncome]),
          interestDividend: yn(row[col.interestDividend]),
          otherTax: yn(row[col.otherTax]),
          proxyPay: yn(row[col.proxyPay]),
        },
        notes: {
          payroll: cell(row, col.notePayroll),
          withholding: cell(row, col.noteWithholding),
          dataEntry: cell(row, col.noteDataEntry),
          payrollHistory: cell(row, col.notePayrollHistory),
          vat: cell(row, col.noteVat),
          comprehensive: cell(row, col.noteComprehensive),
          corporate: cell(row, col.noteCorporate),
          other: cell(row, col.noteOther),
        },
      },
    });
  }
  return parsed;
}
