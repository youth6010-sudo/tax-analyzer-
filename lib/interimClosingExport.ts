import type {
  ComputedReportRow,
  InterimClosingComputed,
  InterimClosingPayload,
} from '@/lib/interimClosingTypes';
import { remainingAssumptionMonths } from '@/lib/interimClosingTypes';
import { computeOwnerTaxBases } from '@/lib/interimClosingEngine';

export type InterimClosingPdfOptions = {
  /** 저장 시각 ISO — 없으면 오늘 */
  writtenAt?: string | null;
};

function formatWon(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '';
  if (n === 0) return '0';
  return Math.round(n).toLocaleString('ko-KR');
}

function formatPct(r: number | null | undefined): string {
  if (r == null || !Number.isFinite(r)) return '';
  return `${(r * 100).toFixed(1)}%`;
}

function formatPctHeader(r: number | null | undefined): string {
  if (r == null || !Number.isFinite(r)) return '';
  return `${(r * 100).toFixed(2)}%`;
}

function dashWon(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '—';
  return formatWon(n);
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 엑셀 인쇄처럼 한글 사이 자간 */
function spacedLabel(s: string): string {
  const t = String(s || '').trim();
  if (!t) return '';
  return t.replace(/([가-힣])(?=[가-힣])/g, '$1\u2009');
}

/** 작성일: 저장 시점 YYYY.MM.DD */
function formatWrittenAt(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const base = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${base.getFullYear()}.${String(base.getMonth() + 1).padStart(2, '0')}.${String(base.getDate()).padStart(2, '0')}`;
}

export async function savePdfBlob(blob: Blob, suggestedName = '손익분석보고서.pdf'): Promise<void> {
  type PickerOpts = {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  };
  type PickerFn = (opts: PickerOpts) => Promise<FileSystemFileHandle>;
  const picker =
    typeof window !== 'undefined' &&
    'showSaveFilePicker' in window &&
    typeof (window as Window & { showSaveFilePicker: PickerFn }).showSaveFilePicker === 'function'
      ? (window as Window & { showSaveFilePicker: PickerFn }).showSaveFilePicker
      : null;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName,
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e: unknown) {
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
      if (name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

function visibleRows(rows: ComputedReportRow[]): ComputedReportRow[] {
  const linked = rows.filter(r => r.linked && (r.kind === 'account' || r.kind === 'sub'));
  const hasLinked = linked.length > 0;
  const out: ComputedReportRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.excelRow > 605) continue;
    if (row.kind === 'label') {
      const codeCompact = (row.code || '').replace(/\s+/g, '');
      if (codeCompact.includes('세액계산')) continue;
      continue;
    }
    if (row.kind === 'account' || row.kind === 'sub') {
      if (!hasLinked || row.linked) out.push(row);
      continue;
    }
    if (row.isSection) {
      let hasChild = false;
      for (let j = i + 1; j < rows.length; j++) {
        const n = rows[j]!;
        if (n.isSection) break;
        if ((n.kind === 'account' || n.kind === 'sub') && n.linked) {
          hasChild = true;
          break;
        }
      }
      if (!hasLinked || hasChild || row.prior || row.current || row.annualized) out.push(row);
    }
  }
  return out;
}

async function fetchLogoDataUrl(): Promise<string> {
  try {
    const res = await fetch('/logo-cheongnyeondeul.png');
    if (!res.ok) return '';
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

/** 헤더 아래 PL 가용 행 수 (푸터 없는 페이지 / 푸터 있는 마지막 페이지) */
const ROWS_PER_PAGE = 48;
const ROWS_WITH_FOOTER = 28;

function splitRowsForPages(rows: ComputedReportRow[]): ComputedReportRow[][] {
  if (rows.length === 0) return [[]];
  // 헤더+표+푸터가 한 장에 들어가는 경우
  if (rows.length <= ROWS_WITH_FOOTER) return [rows];

  const pages: ComputedReportRow[][] = [];
  let rest = rows.slice();

  while (rest.length > ROWS_WITH_FOOTER) {
    const overflow = rest.length - ROWS_PER_PAGE;
    if (overflow <= 0) {
      // 남은 행이 풀페이지 이하인데 푸터 공간 필요 → 마지막 장에 ROWS_WITH_FOOTER 남김
      const leave = ROWS_WITH_FOOTER;
      pages.push(rest.slice(0, rest.length - leave));
      rest = rest.slice(rest.length - leave);
      break;
    }
    if (overflow <= ROWS_WITH_FOOTER) {
      pages.push(rest.slice(0, ROWS_PER_PAGE));
      rest = rest.slice(ROWS_PER_PAGE);
      break;
    }
    pages.push(rest.slice(0, ROWS_PER_PAGE));
    rest = rest.slice(ROWS_PER_PAGE);
  }
  if (rest.length) pages.push(rest);
  return pages;
}

function renderPlRow(row: ComputedReportRow): string {
  const isSec = row.isSection;
  const isSub = row.kind === 'sub';
  const code = (row.code || '').replace(/\s+/g, '');
  const name = spacedLabel(row.name || '');
  const show = isSec || row.linked;
  const prior = show ? formatWon(row.prior) : '';
  const cur = show ? formatWon(row.current) : '';
  const ann = show ? formatWon(row.annualized) : '';
  const pr = show ? formatPct(row.priorRatio) : '';
  const cr = show ? formatPct(row.currentRatio) : '';
  const ar = show ? formatPct(row.annualizedRatio) : '';
  const ibRaw = !isSec && row.linked && !row.isComputed ? (row.inputBasis || '').trim() : '';
  // 출력: 실적은 표시하지 않음 (비율 등만)
  const ib =
    !isSec && row.linked && !row.isComputed && ibRaw && ibRaw !== '-' && ibRaw !== '실적'
      ? spacedLabel(ibRaw)
      : '';
  const cbRaw = !isSec && row.linked && !row.isComputed ? (row.convertBasis || '').trim() : '';
  const cb = cbRaw && cbRaw !== '실적' ? spacedLabel(cbRaw) : '';
  const isAssume = cbRaw === '가정치';
  const cls = [isSec ? 'sec' : '', isSub ? 'sub' : ''].filter(Boolean).join(' ');
  // 대분류(Ⅰ·Ⅱ…)만 표기, 계정과목코드는 미표시
  const subj = isSec
    ? `${escapeHtml(code)} ${escapeHtml(name)}`.trim()
    : escapeHtml(name);
  const assumeCls = isAssume ? ' hl-assume' : '';
  return `<tr class="${cls}">
    <td class="subj">${subj}</td>
    <td class="num col-amt">${prior}</td>
    <td class="pct col-prior-end">${pr}</td>
    <td class="num col-amt">${cur}</td>
    <td class="pct col-amt">${cr}</td>
    <td class="basis col-ib">${escapeHtml(ib)}</td>
    <td class="num col-amt${assumeCls}">${ann}</td>
    <td class="pct col-amt${assumeCls}">${ar}</td>
    <td class="basis${assumeCls}">${escapeHtml(cb)}</td>
  </tr>`;
}

/** 엑셀 인쇄 PDF(손익분석보고서)와 동일한 A4 양식 HTML */
export function buildInterimClosingReportHtml(
  payload: InterimClosingPayload,
  computed: InterimClosingComputed,
  opts?: InterimClosingPdfOptions & { logoDataUrl?: string },
): string {
  const m = payload.manual;
  const tax = m.entityType === '개인' ? computed.personalTax : computed.corporateTax;
  const bases = computeOwnerTaxBases(m);
  const rows = visibleRows(computed.rows);
  const bm = payload.baseMonth;
  const priorLabel = '제 (전)기';
  const currentLabel = `제 (당)기-${bm}월 까지`;
  const annLabel = '제 (당)기-환산';
  const ownerName = m.confirmName?.trim()
    ? `대표급여(${m.confirmName.trim()})`
    : '대표급여(성명)';
  const execName = m.confirmRole?.trim()
    ? `임원급여(${m.confirmRole.trim()})`
    : '임원급여(성명)';
  const written = formatWrittenAt(opts?.writtenAt);
  const estimateFrom = bm < 12 ? bm + 1 : null;
  const logo = opts?.logoDataUrl || '';

  const assumptionMonths = remainingAssumptionMonths(bm);
  const assumptionPeriodLabel =
    assumptionMonths.length === 0
      ? '금액'
      : assumptionMonths.length === 1
        ? `${assumptionMonths[0]}월`
        : `${assumptionMonths[0]}~12월`;
  const assumptionRows =
    m.assumptions.length === 0
      ? `<tr><td colspan="3" class="empty">(없음)</td></tr>`
      : m.assumptions
          .map(a => {
            const total = assumptionMonths.reduce((s, mo) => {
              const v = Number(a.byMonth?.[String(mo)] ?? 0) || 0;
              return s + v;
            }, 0);
            return `<tr>
              <td class="c nowrap">${escapeHtml(a.name || '—')}</td>
              <td class="num nowrap">${total ? formatWon(total) : ''}</td>
              <td class="note nowrap">${escapeHtml(a.note || '')}</td>
            </tr>`;
          })
          .join('');

  const specialBlock = (m.specialNotes || '').trim()
    ? `<div class="notes-extra"><b>특이사항</b><br/>${escapeHtml(m.specialNotes).replace(/\n/g, '<br/>')}</div>`
    : '';

  const plNote =
    estimateFrom != null
      ? `본 손익계산서는 ${payload.year}년 1~${bm}월 재무자료를 기준으로 작성하였으며, ${estimateFrom}~12월 수치는 내부 추정치 및 경영계획을 기반으로 산출하였습니다.`
      : `본 손익계산서는 ${payload.year}년 1~${bm}월 재무자료를 기준으로 작성하였습니다.`;
  const refNote =
    '본 자료는 경영 판단을 위한 참고 목적이며, 최종 손익은 재무제표 확정 시 조정될 수 있습니다.';

  const kpiTableHtml = `<table>
        <tr class="kpi-emph"><td class="lab">${escapeHtml(spacedLabel('당기순이익'))}</td><td class="val">${formatWon(computed.kpi.netIncome)}</td></tr>
        <tr class="kpi-emph"><td class="lab">${escapeHtml(spacedLabel('영업이익률'))}</td><td class="val">${formatPctHeader(computed.kpi.operatingMargin)}</td></tr>
        <tr class="kpi-emph"><td class="lab">${escapeHtml(spacedLabel('목표영업이익률'))}</td><td class="val red">${formatPctHeader(computed.kpi.targetOperatingMargin)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('재고조정'))}</td><td class="val">${formatWon(m.inventoryAdj)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('매출조정'))}</td><td class="val">${formatWon(m.salesAdj)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('매입조정'))}</td><td class="val">${formatWon(m.purchaseAdj)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('추가인건비'))}</td><td class="val">${formatWon(m.extraCost)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('기타비용'))}</td><td class="val">${formatWon(m.otherCost)}</td></tr>
        <tr class="kpi-emph"><td class="lab">${escapeHtml(spacedLabel('차이조정'))}</td><td class="val">${formatWon(computed.kpi.totalAdj)}</td></tr>
        <tr class="kpi-emph"><td class="lab">${escapeHtml(spacedLabel('조정후 이익'))}</td><td class="val">${formatWon(computed.kpi.adjustedProfit)}</td></tr>
      </table>`;

  const payTableHtml = `<table>
        <tr><td class="lab2" colspan="3">${escapeHtml(spacedLabel(ownerName))}</td></tr>
        <tr>
          <td class="lab">${escapeHtml(spacedLabel('연간급여'))}</td>
          <td class="val">${formatWon(m.ownerSalaryAnnual)}</td>
          <td class="tag">12월까지</td>
        </tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('추가상여'))}</td><td class="val" colspan="2">${formatWon(m.ownerExtraBonus)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('소득공제'))}</td><td class="val" colspan="2">${formatWon(bases.ownerDeduction)}</td></tr>
        <tr>
          <td class="lab">${escapeHtml(spacedLabel('과세표준(세율)'))}</td>
          <td class="val" colspan="2">${formatWon(bases.ownerTaxBase)}${bases.ownerRate ? `<span class="rate">(${escapeHtml(bases.ownerRate)})</span>` : ''}</td>
        </tr>
        <tr><td class="lab2" colspan="3">${escapeHtml(spacedLabel(execName))}</td></tr>
        <tr>
          <td class="lab">${escapeHtml(spacedLabel('연간급여'))}</td>
          <td class="val">${formatWon(m.execSalaryAnnual)}</td>
          <td class="tag">12월까지</td>
        </tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('추가상여'))}</td><td class="val" colspan="2">${formatWon(m.execExtraBonus)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('소득공제'))}</td><td class="val" colspan="2">${formatWon(bases.execDeduction)}</td></tr>
        <tr>
          <td class="lab">${escapeHtml(spacedLabel('과세표준(세율)'))}</td>
          <td class="val" colspan="2">${formatWon(bases.execTaxBase)}${bases.execRate ? `<span class="rate">(${escapeHtml(bases.execRate)})</span>` : ''}</td>
        </tr>
      </table>`;

  const isPersonal = m.entityType === '개인';
  const topBoxesHtml = isPersonal
    ? `<div class="top-slot"></div>
    <div class="box kpi-box">${kpiTableHtml}</div>`
    : `<div class="box mid kpi-box">${kpiTableHtml}</div>
    <div class="box pay">${payTableHtml}</div>`;

  const headerHtml = `<div class="accent"></div>
  <div class="top">
    <div class="brand">
        <h1><span class="yr">${escapeHtml(String(payload.year))}</span><span class="ttl">손익분석 보고서</span></h1>
      <div class="sub">Annual Profit &amp; Loss Overview</div>
      <div class="meta">
        <div><b>회사명 :</b> ${escapeHtml(payload.companyName || '')}</div>
        <div><b>작성자 :</b> 세무법인청년들 부산지점</div>
        <div><b>작성일 :</b> ${written}</div>
      </div>
    </div>
    ${topBoxesHtml}
  </div>
  <div class="unit">(단위 : 원)</div>`;

  const theadHtml = `<thead>
      <tr>
        <th class="k k-subj" rowspan="2">${escapeHtml(spacedLabel('과목'))}</th>
        <th class="k" colspan="2">${escapeHtml(priorLabel)}</th>
        <th class="k" colspan="3">${escapeHtml(currentLabel)}</th>
        <th class="k" colspan="3">${escapeHtml(annLabel)}</th>
      </tr>
      <tr>
        <th class="k sub col-amt">${escapeHtml(spacedLabel('금액'))}</th>
        <th class="k sub col-prior-end">비율(%)</th>
        <th class="k sub col-amt">${escapeHtml(spacedLabel('금액'))}</th>
        <th class="k sub col-amt">비율(%)</th>
        <th class="k sub col-ib">${escapeHtml(spacedLabel('입력기준'))}</th>
        <th class="k sub col-amt">${escapeHtml(spacedLabel('금액'))}</th>
        <th class="k sub col-amt">비율(%)</th>
        <th class="k sub">${escapeHtml(spacedLabel('환산기준'))}</th>
      </tr>
    </thead>`;

  const sincereRows =
    m.entityType === '개인'
      ? `<tr><td class="lab">개인/법인</td><td class="c">${escapeHtml(m.entityType)}</td></tr>
          <tr><td class="lab">개인성실판정</td><td class="c">${computed.personalSincereFlag}</td></tr>
          <tr><td class="lab">성실기준금액</td><td class="c">${escapeHtml(m.sincereThresholdLabel || '')}</td></tr>`
      : `<tr><td class="lab">개인/법인</td><td class="c">${escapeHtml(m.entityType)}</td></tr>
          <tr><td class="lab">법인성실여부</td><td class="c">${escapeHtml(m.corpSincere)}</td></tr>`;

  const priorYearRows = `<tr><td class="lab">${escapeHtml(spacedLabel('추가경비'))}</td><td class="num">${dashWon(m.extraExpense)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('추가인건비'))}</td><td class="num">${dashWon(m.extraLabor)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('추가직원상여'))}</td><td class="num">${dashWon(m.extraBonus)}</td></tr>`;

  const footerHtml = `<div class="foot">
    <div class="foot-col">
      <h4 class="navy">${escapeHtml(spacedLabel('세액계산'))}</h4>
      <table class="taxbox">
        <colgroup><col class="c1"/><col class="c2"/></colgroup>
        <tr><td class="lab">${escapeHtml(spacedLabel('당기순이익'))}</td><td class="num">${formatWon(tax.netIncome)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('익금산입'))}</td><td class="num">${formatWon(tax.incomeInclusion)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('손금산입'))}</td><td class="num">${formatWon(tax.expenseInclusion)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('기부금한도초과'))}</td><td class="num">${formatWon(tax.donationExcess)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('과세표준'))}</td><td class="num">${formatWon(tax.taxBase)}</td></tr>
        <tr><td class="lab">산출세액 (<span class="rate">${escapeHtml(tax.rateLabel)}</span>)</td><td class="num">${formatWon(tax.calculatedTax)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('세액감면'))}</td><td class="num">${formatWon(tax.taxReduction)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('세액공제'))}</td><td class="num">${formatWon(tax.taxCredit)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('최저한세'))}</td><td class="num">${formatWon(tax.minTax)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('결정세액'))}</td><td class="num">${formatWon(tax.determinedTax)}</td></tr>
        <tr><td class="lab">${escapeHtml(spacedLabel('중간예납'))}</td><td class="num">${formatWon(tax.interimPayment)}</td></tr>
        <tr class="hl"><td class="lab">${escapeHtml(spacedLabel('차가감납부세액'))}</td><td class="num red">${formatWon(tax.payable)}</td></tr>
      </table>
    </div>
    <div class="foot-col mid-stack">
      <div>
        <h4 class="navy">${escapeHtml(spacedLabel('성실판정'))}</h4>
        <table class="sincere">
          <colgroup><col class="c1"/><col class="c2"/></colgroup>
          ${sincereRows}
        </table>
      </div>
      <div>
        <h4 class="navy">${escapeHtml(spacedLabel('전년도'))}</h4>
        <table class="sincere prior-year">
          <colgroup><col class="c1"/><col class="c2"/></colgroup>
          ${priorYearRows}
        </table>
      </div>
      <div>
        <h4 class="navy">${escapeHtml(spacedLabel('가정치'))}</h4>
        <table class="assume">
          <colgroup>
            <col style="width:34%"/><col style="width:28%"/><col style="width:38%"/>
          </colgroup>
          <tr>
            <td class="lab c">과목</td>
            <td class="lab c">${escapeHtml(assumptionPeriodLabel)}</td>
            <td class="lab c">산정근거</td>
          </tr>
          ${assumptionRows}
        </table>
      </div>
    </div>
    <div class="foot-col aside">
      <div class="notes">
        <p><span class="mark">⊙</span> ${escapeHtml(plNote)}</p>
        <p><span class="mark">⊙</span> ${escapeHtml(refNote)}</p>
        ${specialBlock}
      </div>
      ${
        logo
          ? `<div class="aside-logo"><img class="logo" src="${logo}" alt="세무법인청년들"/></div>`
          : ''
      }
    </div>
  </div>
  <div class="doc-end"></div>`;

  const pageChunks = splitRowsForPages(rows);
  const totalPages = pageChunks.length;

  const pagesHtml = pageChunks
    .map((chunk, idx) => {
      const pageNo = idx + 1;
      const isLast = pageNo === totalPages;
      const tbody = chunk.map(renderPlRow).join('');
      return `<div class="page" id="ic-report-page-${pageNo}">
  ${headerHtml}
  <table class="pl${isLast ? ' pl-last' : ''}">
    <colgroup>
      <col style="width:15%"/>
      <col style="width:16%"/><col style="width:7%"/>
      <col style="width:16%"/><col style="width:7%"/><col style="width:8%"/>
      <col style="width:16%"/><col style="width:7%"/><col style="width:8%"/>
    </colgroup>
    ${theadHtml}
    <tbody>${tbody}</tbody>
  </table>
  ${isLast ? footerHtml : ''}
  <div class="page-no">- ${pageNo} / ${totalPages} -</div>
