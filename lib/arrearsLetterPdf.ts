/** 미수 공문 DOM → PDF/PNG (화면 인쇄와 동일 레이아웃, 브라우저 헤더 없음) */

const CAPTURE_WIDTH_PX = 720;
/** PDF는 선명도용 2배, 이미지는 화면 크기와 비슷하게 1배 */
const CAPTURE_SCALE_PDF = 2;
const CAPTURE_SCALE_PNG = 1;
const CAPTURE_FONT = '"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo"';

/**
 * html2canvas는 숫자·영문을 한글보다 아래로 그림.
 * position 이동은 표 레이아웃을 깨뜨리므로 vertical-align 만 사용.
 */
function liftLatinBaseline(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const textNode of nodes) {
    const value = textNode.nodeValue;
    if (!value || !/[0-9A-Za-z]/.test(value)) continue;

    const parent = textNode.parentElement;
    if (!parent) continue;
    if (parent.dataset.latinLift === '1') continue;
    if (parent.closest('script, style, svg, img, canvas')) continue;

    const frag = document.createDocumentFragment();
    const re = /([0-9A-Za-z][0-9A-Za-z.,\-]*)|([^0-9A-Za-z]+)/g;
    let m: RegExpExecArray | null;
    let changed = false;
    while ((m = re.exec(value))) {
      if (m[1]) {
        const span = document.createElement('span');
        span.dataset.latinLift = '1';
        span.style.cssText =
          'vertical-align:0.15em;font-family:inherit;letter-spacing:normal;';
        span.textContent = m[1];
        frag.appendChild(span);
        changed = true;
      } else if (m[2]) {
        frag.appendChild(document.createTextNode(m[2]));
      }
    }
    if (changed) textNode.parentNode?.replaceChild(frag, textNode);
  }
}

async function prepareLetterClone(
  el: HTMLElement,
  opts?: { liftLatin?: boolean },
): Promise<{ host: HTMLElement; clone: HTMLElement }> {
  /** data-capture-font 가 있으면 그 글꼴 유지 (내용증명은 바탕체) */
  const font = el.dataset.captureFont || CAPTURE_FONT;
  const host = document.createElement('div');
  host.setAttribute('data-arrears-capture', '1');
  host.style.cssText = `position:fixed;left:-14000px;top:0;width:${CAPTURE_WIDTH_PX}px;background:#fff;z-index:-1;overflow:visible;`;

  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.cssText = [
    `width:${CAPTURE_WIDTH_PX}px`,
    `max-width:${CAPTURE_WIDTH_PX}px`,
    'min-width:' + CAPTURE_WIDTH_PX + 'px',
    'margin:0',
    'padding:40px 36px',
    'border:none',
    'box-shadow:none',
    'border-radius:0',
    'background:#ffffff',
    'color:#111111',
    'box-sizing:border-box',
    `font-family:${font}`,
  ].join(';');

  clone.querySelectorAll<HTMLElement>('*').forEach(node => {
    node.style.fontFamily = font;
  });

  clone.querySelectorAll<HTMLElement>('.arrears-letter-table').forEach(table => {
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    table.style.tableLayout = 'fixed';
  });
  clone.querySelectorAll<HTMLElement>('.arrears-letter-table th, .arrears-letter-table td').forEach(cell => {
    cell.style.border = '1px solid #222222';
    cell.style.verticalAlign = 'middle';
    cell.style.fontFamily = font;
  });
  clone.querySelectorAll<HTMLElement>('h2').forEach(h => {
    h.style.textAlign = 'center';
  });

  clone.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('/')) {
      img.setAttribute('src', `${window.location.origin}${src}`);
    }
    const isFooter = src.includes('footer') || img.closest('.arrears-letter-footer');
    const isHeader = src.includes('header') || img.closest('.arrears-letter-brand');
    const hPx = isFooter ? 40 : isHeader ? 48 : 48;
    img.style.cssText = [
      `height:${hPx}px`,
      'width:auto',
      'max-width:280px',
      'max-height:' + hPx + 'px',
      'object-fit:contain',
      'display:block',
      'flex-shrink:0',
    ].join(';');
    img.removeAttribute('width');
    img.removeAttribute('height');
  });

  const footer = clone.querySelector('.arrears-letter-footer') as HTMLElement | null;
  if (footer) {
    footer.style.cssText = [
      'display:flex',
      'flex-direction:row',
      'align-items:flex-end',
      'gap:12px',
      'margin-top:48px',
      'width:100%',
      'max-width:100%',
    ].join(';');
    const addr = footer.querySelector('div') as HTMLElement | null;
    if (addr) {
      addr.style.cssText =
        'min-width:0;flex:1;font-size:11px;line-height:1.35;color:#4b5563;white-space:normal;';
    }
  }

  const brand = clone.querySelector('.arrears-letter-brand') as HTMLElement | null;
  if (brand) {
    brand.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;';
  }

  clone.querySelectorAll('.overflow-x-auto').forEach(node => {
    (node as HTMLElement).style.overflow = 'visible';
  });

  host.appendChild(clone);
  document.body.appendChild(host);

  await Promise.all(
    Array.from(clone.querySelectorAll('img')).map(
      img =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>(resolve => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
    ),
  );
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
      await document.fonts.load(`12px ${font}`);
      await document.fonts.load(`bold 12px ${font}`);
    } catch {
      /* ignore */
    }
  }
  await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  if (opts?.liftLatin) {
    liftLatinBaseline(clone);
    await new Promise<void>(r => requestAnimationFrame(() => r()));
  }

  return { host, clone };
}

