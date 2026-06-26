'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { portalEmptyState, portalInput } from '@/app/components/portal/uiClasses';
import type { YouthIdCategory, YouthIdEntry } from '@/lib/youthIds';

type Props = {
  categories: YouthIdCategory[];
  me: string;
  configured: boolean;
};

// 왼쪽(우선순위) 열에 이 순서대로
const PRIORITY_IDS = [
  'comm',
  'hometax',
  'semusarang',
  'tp',
  'wemembers',
  'google',
  'naverworks',
  'platform',
  'bluehole',
  'wacampus',
];

// 표 열 정렬 우선순위(없으면 등장 순서대로 뒤에)
const COL_ORDER = [
  '내선',
  '전화',
  'ID',
  'PW',
  '카톡ID',
  '카톡PW',
  '대표번호',
  '은행',
  '계좌',
  '예금주',
  '사업자',
  '카드',
  'CVC/유효',
  '비번',
  '이메일',
];

function columnsOf(cat: YouthIdCategory): string[] {
  const seen: string[] = [];
  for (const e of cat.entries) {
    for (const f of e.fields) {
      if (!seen.includes(f.label)) seen.push(f.label);
    }
  }
  const rank = (l: string) => {
    const i = COL_ORDER.indexOf(l);
    return i === -1 ? 100 + seen.indexOf(l) : i;
  };
  return seen.slice().sort((a, b) => rank(a) - rank(b));
}

function entryMatches(e: YouthIdEntry, q: string): boolean {
  if (e.title.toLowerCase().includes(q)) return true;
  if (e.note?.toLowerCase().includes(q)) return true;
  if (e.owner?.toLowerCase().includes(q)) return true;
  return e.fields.some(f => f.label.toLowerCase().includes(q) || f.value.toLowerCase().includes(q));
}