</div>`;
    })
    .join('\n');

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo",sans-serif;background:#fff;color:#000;font-size:9px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{position:relative;width:210mm;min-height:297mm;padding:6mm 6.5mm 11mm;background:#fff;page-break-after:always}
  .accent{height:3px;background:#001f60;margin-bottom:6px}
  /* 본표 3구간(과목+전기 | 당기 | 환산 = 38|31|31)과 동일 열선 — 좌:제목 / 중:당기칸 / 우:환산칸 */
  .top{display:grid;grid-template-columns:38fr 31fr 31fr;gap:0;margin-bottom:6px;align-items:stretch;width:100%}
  .brand{padding:6px 10px 4px 0;display:flex;flex-direction:column;justify-content:center;min-width:0;gap:2px}
  .brand h1{display:flex;align-items:center;gap:0.3em;margin:0;padding:0;font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#001544;font-family:"Malgun Gothic","맑은 고딕",sans-serif;line-height:1}
  .brand h1 .yr{display:inline-block;font-size:20px;font-weight:800;line-height:1;transform:translateY(-0.06em)}
  .brand h1 .ttl{display:inline-block;font-size:20px;font-weight:800;line-height:1.2}
  .brand .sub{font-size:11px;color:#002060;margin-top:4px;font-style:italic;line-height:1.3}
  .brand .meta{margin-top:10px;font-size:12px;line-height:1.75;color:#002060}
  .brand .meta b{font-weight:700}
  /* 화면 입력칸과 유사한 상단 박스 */
  .box{border:0.5px solid #9aa8bc;align-self:stretch;min-width:0;overflow:hidden;background:#fff}
  .box table{width:100%;border-collapse:collapse;height:100%}
  .box td{border:0.35px solid #9aa8bc;padding:3px 4px;vertical-align:middle;font-size:8px;line-height:1.3}
  .box .lab{background:#f2f2f2;color:#001f60;font-weight:600;text-align:center;white-space:nowrap;width:42%}
  .box .val{background:#fff;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:#001f60}
  .box .val.red{color:#ff0000;background:#fff}
  .box .val.green{background:#fff;color:#001f60}
  .box tr.kpi-emph .lab{background:#001f60;color:#fff;font-weight:800}
  .box tr.kpi-emph .val{background:#fff;font-weight:800;color:#001f60}
  .box tr.kpi-emph .val.red{color:#ff0000;background:#fff}
  .box .lab2{background:#001f60;color:#fff;font-weight:700;text-align:center}
  .box.pay{background:#fff}
  .box.pay .lab{background:#f2f2f2;color:#001f60}
  .box.pay .tag{background:#f2f2f2;color:#001f60;text-align:center;font-size:7px;width:18%;white-space:nowrap;font-weight:600}
  .top-slot{min-width:0}
  .rate{color:#ff0000;font-weight:700}
  .hl-assume{background:#fff8d1 !important;background-clip:padding-box !important}
  .unit{text-align:right;font-size:8px;color:#333;margin:4px 0 6px}
  /* separate: 셀 배경이 외곽/구분선을 덮지 않도록 — 테두리를 배경 위에 유지 */
  .pl{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;border:1.2px solid #001f60;outline:1.2px solid #001f60;outline-offset:-1.2px;background:#fff}
  .pl.pl-last{border-bottom:none}
  .pl colgroup col{min-width:0}
  .pl th,.pl td{padding:3px 2px;font-size:8px;line-height:1.35;height:16px;border:none;overflow:hidden;background-clip:padding-box}
  .pl th{color:#fff;font-weight:700;text-align:center;vertical-align:middle;background:#001f60;padding:4px 2px;font-size:8px}
  .pl th.k{background:#001f60;color:#fff}
  .pl th.k-subj{width:15%}
  .pl th.sub{background:#001f60;color:#fff;font-size:7.5px;font-weight:600;white-space:nowrap}
  .pl tbody td{border:none;background-clip:padding-box}
  .pl tbody tr.sec td{background:#d6e6f5;background-clip:padding-box;font-weight:800;color:#001f60;border-top:0.45px solid #9aa8bc;border-bottom:0.45px solid #9aa8bc}
  /* 구분선: 과목|전기|당기|환산 + 금액|비율 동일 회색 */
  .pl .subj{text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:3px;border-right:0.5px solid #9aa8bc !important}
  .pl th.k:first-child{border-right:0.5px solid #9aa8bc !important}
  .pl .col-amt{border-right:0.5px solid #9aa8bc !important}
  .pl th.col-amt{border-right:0.5px solid #9aa8bc !important}
  .pl .col-prior-end{border-right:0.5px solid #9aa8bc !important}
  .pl th.col-prior-end{border-right:0.5px solid #9aa8bc !important}
  .pl .col-ib{border-right:0.5px solid #9aa8bc !important}
  .pl th.col-ib{border-right:0.5px solid #9aa8bc !important}
  .pl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .pl .pct{text-align:center;color:#222;white-space:nowrap;font-size:7.5px}
  .pl .basis{text-align:center;font-size:7.5px;white-space:nowrap;color:#222}
  .pl tr.sub td.subj{padding-left:10px;color:#222}
  .pl td.hl-assume{border-top:none;border-bottom:none}
  /* 하단: 본표 3구간 비율 유지 + 열 사이 여백 */
  .foot{display:grid;grid-template-columns:38fr 31fr 31fr;gap:0 10px;align-items:stretch;margin-top:14px;border:none}
  .foot-col{min-width:0;padding:0;border:none}
  .foot-col.mid-stack{padding:0 6px;box-sizing:border-box}
  .foot-col.aside{padding-left:0}
  .foot-col:first-child{padding-right:0}
  .foot h4{color:#fff;text-align:center;padding:3px 0;margin:0;font-size:9px;font-weight:800;letter-spacing:0.06em;background:#001f60}
  .foot h4.navy{background:#001f60}
  .foot h4.purple{background:#001f60}
  .foot h4.blue{background:#001f60}
  .foot h4.green{background:#001f60}
  .foot table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0}
  .foot td{border:0.35px solid #9aa8bc;padding:2px 3px;font-size:8px;line-height:1.3;background:#fff}
  .foot .lab{background:#f2f2f2;text-align:center}
  .foot .num{text-align:right;font-variant-numeric:tabular-nums;background:#fff}
  .foot .num.red{color:#ff0000;font-weight:800}
  .foot .rate{color:#ff0000;font-weight:700}
  .foot .c{text-align:center}
  .foot .note{text-align:left;font-size:7px}
  .foot .empty{text-align:center;color:#999;padding:6px}
  .foot .hl td{font-weight:800;background:#e8f1fa;color:#001f60}
  .foot .nowrap{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .foot .taxbox td{padding:4.5px 4px;border:0.35px solid #9aa8bc;line-height:1.5;min-height:15px}
  .foot .taxbox col.c1,.foot .sincere col.c1{width:52%}
  .foot .taxbox col.c2,.foot .sincere col.c2{width:48%}
  .foot .assume{table-layout:fixed}
  .foot .assume td,.foot .sincere td,.foot .prior-year td{border:0.35px solid #9aa8bc !important}
  .mid-stack{display:flex;flex-direction:column;gap:10px}
  .mid-stack > div{min-width:0}
  .aside{padding:2px 2px 0 4px;display:flex;flex-direction:column;justify-content:space-between;min-height:100%;background:#fff}
  .aside .notes{font-size:8px;color:#002060}
  .aside .notes p{margin:0 0 7px;line-height:1.75}
  .aside .notes p:last-child{margin-bottom:0}
  .aside .notes .mark{font-weight:800;margin-right:2px}
  .aside .notes-extra{margin-top:8px;line-height:1.6}
  .aside-logo{display:flex;justify-content:flex-end;align-items:flex-end;margin-top:auto;padding-top:10px}
  .aside-logo .logo{height:56px;width:auto;max-width:100%;object-fit:contain}
  .doc-end{margin-top:14px;height:3px;background:#001f60;width:100%}
  .page-no{position:absolute;bottom:3.5mm;left:0;right:0;text-align:center;font-size:8px;color:#444}
</style></head><body>
${pagesHtml}
</body></html>`;
}