/** 다음 쪽에 반복할 표 머리글 위치 (px) */
type TableBand = { headTop: number; headBottom: number; bodyBottom: number };

type PageLayout = { breakYs: number[]; tables: TableBand[]; padTop: number };

/** 끊을 수 있는 위치(행 아래·문단 경계)와 표 머리글 위치 — CSS px */
function collectPageLayout(clone: HTMLElement): PageLayout {
  const rootTop = clone.getBoundingClientRect().top;
  const ys = new Set<number>([0]);
  const rel = (v: number) => Math.max(0, Math.round(v - rootTop));
  const addEdges = (el: Element | null | undefined, top = false) => {
    if (!el) return;
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.height <= 0) return;
    ys.add(rel(r.bottom));
    if (top) ys.add(rel(r.top));
  };

  clone.querySelectorAll('table thead tr, table tbody tr').forEach(tr => addEdges(tr));
  Array.from(clone.children).forEach(child => {
    if (child.tagName === 'STYLE') return;
    addEdges(child, true);
  });
  addEdges(clone.querySelector('.arrears-letter-footer'), true);
  ys.add(Math.round(clone.getBoundingClientRect().height));

  const tables: TableBand[] = [];
  clone.querySelectorAll('table').forEach(table => {
    const head = table.querySelector('thead');
    if (!head) return;
    const h = head.getBoundingClientRect();
    const t = table.getBoundingClientRect();
    if (h.height <= 0) return;
    tables.push({ headTop: rel(h.top), headBottom: rel(h.bottom), bodyBottom: rel(t.bottom) });
  });

  const padTop = parseFloat(getComputedStyle(clone).paddingTop) || 0;
  return {
    breakYs: [...ys].filter(y => Number.isFinite(y)).sort((a, b) => a - b),
    tables,
    padTop,
  };
}

function snapSliceEnd(breakYs: number[], startY: number, maxEndY: number, totalH: number): number {
  let best = -1;
  for (const y of breakYs) {
    if (y <= startY + 2) continue;
    if (y <= maxEndY) best = y;
    else break;
  }
  if (best > startY) return Math.min(best, totalH);
  const next = breakYs.find(y => y > startY + 2);
  return next != null ? Math.min(next, totalH) : Math.min(maxEndY, totalH);
}

function isMostlyBlankCanvas(canvas: HTMLCanvasElement): boolean {
  if (canvas.width < 2 || canvas.height < 2) return true;
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const step = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 40));
  let nonWhite = 0;
  let samples = 0;
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      samples += 1;
      if (d[0] < 250 || d[1] < 250 || d[2] < 250 || d[3] < 250) nonWhite += 1;
    }
  }
  return samples > 0 && nonWhite / samples < 0.002;
}

async function captureLetterCanvas(
  el: HTMLElement,
  opts: { scale: number; liftLatin: boolean },
): Promise<{
  canvas: HTMLCanvasElement;
  layout: PageLayout;
  cleanup: () => void;
}> {
  const { host, clone } = await prepareLetterClone(el, { liftLatin: opts.liftLatin });
  const html2canvas = (await import('html2canvas-pro')).default;
  try {
    const layoutCss = collectPageLayout(clone);
    const canvas = await html2canvas(clone, {
      scale: opts.scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: CAPTURE_WIDTH_PX,
      windowWidth: CAPTURE_WIDTH_PX,
      scrollX: 0,
      scrollY: 0,
      foreignObjectRendering: false,
    });

    if (isMostlyBlankCanvas(canvas)) {
      throw new Error('공문 캡처가 비어 있습니다. 다시 시도해 주세요.');
    }

    const scaleX = canvas.width / Math.max(1, clone.offsetWidth);
    const px = (y: number) => Math.round(y * scaleX);
    const breakYs = layoutCss.breakYs.map(px);
    if (!breakYs.includes(canvas.height)) breakYs.push(canvas.height);
    breakYs.sort((a, b) => a - b);

    return {
      canvas,
      layout: {
        breakYs,
        tables: layoutCss.tables.map(t => ({
          headTop: px(t.headTop),
          headBottom: px(t.headBottom),
          bodyBottom: px(t.bodyBottom),
        })),
        padTop: px(layoutCss.padTop),
      },
      cleanup: () => host.remove(),
    };
  } catch (e) {
    host.remove();
    throw e;
  }
}

