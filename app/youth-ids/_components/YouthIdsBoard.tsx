'use client';

import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { portalEmptyState, portalInput } from '@/app/components/portal/uiClasses';
import type { YouthIdCategory, YouthIdEntry } from '@/lib/youthIds';
import { newYouthIdCategoryId } from '@/lib/youthIds';
import YouthIdEntryModal from './YouthIdEntryModal';

type Props = {
  categories: YouthIdCategory[];
  me: string;
  configured: boolean;
  staffNames: string[];
};

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

export default function YouthIdsBoard({ categories: initial, me, configured, staffNames }: Props) {
  const [categories, setCategories] = useState(initial);
  const [query, setQuery] = useState('');
  const [viewAll, setViewAll] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ catId: string; entry?: YouthIdEntry | null } | null>(null);

  const q = query.trim().toLowerCase();

  const persist = useCallback(async (next: YouthIdCategory[]) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/youth-ids', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setCategories(data.doc?.categories ?? next);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장 실패');
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  const upsertEntry = async (catId: string, entry: YouthIdEntry) => {
    const next = categories.map(cat => {
      if (cat.id !== catId) return cat;
      const idx = cat.entries.findIndex(e => e.id === entry.id);
      const entries =
        idx >= 0
          ? cat.entries.map((e, i) => (i === idx ? entry : e))
          : [...cat.entries, entry];
      return { ...cat, entries };
    });
    setCategories(next);
    await persist(next);
  };

  const deleteEntry = async (catId: string, entryId: string) => {
    if (!window.confirm('이 항목을 삭제할까요?')) return;
    const next = categories.map(cat =>
      cat.id === catId
        ? { ...cat, entries: cat.entries.filter(e => e.id !== entryId) }
        : cat,
    );
    setCategories(next);
    await persist(next);
  };

  const addCategory = async () => {
    const label = window.prompt('새 묶음 이름 (예: 기관 · 기타)');
    if (!label?.trim()) return;
    const next = [
      ...categories,
      { id: newYouthIdCategoryId(label), label: label.trim(), entries: [] },
    ];
    setCategories(next);
    await persist(next);
  };

  const sections = useMemo(() => {
    return categories
      .map(cat => {
        const scoped = viewAll ? cat.entries : cat.entries.filter(e => !e.owner || e.owner === me);
        const entries = q ? scoped.filter(e => entryMatches(e, q)) : scoped;
        return { ...cat, entries };
      })
      .filter(cat => cat.entries.length > 0 || editMode);
  }, [categories, viewAll, me, q, editMode]);

  const { left, right } = useMemo(() => {
    const l = PRIORITY_IDS.map(id => sections.find(c => c.id === id)).filter(
      (c): c is (typeof sections)[number] => Boolean(c),
    );
    const r = sections.filter(c => !PRIORITY_IDS.includes(c.id));
    return { left: l, right: r };
  }, [sections]);

  if (!configured && !editMode) {
    return (
      <div className={portalEmptyState}>
        아직 자료가 등록되지 않았습니다.
        <br />
        <button
          type="button"
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          onClick={() => {
            setEditMode(true);
            if (!categories.length) {
              setCategories([{ id: 'comm', label: '통신', icon: '📞', entries: [] }]);
            }
          }}
        >
          첫 항목 추가하기
        </button>
      </div>
    );
  }

  const total = sections.reduce((n, c) => n + c.entries.length, 0);
  const modalCat = modal ? categories.find(c => c.id === modal.catId) : null;

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
        <button
          type="button"
          onClick={() => setEditMode(v => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
            editMode
              ? 'border-violet-400 bg-violet-50 text-violet-700'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {editMode ? '편집 중 ✓' : '편집'}
        </button>
        {editMode ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void addCategory()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            + 묶음
          </button>
        ) : null}
        <span className="ml-auto text-xs text-slate-500">
          {saving ? (
            '저장 중…'
          ) : viewAll ? (
            <>전 직원 계정·자료 모두 표시 · {total}건</>
          ) : (
            <>
              <b className="text-slate-700">{me}</b>님 + 공용 · {total}건
            </>
          )}
        </span>
      </div>

      {saveError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
      ) : null}

      {sections.length === 0 ? (
        <div className={portalEmptyState}>{q ? '검색 결과가 없습니다.' : '표시할 자료가 없습니다.'}</div>
      ) : (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <div className="min-w-0 space-y-3">
            {left.map(cat => (
              <SectionTable
                key={cat.id}
                cat={cat}
                me={me}
                align
                editMode={editMode}
                onAdd={() => setModal({ catId: cat.id })}
                onEdit={e => setModal({ catId: cat.id, entry: e })}
                onDelete={entryId => void deleteEntry(cat.id, entryId)}
              />
            ))}
          </div>
          <div className="min-w-0 space-y-3">
            {right.map(cat => (
              <SectionTable
                key={cat.id}
                cat={cat}
                me={me}
                editMode={editMode}
                onAdd={() => setModal({ catId: cat.id })}
                onEdit={e => setModal({ catId: cat.id, entry: e })}
                onDelete={entryId => void deleteEntry(cat.id, entryId)}
              />
            ))}
          </div>
        </div>
      )}

      {modal && modalCat ? (
        <YouthIdEntryModal
          open
          categoryLabel={modalCat.label}
          staffNames={staffNames}
          initial={modal.entry}
          onClose={() => setModal(null)}
          onSave={entry => {
            void upsertEntry(modal.catId, entry).catch(() => {});
            setModal(null);
          }}
        />
      ) : null}
    </div>
  );
}

