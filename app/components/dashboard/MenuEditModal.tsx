'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildPrefsFromEditState,
  type ResolvedMenuGroup,
  type UserMenuPrefs,
} from '@/lib/menuPrefs';
import { prefsFromCatalogAndVisibility } from '@/app/utils/useResolvedTaxMenu';
import { portalBtnPrimary, portalBtnSecondary } from '@/app/components/portal/uiClasses';

type Props = {
  open: boolean;
  onClose: () => void;
  catalog: ResolvedMenuGroup[];
  prefs: UserMenuPrefs;
  onSave: (prefs: UserMenuPrefs) => Promise<void>;
  onReset: () => Promise<void>;
};

function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const next = [...list];
  const j = index + dir;
  if (j < 0 || j >= next.length) return list;
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

export default function MenuEditModal({ open, onClose, catalog, prefs, onSave, onReset }: Props) {
  const initial = useMemo(
    () => prefsFromCatalogAndVisibility(catalog, prefs),
    [catalog, prefs],
  );
  const [groupOrder, setGroupOrder] = useState(initial.groupOrder);
  const [hiddenGroupIds, setHiddenGroupIds] = useState<Set<string>>(
    () => new Set(initial.hiddenGroupIds),
  );
  const [itemOrderByGroup, setItemOrderByGroup] = useState(initial.itemOrderByGroup);
  const [hiddenHrefs, setHiddenHrefs] = useState<Set<string>>(() => new Set(initial.hiddenHrefs));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const next = prefsFromCatalogAndVisibility(catalog, prefs);
    setGroupOrder(next.groupOrder);
    setHiddenGroupIds(new Set(next.hiddenGroupIds));
    setItemOrderByGroup(next.itemOrderByGroup);
    setHiddenHrefs(new Set(next.hiddenHrefs));
    setError('');
  }, [open, catalog, prefs]);

  if (!open) return null;

  const catalogById = new Map(catalog.map(g => [g.id, g]));

  const toggleGroupHidden = (id: string) => {
    setHiddenGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleHrefHidden = (href: string) => {
    setHiddenHrefs(prev => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(
        buildPrefsFromEditState({
          groupOrder,
          hiddenGroupIds: [...hiddenGroupIds],
          itemOrderByGroup,
          hiddenHrefs: [...hiddenHrefs],
        }),
      );
      onClose();
    } catch {
      setError('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('메뉴 표시·순서를 기본값으로 되돌릴까요?')) return;
    setSaving(true);
    setError('');
    try {
      await onReset();
      onClose();
    } catch {
      setError('초기화에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="메뉴 편집"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-slate-800">메뉴 편집</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">표시 여부와 순서를 개인별로 저장합니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
          >
            닫기
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {groupOrder.map((gid, gi) => {
            const group = catalogById.get(gid);
            if (!group) return null;
            const groupHidden = hiddenGroupIds.has(gid);
            return (
              <div
                key={gid}
                className={`rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 ${
                  groupHidden ? 'opacity-55' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <input
                      type="checkbox"
                      checked={!groupHidden}
                      onChange={() => toggleGroupHidden(gid)}
                    />
                    {group.label}
                  </label>
                  <div className="ml-auto flex gap-0.5">
                    <button
                      type="button"
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-white"
                      onClick={() => setGroupOrder(prev => moveItem(prev, gi, -1))}
                      aria-label={`${group.label} 위로`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-white"
                      onClick={() => setGroupOrder(prev => moveItem(prev, gi, 1))}
                      aria-label={`${group.label} 아래로`}
                    >
                      ↓
                    </button>
                  </div>
                </div>

                {'href' in group ? (
                  <label className="mt-2 flex items-center gap-2 pl-1 text-[11px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={!hiddenHrefs.has(group.href) && !groupHidden}
                      disabled={groupHidden}
                      onChange={() => toggleHrefHidden(group.href)}
                    />
                    {group.label} 링크
                  </label>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {(itemOrderByGroup[gid] ?? group.items.map(i => i.href)).map((href, ii) => {
                      const item = group.items.find(i => i.href === href);
                      if (!item) return null;
                      const itemHidden = hiddenHrefs.has(href);
                      return (
                        <li
                          key={href}
                          className={`flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 ${
                            itemHidden || groupHidden ? 'opacity-50' : ''
                          }`}
                        >
                          <label className="inline-flex flex-1 items-center gap-1.5 text-[11px] font-medium text-slate-700">
                            <input
                              type="checkbox"
                              checked={!itemHidden && !groupHidden}
                              disabled={groupHidden}
                              onChange={() => toggleHrefHidden(href)}
                            />
                            {item.label}
                          </label>
                          <button
                            type="button"
                            className="rounded px-1 text-[10px] text-slate-400 hover:bg-slate-50"
                            disabled={groupHidden}
                            onClick={() =>
                              setItemOrderByGroup(prev => ({
                                ...prev,
                                [gid]: moveItem(prev[gid] ?? group.items.map(i => i.href), ii, -1),
                              }))
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="rounded px-1 text-[10px] text-slate-400 hover:bg-slate-50"
                            disabled={groupHidden}
                            onClick={() =>
                              setItemOrderByGroup(prev => ({
                                ...prev,
                                [gid]: moveItem(prev[gid] ?? group.items.map(i => i.href), ii, 1),
                              }))
                            }
                          >
                            ↓
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {error ? <p className="px-4 pb-1 text-[11px] font-medium text-rose-600">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
          <button type="button" className={portalBtnSecondary} disabled={saving} onClick={handleReset}>
            기본값
          </button>
          <div className="ml-auto flex gap-2">
            <button type="button" className={portalBtnSecondary} disabled={saving} onClick={onClose}>
              취소
            </button>
            <button type="button" className={portalBtnPrimary} disabled={saving} onClick={handleSave}>
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
