export type FilingFormat = 'json' | 'xml' | 'csv' | 'text';

export interface ParseMeta {
  format: FilingFormat;
  sourceFile: string;
  warnings: string[];
}

export async function readFileAsText(file: File): Promise<string> {
  return file.text();
}

export function detectFormat(filename: string, content: string): FilingFormat {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const trimmed = content.trim();

  if (ext === 'json' || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }
  if (ext === 'xml' || trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
    return 'xml';
  }
  if (ext === 'csv' || (trimmed.includes(',') && trimmed.includes('\n') && !trimmed.includes('<'))) {
    return 'csv';
  }
  return 'text';
}

export function pickField(
  obj: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (key in obj && obj[key] != null && obj[key] !== '') return obj[key];
    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase() === lower && v != null && v !== '') return v;
    }
  }
  return undefined;
}

export function numToStr(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && !Number.isNaN(v)) {
    return Math.trunc(v).toLocaleString('ko-KR');
  }
  const s = String(v).replace(/[^0-9.-]/g, '');
  if (!s) return '';
  const n = parseFloat(s);
  return Number.isNaN(n) ? '' : Math.trunc(n).toLocaleString('ko-KR');
}

export function countToStr(v: unknown): string {
  if (v == null || v === '') return '';
  const s = String(v).replace(/[^0-9]/g, '');
  return s || '';
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const delim = lines[0].includes('\t') ? '\t' : ',';
  const headers = splitCSVLine(lines[0], delim).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i], delim);
    if (cols.every((c) => !c.trim())) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line: string, delim: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && ch === delim) {
      result.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  result.push(cur);
  return result;
}

/** XML 문서에서 태그명→텍스트 맵 (중복 시 배열) */
export function collectXmlTags(doc: Document): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const walk = (el: Element) => {
    const children = Array.from(el.children);
    if (children.length === 0) {
      const text = (el.textContent ?? '').trim();
      if (text) {
        const tag = el.tagName;
        const list = map.get(tag) ?? [];
        list.push(text);
        map.set(tag, list);
      }
      return;
    }
    children.forEach(walk);
  };
  if (doc.documentElement) walk(doc.documentElement);
  return map;
}

export function xmlTagValue(
  tags: Map<string, string[]>,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const exact = tags.get(name);
    if (exact?.[0]) return exact[0];
    for (const [tag, vals] of tags) {
      if (tag.toLowerCase() === name.toLowerCase() && vals[0]) return vals[0];
    }
  }
  return undefined;
}

export function findXmlRowElements(doc: Document, ...rowTags: string[]): Element[] {
  for (const tag of rowTags) {
    const nodes = doc.getElementsByTagName(tag);
    if (nodes.length > 0) return Array.from(nodes);
  }
  return [];
}

export function elementField(el: Element, ...names: string[]): string {
  for (const name of names) {
    const child = el.querySelector(name);
    if (child?.textContent?.trim()) return child.textContent.trim();
    const byTag = Array.from(el.children).find(
      (c) => c.tagName.toLowerCase() === name.toLowerCase(),
    );
    if (byTag?.textContent?.trim()) return byTag.textContent.trim();
  }
  return '';
}

export function incomeTypeFromLabel(label: string): string {
  const map: Record<string, string> = {
    근로소득: 'A01',
    A01: 'A01',
    사업소득: 'A03',
    A03: 'A03',
    기타소득: 'A04',
    A04: 'A04',
    연금소득: 'A05',
    A05: 'A05',
    일용근로소득: 'A06',
    A06: 'A06',
    이자소득: 'A22',
    A22: 'A22',
    배당소득: 'A25',
    A25: 'A25',
    퇴직소득: 'A02',
    A02: 'A02',
  };
  const trimmed = label.trim();
  return map[trimmed] ?? (trimmed.match(/^A\d{2}$/) ? trimmed : 'A03');
}

export function extractKeyValues(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const patterns = [
    /([가-힣A-Za-z_][가-힣A-Za-z0-9_]*)\s*[:=]\s*([0-9,.\-]+)/g,
    /"([^"]+)"\s*:\s*([0-9,.\-]+)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      result[m[1].trim()] = m[2].trim();
    }
  }
  return result;
}

let _filingUid = 0;
export function filingUid() {
  return `f-${++_filingUid}`;
}
