import type { TaxReportData, ExpenseItem } from '../types';

async function getPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }
  return pdfjsLib;
}

interface TextItem { str: string; x: number; y: number; }
export interface PageData { text: string; items: TextItem[]; }
interface Row { y: number; text: string; items: TextItem[]; }

// ─── PDF 텍스트 추출 (cMapUrl 포함) ─────────────────────────────
export async function extractTextFromPdf(file: File): Promise<PageData[]> {
  const pdfjsLib = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: '/cmaps/',     // ← 한글 폰트 해독에 필수
    cMapPacked: true,
  }).promise;

  const pages: PageData[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    const items: TextItem[] = textContent.items
      .filter(item => 'str' in item && (item as { str: string }).str.trim())
      .map(item => {
        const it = item as { str: string; transform: number[] };
        return { str: it.str, x: it.transform[4], y: it.transform[5] };
      });

    pages.push({ text: items.map(i => i.str).join(' '), items });
  }
  return pages;
}

// ─── 한글 공백 정규화 ──────────────────────────────────────────
function normalizeKorean(text: string): string {
  let prev = '';
  let result = text;
  do {
    prev = result;
    result = result.replace(/([가-힣ㄱ-ㅎㅏ-ㅣ])\s+([가-힣ㄱ-ㅎㅏ-ㅣ])/g, '$1$2');
  } while (result !== prev);
  return result;
}

// ─── 숫자 사이 공백 제거 ───────────────────────────────────────
// PDF가 각 숫자 글자를 별도 item으로 추출해 "7 0 1 2 0 1" 같은 형식이 됨
// "6 0 , 6 9 9 , 9 9 9" → "60,699,999"
// "7 0 1 2 0 1" → "701201"
function collapseDigitSpaces(text: string): string {
  let prev = '';
  let result = text;
  do {
    prev = result;
    result = result
      .replace(/(\d)\s+(\d)/g, '$1$2')           // "6 0" → "60"
      .replace(/(\d)\s*,\s*(\d)/g, '$1,$2')      // "60 , 699" → "60,699"
      .replace(/(\d)\s*:\s*(\d)/g, '$1:$2');     // "60 : 000" → "60:000"
  } while (result !== prev);
  return result;
}