const LABEL_W = '9rem';
const ID_W = '10rem';

function SectionTable({
  cat,
  me,
  align = false,
  editMode,
  onAdd,
  onEdit,
  onDelete,
}: {
  cat: YouthIdCategory;
  me: string;
  align?: boolean;
  editMode: boolean;
  onAdd: () => void;
  onEdit: (e: YouthIdEntry) => void;
  onDelete: (entryId: string) => void;
}) {
  const cols = columnsOf(cat);
  const idStyle = (c: string): CSSProperties | undefined =>
    align && (c === 'ID' || c === '이메일') ? { width: ID_W, minWidth: ID_W } : undefined;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
        {cat.icon ? <span aria-hidden>{cat.icon}</span> : null}
        <h3 className="text-[13px] font-bold text-slate-700">{cat.label}</h3>
        <span className="ml-auto text-[10px] font-medium tabular-nums text-slate-400">{cat.entries.length}</span>
        {editMode ? (
          <button
            type="button"
            className="rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 hover:bg-violet-100"
            onClick={onAdd}
          >
            + 항목
          </button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        {cat.entries.length === 0 && editMode ? (
          <p className="px-3 py-4 text-center text-xs text-slate-400">항목이 없습니다. + 항목으로 추가하세요.</p>
        ) : (
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
                  <th key={c} style={idStyle(c)} className="whitespace-nowrap px-2 py-1 text-left font-semibold">
                    {c}
                  </th>
                ))}
                {editMode ? (
                  <th className="whitespace-nowrap px-2 py-1 text-left font-semibold">편집</th>
                ) : null}
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
                      const s = idStyle(col);
                      return <ValueCell key={col} value={f?.value ?? ''} style={s} />;
                    })}
                    {editMode ? (
                      <td className="whitespace-nowrap px-2 py-1 align-top">
                        <button
                          type="button"
                          className="mr-1 text-[11px] font-semibold text-blue-700 hover:underline"
                          onClick={() => onEdit(e)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="text-[11px] font-semibold text-red-600 hover:underline"
                          onClick={() => onDelete(e.id)}
                        >
                          삭제
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function ValueCell({ value, style }: { value: string; style?: CSSProperties }) {
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
      className={`cursor-pointer px-2 py-1 font-mono leading-tight transition-colors whitespace-nowrap ${
        copied ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
      }`}
      title={value ? `${value} (클릭 복사)` : ''}
      onClick={copy}
    >
      {value || <span className="text-slate-300">-</span>}
    </td>
  );
}