/** firstPage(1-based)부터 totalPages 장에 「i / n」 */
function addPdfPageNumbers(pdf: import('jspdf').jsPDF, totalPages: number, firstPage = 1): void {
  if (totalPages <= 1) return;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(firstPage + i - 1);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(85, 85, 85);
    pdf.text(`${i} / ${totalPages}`, pageW / 2, pageH - 7, { align: 'center' });
  }
}

/** 캡처 한 장을 A4에 행 경계로 나눠 붙임. 반환 = 붙인 페이지 수 */
function appendCanvasPages(
  pdf: import('jspdf').jsPDF,
  canvas: HTMLCanvasElement,
  layout: PageLayout,
  startOnNewPage: boolean,
): number {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginX = 10;
  const marginTop = 10;
  const footerH = 12;
  const usableW = pageW - marginX * 2;
  const usableH = pageH - marginTop - footerH;
  const imgH = (canvas.height / canvas.width) * usableW;

  if (imgH <= usableH + 0.5) {
    if (startOnNewPage) pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', marginX, marginTop, usableW, imgH);
    return 1;
  }

  const { breakYs, tables, padTop } = layout;
  const pageMaxPx = Math.floor(usableH * (canvas.width / usableW));
  /** 표 테두리 두께(캡처 배율 반영) — 이어지는 쪽 첫 행 윗선이 빠지지 않게 겹쳐 자름 */
  const border = Math.max(2, Math.round(canvas.width / CAPTURE_WIDTH_PX));
  let srcY = 0;
  let pageIdx = 0;
  while (srcY < canvas.height - 2) {
    const cont = pageIdx > 0;
    const band = cont ? tables.find(t => srcY > t.headBottom + 2 && srcY < t.bodyBottom - 2) : undefined;
    const topPad = cont ? padTop : 0;
    const headFrom = band ? Math.max(0, band.headTop - border) : 0;
    const headH = band ? band.headBottom - headFrom : 0;
    const room = pageMaxPx - topPad - headH - border * 2;
    const rawEnd = Math.min(srcY + room, canvas.height);
    let endY =
      rawEnd >= canvas.height - 2 ? canvas.height : snapSliceEnd(breakYs, srcY, rawEnd, canvas.height);
    if (endY - srcY > room) endY = rawEnd;
    const from = band ? Math.max(0, srcY - border) : srcY;
    const to = endY < canvas.height ? Math.min(canvas.height, endY + border) : endY;
    const bodyH = Math.max(1, to - from);

    const page = document.createElement('canvas');
    page.width = canvas.width;
    page.height = topPad + headH + bodyH;
    const ctx = page.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, page.width, page.height);
      if (headH > 0) ctx.drawImage(canvas, 0, headFrom, canvas.width, headH, 0, topPad, canvas.width, headH);
      ctx.drawImage(canvas, 0, from, canvas.width, bodyH, 0, topPad + headH, canvas.width, bodyH);
    }
    if (pageIdx > 0 || startOnNewPage) pdf.addPage();
    pdf.addImage(page.toDataURL('image/png'), 'PNG', marginX, marginTop, usableW, (page.height / page.width) * usableW);
    srcY = endY;
    pageIdx += 1;
    if (pageIdx > 80) break;
  }
  return pageIdx || 1;
}

/** A4 PDF — 행 경계로만 분할, 숫자·영문 높낮이 보정 */
export async function buildArrearsLetterPdfBlob(el: HTMLElement): Promise<Blob> {
  return buildMultiPagePdfBlob([el]);
}

/**
 * 여러 문서(예: 내용증명 1쪽 + 미수 수수료 안내)를 한 PDF로.
 * 각 문서는 새 페이지에서 시작하고, 쪽번호는 문서별로 매김(2쪽 이상일 때만).
 */
export async function buildMultiPagePdfBlob(els: HTMLElement[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let total = 0;
  for (const el of els) {
    const { canvas, layout, cleanup } = await captureLetterCanvas(el, {
      scale: CAPTURE_SCALE_PDF,
      liftLatin: true,
    });
    try {
      const pages = appendCanvasPages(pdf, canvas, layout, total > 0);
      addPdfPageNumbers(pdf, pages, total + 1);
      total += pages;
    } finally {
      cleanup();
    }
  }
  return pdf.output('blob');
}

/** 전체 공문 한 장 PNG — 화면과 비슷한 글자 크기(배율 1) */
export async function buildArrearsLetterPngBlob(el: HTMLElement): Promise<Blob> {
  const { canvas, cleanup } = await captureLetterCanvas(el, {
    scale: CAPTURE_SCALE_PNG,
    liftLatin: true,
  });
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('PNG 생성 실패'))), 'image/png');
    });
    return blob;
  } finally {
    cleanup();
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
