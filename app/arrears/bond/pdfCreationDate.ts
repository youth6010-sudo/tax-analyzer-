const CREATION_RE =
  /\/CreationDate\s*\(D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?([+\-Z])?(\d{2})?'?(\d{2})?'?\)/;

/** PDF 문자열 일부에서 CreationDate → Asia/Seoul 기준 YYYY-MM-DD (없으면 '') */
export function parsePdfCreationDate(text: string): string {
  const m = CREATION_RE.exec(text);
  if (!m) return '';
  const [, y, mo, d, h = '00', mi = '00', s = '00', sign, oh = '00', om = '00'] = m;
  let utc = Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +s);
  if (sign === '+' || sign === '-') {
    const off = (+oh * 60 + +om) * 60_000;
    utc += sign === '+' ? -off : off;
  } else if (!sign) {
    // 시간대 표기가 없으면 현지(한국) 시각으로 간주
    utc -= 9 * 3_600_000;
  }
  const kst = new Date(utc + 9 * 3_600_000);
  if (Number.isNaN(kst.getTime())) return '';
  return kst.toISOString().slice(0, 10);
}

/** 파일 앞뒤 일부만 읽어 PDF 작성일 추출 */
export async function readPdfCreationDate(file: Blob): Promise<string> {
  const CHUNK = 256 * 1024;
  const decode = async (b: Blob) => new TextDecoder('latin1').decode(await b.arrayBuffer());
  const head = await decode(file.slice(0, CHUNK));
  const found = parsePdfCreationDate(head);
  if (found || file.size <= CHUNK) return found;
  return parsePdfCreationDate(await decode(file.slice(Math.max(CHUNK, file.size - CHUNK))));
}