export default function YouthIdsBoard({ categories, me, configured }: Props) {
  const [query, setQuery] = useState('');
  const [viewAll, setViewAll] = useState(false);

  const q = query.trim().toLowerCase();

  const sections = useMemo(() => {
    return categories
      .map(cat => {
        const scoped = viewAll ? cat.entries : cat.entries.filter(e => !e.owner || e.owner === me);
        const entries = q ? scoped.filter(e => entryMatches(e, q)) : scoped;
        return { ...cat, entries };
      })
      .filter(cat => cat.entries.length > 0);
  }, [categories, viewAll, me, q]);

  // 왼쪽 = 우선순위(블루홀까지), 오른쪽 = 나머지 — 전체보기와 무관하게 고정 분할
  const { left, right } = useMemo(() => {
    const l = PRIORITY_IDS.map(id => sections.find(c => c.id === id)).filter(
      (c): c is (typeof sections)[number] => Boolean(c),
    );
    const r = sections.filter(c => !PRIORITY_IDS.includes(c.id));
    return { left: l, right: r };
  }, [sections]);

  if (!configured) {
    return (
      <div className={portalEmptyState}>
        아직 자료가 등록되지 않았습니다.
        <br />
        <span className="text-slate-500">
          관리자: Vercel 환경변수 <code className="font-mono">YOUTH_IDS_JSON</code> 에 데이터를 넣어주세요.
        </span>
      </div>
    );
  }

  const total = sections.reduce((n, c) => n + c.entries.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="항목·ID·메모 검색…"
          className={`${portalInput} !py-1.5 w-full sm:w-64`}
        />
        <button
          type="button"
          onClick={() => setViewAll(v => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
            viewAll
              ? 'border-blue-400 bg-blue-50 text-blue-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {viewAll ? '전체보기 ✓' : '전체보기'}
        </button>
        <span className="ml-auto text-xs text-slate-500">
          {viewAll ? (
            <>전 직원 계정·자료 모두 표시 · {total}건</>
          ) : (
            <>
              <b className="text-slate-700">{me}</b>님 + 공용 · {total}건
            </>
          )}
        </span>
      </div>

      {sections.length === 0 ? (
        <div className={portalEmptyState}>{q ? '검색 결과가 없습니다.' : '표시할 자료가 없습니다.'}</div>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <div className="min-w-0 space-y-3">
            {left.map(cat => (
              <SectionTable key={cat.id} cat={cat} me={me} align />
            ))}
          </div>
          <div className="min-w-0 space-y-3">
            {right.map(cat => (
              <SectionTable key={cat.id} cat={cat} me={me} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 구분 열 고정 폭 → 모든 표에서 그다음 열(시작점)이 동일하게 정렬
const LABEL_W = '9rem';
// 왼쪽(우선순위) 표에서 ID/이메일 열 고정 폭 → 플랫폼 세무사회 ID 위치에 통일
// (드물게 더 긴 이메일은 이 칸 안에서 줄바꿈)
const ID_W = '10rem';

function SectionTable({ cat, me, align = false }: { cat: YouthIdCategory; me: string; align?: boolean }) {
  const cols = columnsOf(cat);
  const idStyle = (c: string): CSSProperties | undefined =>
    align && (c === 'ID' || c === '이메일') ? { width: ID_W, minWidth: ID_W } : undefined;
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
        {cat.icon ? <span aria-hidden>{cat.icon}</span> : null}
        <h3 className="text-[13px] font-bold text-slate-700">{cat.label}</h3>
        <span className="ml-auto text-[10px] font-medium tabular-nums text-slate-400">{cat.entries.length}</span>
      </div>
      {/* 묶음(카드)마다 독립 가로 스크롤 — 구분 열은 좌측 고정 */}
      {/* w-max(내용 폭) → '구분' 열이 모든 카드에서 9rem 고정 → 첫 값 열 시작점 통일 */}
      <div className="overflow-x-auto">
        <table className="w-max text-[12px]">
          <thead>
            <tr className="bg-slate-50/60 text-[10px] uppercase tracking-wide text-slate-400">
              <th
                className="sticky left-0 z-10 whitespace-nowrap bg-slate-50 px-2 py-1 text-left font-semibold"
                style={{ width: LABEL_W, minWidth: LABEL_W }}
              >
                구분
              </th>
              {cols.map(c => (
                <th
                  key={c}
                  style={idStyle(c)}
                  className="whitespace-nowrap px-2 py-1 text-left font-semibold"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cat.entries.map(e => {
              const mine = e.owner === me;
              return (
                <tr key={e.id} className="border-t border-slate-100">
                  <td
                    className="sticky left-0 z-10 break-words bg-white px-2 py-1 align-top"
                    style={{ width: LABEL_W, minWidth: LABEL_W }}
                  >
                    <span className="font-semibold text-slate-800">{e.title}</span>
                    {e.owner ? (
                      <span
                        className={`ml-1 rounded px-1 py-px text-[9px] font-bold ${
                          mine ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {mine ? '나' : e.owner}
                      </span>
                    ) : null}
                  </td>
                  {cols.map(col => {
                    const f = e.fields.find(x => x.label === col);
                    // 값은 항상 한 줄(줄바꿈 없음). idStyle은 최소폭(시작점 정렬)만 담당하고
                    // 내용이 길면 열이 늘어나 한 줄로 표시된다.
                    const s = idStyle(col);
                    return <ValueCell key={col} value={f?.value ?? ''} style={s} />;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ValueCell({ value, style, wrap = false }: { value: string; style?: CSSProperties; wrap?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <td
      style={style}
      className={`cursor-pointer px-2 py-1 font-mono leading-tight transition-colors ${
        wrap ? 'break-all align-top' : 'whitespace-nowrap'
      } ${copied ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
      title={value ? `${value} (클릭 복사)` : ''}
      onClick={copy}
    >
      {value || <span className="text-slate-300">-</span>}
    </td>
  );
}