async function captureElementToCanvas(el: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas-pro')).default;
  return html2canvas(el, {
    scale: 2.5,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: Math.ceil(el.scrollWidth),
    windowHeight: Math.ceil(el.scrollHeight),
  });
}

async function htmlToPdfBlob(html: string): Promise<Blob> {
  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();

  await new Promise<void>(resolve => {
    const done = () => resolve();
    if (doc.fonts?.ready) doc.fonts.ready.then(done).catch(done);
    else setTimeout(done, 80);
  });
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const pages = Array.from(doc.querySelectorAll('.page')) as HTMLElement[];

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i++) {
    const canvas = await captureElementToCanvas(pages[i]!);
    const imgH = (canvas.height / canvas.width) * pageW;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    if (i > 0) pdf.addPage();
    if (imgH <= pageH + 0.3) {
      pdf.addImage(imgData, 'JPEG', 0, 0, pageW, imgH);
    } else {
      const scale = pageH / imgH;
      const drawW = pageW * scale;
      const x = (pageW - drawW) / 2;
      pdf.addImage(imgData, 'JPEG', x, 0, drawW, pageH);
    }
  }

  iframe.remove();
  return pdf.output('blob');
}

/** PDF Blob — 엑셀 인쇄 양식 HTML 기반 */
export async function buildInterimClosingPdfBlob(
  payload: InterimClosingPayload,
  computed: InterimClosingComputed,
  _sheetEl?: HTMLElement | null,
  opts?: InterimClosingPdfOptions,
): Promise<Blob> {
  const logoDataUrl = await fetchLogoDataUrl();
  const html = buildInterimClosingReportHtml(payload, computed, {
    writtenAt: opts?.writtenAt,
    logoDataUrl,
  });
  return htmlToPdfBlob(html);
}

export async function downloadInterimClosingPdf(
  payload: InterimClosingPayload,
  computed: InterimClosingComputed,
  sheetEl?: HTMLElement | null,
  opts?: InterimClosingPdfOptions,
): Promise<void> {
  const blob = await buildInterimClosingPdfBlob(payload, computed, sheetEl, opts);
  await savePdfBlob(blob, '손익분석보고서.pdf');
}

export async function downloadInterimClosingExcel(
  payload: InterimClosingPayload,
  computed: InterimClosingComputed,
): Promise<void> {
  await downloadInterimClosingPdf(payload, computed);
}
