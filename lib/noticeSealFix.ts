import sharp from 'sharp';

/**
 * 해임통보 안내문 PDF 직인 위치 보정 — 내용·글자·PDF 구조는 그대로.
 * 저장 PDF는 쪽마다 무압축 RGB 이미지 1장. 마지막 쪽 이미지에서 (직인) 아래로 밀려 잘린 도장을 지우고
 * 원본 도장을 (직인) 글자 중앙에 다시 찍는다. 픽셀만 같은 자리에서 바꾸므로 파일 길이가 변하지 않는다.
 */

/** 화면 64px × PDF 캡처 배율 2 */
export const SEAL_PX = 128;

type ImageStream = { width: number; height: number; start: number };

export type SealFixResult =
  | { status: 'fixed'; before: Buffer; after: Buffer }
  | { status: 'ok' | 'no-image' | 'no-seal' | 'no-text' };

export async function loadSealRgba(png: Buffer): Promise<Buffer> {
  return sharp(png).ensureAlpha().resize(SEAL_PX, SEAL_PX, { kernel: 'lanczos3' }).raw().toBuffer();
}

/** 마지막 이미지 XObject(무압축 RGB) 위치 */
function lastImageStream(pdf: Buffer): ImageStream | null {
  const text = pdf.toString('latin1');
  const re =
    /<<\s*\/Type \/XObject\s*\/Subtype \/Image\s*\/Width (\d+)\s*\/Height (\d+)\s*\/ColorSpace \/DeviceRGB\s*\/BitsPerComponent 8\s*\/Length (\d+)\s*>>\s*stream\r?\n/g;
  let last: ImageStream | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const width = Number(m[1]);
    const height = Number(m[2]);
    if (Number(m[3]) !== width * height * 3) continue;
    last = { width, height, start: m.index + m[0].length };
  }
  return last;
}

async function crop(pdf: Buffer, img: ImageStream): Promise<Buffer> {
  const rows = Math.min(520, img.height);
  const from = img.start + (img.height - rows) * img.width * 3;
  return sharp(pdf.subarray(from, from + rows * img.width * 3), {
    raw: { width: img.width, height: rows, channels: 3 },
  })
    .png()
    .toBuffer();
}

/** pdf 버퍼를 제자리에서 수정 */
export async function fixNoticeSeal(pdf: Buffer, sealRgba: Buffer): Promise<SealFixResult> {
  const img = lastImageStream(pdf);
  if (!img) return { status: 'no-image' };
  const { width: w, height: h, start } = img;
  const at = (x: number, y: number) => start + (y * w + x) * 3;
  const isRed = (o: number) => pdf[o]! > 150 && pdf[o]! - pdf[o + 1]! > 60 && pdf[o]! - pdf[o + 2]! > 60;

  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  for (let y = Math.max(0, h - 420); y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isRed(at(x, y))) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return { status: 'no-seal' };

  /** (직인) 검정 글자 — 남색 사무소명(#1f3864)은 파랑이 강해 제외 */
  let tx0 = w;
  let tx1 = -1;
  let ty0 = h;
  let ty1 = -1;
  const sx0 = Math.max(0, x0 - 80);
  const sx1 = Math.min(w - 1, x1 + 80);
  for (let y = Math.max(0, y0 - 140); y < y0 - 1; y++) {
    for (let x = sx0; x <= sx1; x++) {
      const o = at(x, y);
      const r = pdf[o]!;
      const g = pdf[o + 1]!;
      const b = pdf[o + 2]!;
      if (Math.max(r, g, b) >= 110 || b - r >= 40) continue;
      tx0 = Math.min(tx0, x);
      tx1 = Math.max(tx1, x);
      ty0 = Math.min(ty0, y);
      ty1 = Math.max(ty1, y);
    }
  }
  /** 도장이 이미 글자를 덮고 있으면 위쪽에 글자가 안 잡힘 — 정상 출력본 */
  if (tx1 < 0) return y1 < h - 2 ? { status: 'ok' } : { status: 'no-text' };
  if (Math.abs((y0 + y1) / 2 - (ty0 + ty1) / 2) < 20) return { status: 'ok' };

  const before = await crop(pdf, img);
  for (let y = Math.max(0, y0 - 2); y < h; y++) {
    for (let x = Math.max(0, x0 - 3); x <= Math.min(w - 1, x1 + 3); x++) pdf.fill(255, at(x, y), at(x, y) + 3);
  }
  const cx = Math.round((tx0 + tx1) / 2) - SEAL_PX / 2;
  const cy = Math.round((ty0 + ty1) / 2) - SEAL_PX / 2;
  for (let y = 0; y < SEAL_PX; y++) {
    for (let x = 0; x < SEAL_PX; x++) {
      const px = cx + x;
      const py = cy + y;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const si = (y * SEAL_PX + x) * 4;
      const a = sealRgba[si + 3]! / 255;
      if (a === 0) continue;
      const o = at(px, py);
      for (let c = 0; c < 3; c++) pdf[o + c] = Math.round(sealRgba[si + c]! * a + pdf[o + c]! * (1 - a));
    }
  }
  return { status: 'fixed', before, after: await crop(pdf, img) };
}

/** 세무보수_미수금_안내문_{수신}_v.기장(_수정).pdf → 세무보수_미수금_안내문_{수신}_{2026.10.06}(_수정).pdf */
export function renameNoticeFile(filename: string, sentDate: string): string {
  const m = /^(세무보수_미수금_안내문_.+)_v\.(?:유예|기장)(_수정)?\.pdf$/.exec(filename);
  if (!m || !sentDate) return filename;
  return `${m[1]}_${sentDate.replace(/-/g, '.')}${m[2] ?? ''}.pdf`;
}