// ─── 숫자 추출 ──────────────────────────────────────────────────
function extractNumber(text: string): number {
  const cleaned = text.replace(/[,:\s]/g, '').replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

// 표준손익계산서 코드:금액 형식 ("6 0 : 0 0 0 : 0 0 0") 처리
// afterKeyword = 키워드 다음에 오는 텍스트 (예: " 3 4 : : 2 : 5 6 0 : 3 1 9")
function extractColonNumber(afterKeyword: string): number {
  const noSpaces = afterKeyword.replace(/\s/g, '');
  // 앞의 2자리 코드를 제외하고 금액 부분만 추출
  // 형식: "34::2:560:319" → ":"까지 스킵 → "2560319"
  const m = noSpaces.match(/^\d{0,2}:([\d:]*)/);
  if (!m) return 0;
  return parseInt(m[1].replace(/:/g, ''), 10) || 0;
}

// ─── 행(Row) 그룹핑 ──────────────────────────────────────────
function groupByRow(items: TextItem[], yTolerance = 4): Row[] {
  const rows: Array<{ y: number; items: TextItem[] }> = [];
  for (const item of items) {
    const existing = rows.find(r => Math.abs(r.y - item.y) <= yTolerance);
    if (existing) existing.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows
    .map(r => {
      const sorted = r.items.slice().sort((a, b) => a.x - b.x);
      const rawText = normalizeKorean(sorted.map(i => i.str).join(' '));
      return { y: r.y, items: sorted, text: collapseDigitSpaces(rawText) };
    })
    .sort((a, b) => b.y - a.y);
}

// ─── 행 기반 값 검색 (첫 번째 매칭) ──────────────────────────────
function rowSearch(rows: Row[], keywords: string[], numPattern: RegExp): string {
  for (const row of rows) {
    for (const kw of keywords) {
      const idx = row.text.indexOf(kw);
      if (idx === -1) continue;
      const after = row.text.substring(idx + kw.length);

      // 1) 일반 정규식 매칭
      const m = after.match(numPattern);
      if (m) return m[0];

      // 2) 표준손익계산서 콜론 형식
      const colonNum = extractColonNumber(after);
      if (colonNum > 0) return String(colonNum);

      // 3) 행 오른쪽 item에서 직접 매칭
      const rightItems = row.items.slice().reverse();
      for (const ri of rightItems) {
        if (numPattern.test(ri.str.trim())) return ri.str.trim();
      }
    }
  }
  return '';
}

// ─── 행 기반 값 검색 (마지막 매칭 = 합계 컬럼) ───────────────────
// 사업소득명세서는 "일련번호1 값 | 일련번호2 값 | ... | 합계 값" 구조
// → 같은 숫자가 여러 번 나오면 마지막이 합계
// → 다른 값이 여러 개면 마지막이 합계 (모두 더한 값)
function rowSearchLast(rows: Row[], keywords: string[], numPattern: RegExp): string {
  for (const row of rows) {
    for (const kw of keywords) {
      const idx = row.text.indexOf(kw);
      if (idx === -1) continue;
      const after = row.text.substring(idx + kw.length);

      // 전체 매칭 목록에서 마지막 값 반환
      const globalPattern = new RegExp(numPattern.source, 'g');
      const allMatches = [...after.matchAll(globalPattern)];
      if (allMatches.length > 0) return allMatches[allMatches.length - 1][0];
    }
  }
  return '';
}

// ─── 사업소득명세서 파싱 ──────────────────────────────────────
function parseSalesIncomePage(page: PageData): {
  reportTypeCode: string;
  incomeTypeCode: string;
  industryCode: string;
  totalRevenue: number;
  totalExpenses: number;
} {
  const rows = groupByRow(page.items);

  console.log('[사업소득명세서] 행 샘플:');
  rows.slice(0, 25).forEach(r => console.log(`  y=${r.y.toFixed(1)} | ${r.text.substring(0, 100)}`));

  // 신고유형코드: 행에서 "신고유형코드" 뒤 1-2자리 숫자
  const reportTypeCode =
    rowSearch(rows, ['신고유형코드'], /\b(20|12|13|14|15|16|17|18|19|11|10)\b/) ||
    rowSearch(rows, ['신고유형코드'], /\d{1,2}/);

  // 소득구분코드
  const incomeTypeCode = rowSearch(rows, ['소득구분코드'], /\d{2}/);

  // 주업종코드: 6자리 숫자
  const industryCode = rowSearch(rows, ['주업종코드', '업종코드'], /\d{6}/);

  // 총수입금액 — 마지막 숫자 = 합계 컬럼
  // ("118,491,925118,491,925" → 두 번째가 합계, "50,000,00070,000,000120,000,000" → 마지막이 합계)
  const revStr = rowSearchLast(rows, ['총수입금액', '수입금액합계'], /\d{1,3}(?:,\d{3})+/)
              || rowSearchLast(rows, ['총수입금액', '수입금액합계'], /\d{6,}/);
  const totalRevenue = extractNumber(revStr);

  // 필요경비 — 마지막 숫자 = 합계 컬럼
  const expStr = rowSearchLast(rows, ['필요경비합계', '필요경비'], /\d{1,3}(?:,\d{3})+/)
              || rowSearchLast(rows, ['필요경비합계', '필요경비'], /\d{6,}/);
  const totalExpenses = extractNumber(expStr);

  console.log('[사업소득명세서] 결과:', { reportTypeCode, incomeTypeCode, industryCode, totalRevenue, totalExpenses });
  return { reportTypeCode, incomeTypeCode, industryCode, totalRevenue, totalExpenses };
}

// ─── 비용 항목 키워드 ────────────────────────────────────────
const EXPENSE_KEYWORDS: Array<{ keywords: string[]; label: string }> = [
  { keywords: ['상품매출원가'], label: '상품매출원가' },
  { keywords: ['인건비', '급료', '급여와임금', '급여임금', '급여와임금ㆍ제수당'], label: '인건비' },
  { keywords: ['임차료'], label: '임차료' },
  { keywords: ['세금과공과', '제세공과금', '세금과 공과'], label: '세금과공과' },
  { keywords: ['지급이자', '이자비용'], label: '지급이자' },
  { keywords: ['기업업무추진비', '접대비'], label: '접대비' },
  { keywords: ['감가상각비'], label: '감가상각비' },
  { keywords: ['차량유지비'], label: '차량유지비' },
  { keywords: ['지급수수료'], label: '지급수수료' },
  { keywords: ['소모품비'], label: '소모품비' },
  { keywords: ['복리후생비'], label: '복리후생비' },
  { keywords: ['광고선전비'], label: '광고선전비' },
  { keywords: ['여비교통비'], label: '여비교통비' },
  { keywords: ['보험료'], label: '보험료' },
  { keywords: ['통신비'], label: '통신비' },
  { keywords: ['기부금'], label: '기부금' },
  { keywords: ['노무비'], label: '노무비' },
  { keywords: ['재료비'], label: '재료비' },
  { keywords: ['운반비'], label: '운반비' },
  { keywords: ['중개비'], label: '중개비' },
  { keywords: ['잡이익', '잡수입'], label: '잡이익' },
  { keywords: ['기타경비', '기타 경비', '기타비용', '기타필요경비'], label: '기타경비' },
];

// ─── 단일 컬럼 행 목록에서 비용 항목 추출 ────────────────────
function extractExpenseFromRows(rows: Row[]): ExpenseItem[] {
  const result: ExpenseItem[] = [];
  const usedRows = new Set<number>();

  for (const { keywords, label } of EXPENSE_KEYWORDS) {
    for (let ri = 0; ri < rows.length; ri++) {
      if (usedRows.has(ri)) continue;
      const row = rows[ri];

      let afterKeyword = '';
      for (const kw of keywords) {
        const idx = row.text.indexOf(kw);
        if (idx !== -1) { afterKeyword = row.text.substring(idx + kw.length); break; }
      }
      if (!afterKeyword) continue;

      // 일반 콤마 숫자
      const commaMatch = afterKeyword.match(/[\d,]{5,}/);
      if (commaMatch) {
        const amount = extractNumber(commaMatch[0]);
        if (amount > 0) { result.push({ label, amount }); usedRows.add(ri); break; }
      }

      // 표준손익계산서 콜론 형식
      const colonNum = extractColonNumber(afterKeyword);
      if (colonNum > 0) { result.push({ label, amount: colonNum }); usedRows.add(ri); break; }
    }
  }
  return result;
}

// ─── CASE A: 총수입금액 및 필요경비명세서 ─────────────────────
// 폼 구조: 좌측=수입금액(매출액/기타/합계), 우측=필요경비(인건비/임차료/.../기타/합계)
// 전략: 알려진 경비 키워드(인건비·임차료 등)의 x좌표를 기준으로 경비 컬럼 분리
//       → 우측(경비) 컬럼 안에서만 "기타" 를 추출해 수입 기타와 혼동 방지
function parseCaseA(pages: PageData[]): {
  expenseItems: ExpenseItem[];
  totalExpenses: number;
  totalRevenue: number;
  industryCode: string;
} {
  const targetPage = pages.find(p => {
    const n = normalizeKorean(p.text);
    return n.includes('총수입금액및필요경비명세서') || n.includes('총수입금액 및 필요경비명세서');
  });

  if (!targetPage) {
    console.log('[CASE A] 총수입금액명세서 페이지 없음');
    return { expenseItems: [], totalExpenses: 0, totalRevenue: 0, industryCode: '' };
  }

  const rows = groupByRow(targetPage.items);
  console.log('[CASE A] 행 샘플:');
  rows.slice(0, 30).forEach(r => console.log(`  y=${r.y.toFixed(1)} | ${r.text.substring(0, 100)}`));

  const industryCode = rowSearch(rows, ['주업종코드', '업종코드'], /\d{6}/);

  // 수입금액 합계 (매출액/기타 구분 없이 합계만 사용)
  const revStr = rowSearch(rows, ['수입금액합계', '⑬수입금액합계', '총수입금액합계', '수입합계'], /[\d,]{5,}/);
  const totalRevenue = extractNumber(revStr);

  // 필요경비 합계
  const expStr = rowSearch(rows, ['필요경비합계', '경비합계'], /[\d,]{5,}/);
  const totalExpenses = extractNumber(expStr);

  // ── 경비 컬럼 x좌표 결정 ──────────────────────────────────────
  // 인건비·임차료 등 알려진 경비 항목 아이템의 최소 x를 경비 컬럼 시작점으로 사용
  const KNOWN_EXP_KWS = ['인건비', '임차료', '세금과공과', '감가상각비', '접대비', '기부금'];
  const expColItems = targetPage.items.filter(i =>
    KNOWN_EXP_KWS.some(kw => normalizeKorean(i.str).includes(kw))
  );
  const expColMinX = expColItems.length > 0
    ? Math.min(...expColItems.map(i => i.x)) - 5   // 약간 여유
    : 250;                                           // 기본값

  console.log('[CASE A] 경비 컬럼 시작 x:', expColMinX.toFixed(1));

  // 경비 컬럼 아이템만으로 행 재구성 → "기타" 혼동 방지
  const expColRows = groupByRow(targetPage.items.filter(i => i.x >= expColMinX));

  // 경비 항목 추출
  const expenseItems = extractExpenseFromRows(expColRows);

  // "기타 경비" 추가 추출 (경비 컬럼 내에서만)
  if (!expenseItems.some(e => e.label === '기타경비')) {
    for (const row of expColRows) {
      if (!row.text.includes('기타')) continue;
      if (row.text.includes('합계')) continue; // 합계 행 제외
      const after = row.text.substring(row.text.indexOf('기타') + 2);
      const commaMatch = after.match(/[\d,]{4,}/);
      if (commaMatch) {
        const amt = extractNumber(commaMatch[0]);
        if (amt > 0) { expenseItems.push({ label: '기타경비', amount: amt }); break; }
      }
    }
  }

  console.log('[CASE A] 결과:', { industryCode, totalRevenue, totalExpenses, count: expenseItems.length, items: expenseItems.map(i => `${i.label}:${i.amount}`) });
  return { expenseItems, totalExpenses, totalRevenue, industryCode };
}

// ─── Item 레벨 금액 추출 (표준손익계산서 전용) ─────────────────────
// row.text의 collapseDigitSpaces는 두 컬럼 경계에서 "000 9"→"0009" 오류 발생
// → items를 직접 처리하여 "digit 다음에 '.'" 가 오면 컬럼 경계로 판단하고 중단
function extractAmountFromItems(row: Row, keywords: string[]): number {
  for (const kw of keywords) {
    if (!row.text.includes(kw)) continue;  // 빠른 사전 필터

    // 키워드가 끝나는 item 위치 탐색
    let accumulated = '';
    let kwEndIdx = -1;
    for (let i = 0; i < row.items.length; i++) {
      accumulated = normalizeKorean(accumulated + row.items[i].str);
      if (accumulated.includes(kw)) { kwEndIdx = i; break; }
    }
    if (kwEndIdx === -1) continue;

    // 키워드 이후 digit/colon item 수집
    const parts: string[] = [];
    for (let i = kwEndIdx + 1; i < row.items.length; i++) {
      const s = row.items[i].str.trim();
      if (!s) continue;
      if (/^[\d:,]+$/.test(s)) {
        // 다음 item이 '.' 이면 컬럼 구분자("9. 항목명") → 중단
        const nxt = row.items[i + 1]?.str.trim();
        if (nxt === '.') break;
        parts.push(s);
      } else {
        break; // 한글·로마자 등 비숫자 → 중단
      }
    }
    if (!parts.length) continue;

    const combined = parts.join('');
    const colonNum = extractColonNumber(combined);
    if (colonNum > 0) return colonNum;
    const plain = extractNumber(combined);
    if (plain > 0) return plain;
  }
  return 0;
}

// ─── 표준손익계산서용 컬럼 분리점 감지 ───────────────────────────────
// 전략: [240, 380] 범위에서 왼쪽에서 오른쪽으로 스캔하며 가장 먼저 나타나는
// 8pt 이상 갭의 위치를 SPLIT_X로 사용 (왼쪽 컬럼 금액↔오른쪽 컬럼 레이블 경계)
function findColumnSplit(items: TextItem[]): number {
  const xs = items.map(i => i.x).sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    const mid = (xs[i] + xs[i + 1]) / 2;
    const gap = xs[i + 1] - xs[i];
    if (mid >= 240 && mid <= 380 && gap >= 8) {
      console.log(`[findColumnSplit] SPLIT_X=${mid.toFixed(1)} gap=${gap.toFixed(1)}`);
      return mid;
    }
  }
  console.log('[findColumnSplit] 기본값 285 사용');
  return 285;
}

// ─── 표준손익계산서 colon-format 금액 추출 (경계 오류 없음) ──────────
// 핵심 원리: \d{3} 는 정확히 3자리만 매칭 → "7259." 에서 "725" 만 캡처되고 "9." 는 남음
// 지원 형식:
//   3-group: CODE::X:XXX:XXX  (예: 34::5:579:109 → 5,579,109)
//   2-group: CODE::XX:XXX     (예: 26::64:032    → 64,032)
//   0-amount: CODE::::0 or CODE::0XX → 매칭 안 됨 → 0 반환
function extractColonNumberClean(afterKeyword: string): number {
  const s = afterKeyword.replace(/\s+/g, '');
  // \d{3} 가 정확히 3자리만 소비 → 우측컬럼 표시번호(1-2자리)가 자동 제외됨
  const m = s.match(/^\d{0,2}::(\d{1,3}:\d{3}:\d{3}|\d{1,3}:\d{3})/);
  if (m) {
    const numStr = m[1].replace(/:/g, '');
    const n = parseInt(numStr, 10);
    if (n > 0) return n;
  }
  return 0; // 패턴 불일치 = 0원 or 잘못된 형식
}

// ─── 행 텍스트에서 키워드 뒤 금액 추출 ──────────────────────────────
// 콜론 형식: "CODE::X:XXX:XXX" 또는 "CODE::X:XXX" 패턴을 afterKw 어디서든 검색
// 이유: "(①+②-③-④) 10::32:358:717..." 처럼 괄호 수식 뒤에 코드가 오는 경우 처리
function extractColonAmountFromRow(row: Row, keywords: string[]): number {
  for (const kw of keywords) {
    const idx = row.text.indexOf(kw);
    if (idx === -1) continue;
    const after = row.text.substring(idx + kw.length);
    // 콤마 형식 (총수입금액명세서 등) — 올바른 콤마형 숫자만 추출(중복방지)
    const commaMatch = after.match(/\d{1,3}(?:,\d{3})+/);
    if (commaMatch) { const v = extractNumber(commaMatch[0]); if (v > 0) return v; }
    // 콜론 형식 (표준손익계산서) — afterKw 어느 위치든 "CODE::X:XXX:XXX" 패턴 검색
    // \d{3} 정확히 3자리 매칭으로 우측컬럼 표시번호와 자동 경계 분리
    const colonMatch = after.match(/\d{1,2}::(\d{1,3}:\d{3}:\d{3}|\d{1,3}:\d{3})/);
    if (colonMatch) {
      const n = parseInt(colonMatch[1].replace(/:/g, ''), 10);
      if (n > 0) return n;
    }
  }
  return 0;
}

// ─── CASE B: 표준손익계산서 파싱 ─────────────────────────────────────
// 핵심 전략:
//   · findColumnSplit 으로 왼쪽/오른쪽 컬럼 분리
//   · 실제 분리 결과에 따라 두 가지 상황이 발생:
//     A) 키워드 + 금액 모두 왼쪽 행 → extractColonNumberClean 으로 추출
//     B) 키워드는 왼쪽 행 끝, 금액은 오른쪽 행("34::5:579:109") → y좌표 매칭
function parseCaseB(pages: PageData[]): {
  expenseItems: ExpenseItem[];
  totalExpenses: number;
  totalRevenue: number;
} {
  const targetPage = pages.find(p => normalizeKorean(p.text).includes('표준손익계산서'));
  if (!targetPage) return { expenseItems: [], totalExpenses: 0, totalRevenue: 0 };

  const SPLIT_X = findColumnSplit(targetPage.items);
  const leftRows  = groupByRow(targetPage.items.filter(i => i.x < SPLIT_X));
  const rightRows = groupByRow(targetPage.items.filter(i => i.x >= SPLIT_X));

  // 전체 행 출력 (디버깅)
  console.log('[CASE B] 왼쪽 컬럼 행 (전체):');
  leftRows.forEach(r => console.log(`  L y=${r.y.toFixed(1)} | ${r.text.substring(0, 110)}`));
  console.log('[CASE B] 오른쪽 컬럼 행 (전체):');
  rightRows.forEach(r => console.log(`  R y=${r.y.toFixed(1)} | ${r.text.substring(0, 110)}`));

  // ── 매출액 합계 ──
  let totalRevenue = 0;
  for (const row of leftRows) {
    if (!row.text.includes('매출액')) continue;
    const amt = extractColonAmountFromRow(row, ['매출액']);
    if (amt > 0) { totalRevenue = amt; break; }
  }
  if (totalRevenue === 0) {
    for (const kw of ['임대수입', '서비스수입', '공사수입', '상품매출']) {
      for (const row of leftRows) {
        const amt = extractColonAmountFromRow(row, [kw]);
        if (amt > 0) { totalRevenue += amt; break; }
      }
    }
  }

  // ── 비용 항목 추출 ──
  // 핵심 원칙:
  //   ① 왼쪽컬럼 항목: 키워드 뒤에 "숫자::" 패턴 → extractColonAmountFromRow 로 직접 추출
  //   ② 오른쪽컬럼 항목: 키워드 뒤에 코드패턴 없음(행 끝에 레이블로만 등장) → y매칭으로 right행 추출
  //
  // usedL 제거 이유:
  //   같은 왼쪽 행에 여비교통비(①)와 소모품비(②)가 함께 있어서
  //   usedL 로 행을 잠그면 소모품비를 못 찾는 문제가 있었음
  const expenseItems: ExpenseItem[] = [];
  const extractedLabels = new Set<string>(); // 추출 완료된 레이블(중복 방지)
  const usedR = new Set<number>();           // 오른쪽 행 인덱스 점유 추적

  for (const { keywords, label } of EXPENSE_KEYWORDS) {
    if (extractedLabels.has(label)) continue;

    for (let ri = 0; ri < leftRows.length; ri++) {
      let matchedKw = '';
      for (const kw of keywords) {
        if (leftRows[ri].text.includes(kw)) { matchedKw = kw; break; }
      }
      if (!matchedKw) continue;

      const kwIdx = leftRows[ri].text.indexOf(matchedKw);
      const afterKw = leftRows[ri].text.substring(kwIdx + matchedKw.length);

      // ① 왼쪽컬럼 고유 항목 판별: afterKw 어디든 "숫자::[숫자or콜론]" 패턴 존재
      // - "26::2:985:640..." → 여비교통비 직접
      // - "ㆍ제수당 22::::028..." → 급여와임금ㆍ제수당 (키워드가 앞부분만 매칭)
      // - "(①+②-③-④) 10::32:358:717..." → 상품매출원가 (괄호 수식 뒤)
      // 위 세 경우 모두 "숫자::" 가 afterKw 어딘가에 존재 → LEFT컬럼 항목
      if (/\d{1,2}::[\d:]/.test(afterKw)) {
        const amtL = extractColonAmountFromRow(leftRows[ri], keywords);
        if (amtL > 0) {
          expenseItems.push({ label, amount: amtL });
          extractedLabels.add(label);
        }
        // 0원이든 양수든 이 행에서 더 이상 getRightAmt 하지 않음 (right y는 다른 항목 것)
        break;
      }

      // ② 오른쪽컬럼 항목: 같은 y의 right행에서 금액 추출
      const ri2 = rightRows.findIndex((r, idx) => !usedR.has(idx) && Math.abs(r.y - leftRows[ri].y) < 3);
      if (ri2 >= 0) {
        const amtR = extractColonNumber(rightRows[ri2].text);
        if (amtR > 0) {
          expenseItems.push({ label, amount: amtR });
          extractedLabels.add(label);
          usedR.add(ri2);
        }
      }
      break;
    }
  }

  // ── 판매비와관리비 합계 ──
  let totalExpenses = 0;
  for (const row of leftRows) {
    const amt = extractColonAmountFromRow(row, ['판매비와관리비']);
    if (amt > 0) { totalExpenses = amt; break; }
  }
  if (totalExpenses === 0) {
    const cogs = (() => {
      for (const r of leftRows) { const a = extractColonAmountFromRow(r, ['매출원가']); if (a > 0) return a; }
      return 0;
    })();
    totalExpenses = cogs + expenseItems.reduce((s, i) => s + i.amount, 0);
  }

  console.log('[CASE B] 결과:', { totalRevenue, totalExpenses, count: expenseItems.length, items: expenseItems.map(i => `${i.label}:${i.amount}`) });
  return { expenseItems, totalExpenses, totalRevenue };
}

// ─── 메인 파싱 함수 ───────────────────────────────────────────
export function parseTaxReport(pages: PageData[]): TaxReportData {
  const fullText = pages.map(p => p.text).join('\n');

  console.log(`[parseTaxReport] 총 페이지: ${pages.length}`);
  pages.forEach((p, i) =>
    console.log(`  p${i + 1}: ${normalizeKorean(p.text).substring(0, 80)}`)
  );

  // 사업소득명세서 페이지 (없으면 2번째 페이지 fallback)
  const salesPage = pages.find(p =>
    normalizeKorean(p.text).includes('사업소득명세서') ||
    normalizeKorean(p.text).includes('사업장현황')
  ) ?? pages[Math.min(1, pages.length - 1)];

  console.log('[salesPage] 텍스트:', normalizeKorean(salesPage?.text ?? '').substring(0, 150));

  const base = parseSalesIncomePage(salesPage);
  const { incomeTypeCode } = base;
  let { reportTypeCode, industryCode, totalRevenue, totalExpenses } = base;
  let caseType: 'A' | 'B' | 'UNKNOWN' = 'UNKNOWN';
  let expenseItems: ExpenseItem[] = [];

  if (reportTypeCode === '20') {
    caseType = 'A';
    const d = parseCaseA(pages);
    expenseItems = d.expenseItems;
    if (d.totalRevenue > 0)  totalRevenue  = d.totalRevenue;
    if (d.totalExpenses > 0) totalExpenses = d.totalExpenses;
    if (d.industryCode)      industryCode  = d.industryCode;
  } else if (reportTypeCode === '12') {
    caseType = 'B';
    const dA = parseCaseA(pages);
    if (dA.industryCode) industryCode = dA.industryCode;
    const d = parseCaseB(pages);
    expenseItems = d.expenseItems;
    // 사업소득명세서 합계가 정확하므로 0인 경우에만 표준손익계산서 값으로 보완
    if (totalRevenue === 0 && d.totalRevenue > 0)   totalRevenue  = d.totalRevenue;
    if (totalExpenses === 0 && d.totalExpenses > 0) totalExpenses = d.totalExpenses;
  } else {
    // reportTypeCode 미검출 → 내용으로 판단
    const norm = normalizeKorean(fullText);
    if (norm.includes('표준손익계산서')) {
      caseType = 'B';
      const d = parseCaseB(pages);
      expenseItems = d.expenseItems;
      if (d.totalRevenue > 0)  totalRevenue  = d.totalRevenue;
      if (d.totalExpenses > 0) totalExpenses = d.totalExpenses;
    } else if (norm.includes('총수입금액및필요경비명세서') || norm.includes('필요경비명세서')) {
      caseType = 'A';
      const d = parseCaseA(pages);
      expenseItems = d.expenseItems;
      if (d.totalRevenue > 0)  totalRevenue  = d.totalRevenue;
      if (d.totalExpenses > 0) totalExpenses = d.totalExpenses;
      if (d.industryCode)      industryCode  = d.industryCode;
    }
  }

  console.log('[parseTaxReport] 최종:', { caseType, reportTypeCode, industryCode, totalRevenue, totalExpenses });

  return { caseType, incomeTypeCode, reportTypeCode, industryCode, totalRevenue, totalExpenses, expenseItems, rawText: fullText };
}
