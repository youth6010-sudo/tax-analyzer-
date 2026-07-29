'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PortalPageShell, { PortalPageHeader } from '@/app/components/portal/PortalPageShell';
import { PageHeaderIcon } from '@/app/components/dashboard/SidebarNavIcon';
import CenterModal from '@/app/components/portal/CenterModal';
import {
  portalAlertError,
  portalBtnDangerFill,
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
  portalEmptyState,
  portalFieldLabel,
  portalFooterMeta,
  portalInput,
} from '@/app/components/portal/uiClasses';
import type { ClientSearchResult } from '@/app/types/client';
import {
  hydratePortal,
  prefetchSearchIndex,
  searchPortalClients,
} from '@/app/utils/portalStore';
import { mergeClientSearchResults } from '@/app/utils/searchNormalize';
import type { MailReceiptImage, MailReceiptView } from '@/lib/mailReceipts';

type PickedClient = { id: string; companyName: string };

const MAX_IMAGES = 5;

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[,#\s]+/)
    .map(t => t.trim().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 12);
}

function MailClientPicker({
  value,
  onSelect,
}: {
  value: PickedClient | null;
  onSelect: (client: PickedClient | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    hydratePortal();
    void prefetchSearchIndex();
  }, []);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    if (value) {
      setQuery('');
      setResults([]);
      setOpen(false);
    }
  }, [value]);

  useEffect(() => {
    const q = query.trim();
    if (!q || value) {
      setResults([]);
      setLoading(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const local = searchPortalClients(q);
      setResults(local);
      setLoading(true);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      fetch(`/api/clients/search?q=${encodeURIComponent(q)}&activeOnly=1`, { signal: ac.signal })
        .then(r => (r.ok ? r.json() : { clients: [] }))
        .then(data => {
          const api = (data.clients ?? []) as ClientSearchResult[];
          setResults(mergeClientSearchResults(local, api));
        })
        .catch(err => {
          if (err?.name !== 'AbortError') setResults(local);
        })
        .finally(() => setLoading(false));
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, value]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{value.companyName}</p>
        </div>
        <button type="button" className={`${portalBtnSecondary} !px-2 !py-1 text-xs`} onClick={() => onSelect(null)}>
          변경
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="search"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="업체명·사업자번호로 검색"
        className={`${portalInput} w-full`}
      />
      {open && query.trim() ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {loading && results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">검색 중…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">검색 결과 없음</li>
          ) : (
            results.slice(0, 12).map(c => (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-50"
                  onClick={() => onSelect({ id: c.id, companyName: c.companyName })}
                >
                  <span className="text-sm font-medium text-slate-900">{c.companyName}</span>
                  <span className="text-[11px] text-slate-500">
                    {[c.manager, c.businessNo].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function ReceiptFormModal({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: MailReceiptView | null;
  onClose: () => void;
  onSaved: (item: MailReceiptView) => void;
}) {
  const [client, setClient] = useState<PickedClient | null>(null);
  const [receivedAt, setReceivedAt] = useState(todayYmd());
  const [title, setTitle] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [memo, setMemo] = useState('');
  const [images, setImages] = useState<MailReceiptImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setClient(initial.clientId ? { id: initial.clientId, companyName: initial.clientName || '수임처' } : null);
      setReceivedAt(initial.receivedAt || todayYmd());
      setTitle(initial.title);
      setTagsText(initial.tags.join(', '));
      setMemo(initial.memo);
      setImages(initial.images);
    } else {
      setClient(null);
      setReceivedAt(todayYmd());
      setTitle('');
      setTagsText('');
      setMemo('');
      setImages([]);
    }
    setError('');
    setPreview(null);
  }, [open, initial]);

  const onPickImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!picked.length) {
      setError('이미지 파일만 올릴 수 있습니다.');
      return;
    }
    if (images.length + picked.length > MAX_IMAGES) {
      setError(`이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.`);
      return;
    }
    try {
      const next = await Promise.all(
        picked.map(
          file =>
            new Promise<MailReceiptImage>((resolve, reject) => {
              if (file.size > 1.5 * 1024 * 1024) {
                reject(new Error(`${file.name}: 장당 1.5MB 이하로 올려 주세요.`));
                return;
              }
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  id: crypto.randomUUID(),
                  name: file.name,
                  contentType: file.type || 'image/*',
                  dataUrl: String(reader.result ?? ''),
                });
              reader.onerror = () => reject(new Error(`${file.name} 이미지를 읽지 못했습니다.`));
              reader.readAsDataURL(file);
            }),
        ),
      );
      setError('');
      setImages(prev => [...prev, ...next]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 업로드 실패');
    }
  };

  const save = async () => {
    if (!client?.id) {
      setError('수임처를 선택해 주세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        clientId: client.id,
        receivedAt,
        title: title.trim() || '우편물',
        tags: parseTags(tagsText),
        memo: memo.trim(),
        images,
      };
      const res = await fetch(initial ? `/api/mail-receipts/${initial.id}` : '/api/mail-receipts', {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '저장에 실패했습니다.');
      onSaved(data.item as MailReceiptView);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <CenterModal
        open={open}
        title={initial ? '우편물 수정' : '우편물 등록'}
        description="수임처에 연결하고 영수증·우편 사진을 첨부합니다."
        onClose={onClose}
      >
        <div className="space-y-3">
          <div>
            <p className={portalFieldLabel}>수임처 *</p>
            <MailClientPicker value={client} onSelect={setClient} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={portalFieldLabel}>수령일</p>
              <input type="date" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} className={`${portalInput} w-full`} />
            </div>
            <div>
              <p className={portalFieldLabel}>제목</p>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="예: 세금계산서, 등기 우편"
                className={`${portalInput} w-full`}
              />
            </div>
          </div>
          <div>
            <p className={portalFieldLabel}>태그</p>
            <input
              value={tagsText}
              onChange={e => setTagsText(e.target.value)}
              placeholder="예: 영수증, 4대보험, 등기 (쉼표 구분)"
              className={`${portalInput} w-full`}
            />
          </div>
          <div>
            <p className={portalFieldLabel}>메모</p>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              rows={3}
              placeholder="용도·비고"
              className={`${portalInput} w-full resize-y`}
            />
          </div>
          <div>
            <p className={portalFieldLabel}>이미지 (최대 {MAX_IMAGES}장)</p>
            <label className="mt-1 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  void onPickImages(e.target.files);
                  e.currentTarget.value = '';
                }}
              />
              <span className="rounded-md bg-[#4b6cb7]/10 px-2 py-1">이미지 추가</span>
              <span className="font-normal text-slate-400">카톡 사진·영수증</span>
            </label>
            {images.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {images.map(att => (
                  <div key={att.id} className="relative">
                    <button type="button" className="block" onClick={() => setPreview({ url: att.dataUrl, name: att.name })}>
                      <img src={att.dataUrl} alt={att.name} className="h-16 w-16 rounded-md border border-slate-200 object-cover" />
                    </button>
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 rounded-full bg-slate-800 px-1.5 text-[10px] text-white"
                      onClick={() => setImages(prev => prev.filter(x => x.id !== att.id))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {error ? <p className={portalAlertError}>{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button type="button" className={portalBtnSecondary} onClick={onClose} disabled={saving}>
              취소
            </button>
            <button type="button" className={portalBtnPrimary} onClick={() => void save()} disabled={saving}>
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </CenterModal>

      <CenterModal open={!!preview} title={preview?.name || '미리보기'} onClose={() => setPreview(null)}>
        {preview ? <img src={preview.url} alt={preview.name} className="max-h-[70vh] w-full rounded-lg object-contain" /> : null}
      </CenterModal>
    </>
  );
}

export default function MailLedgerPageClient() {
  const [items, setItems] = useState<MailReceiptView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MailReceiptView | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (q = query) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      const res = await fetch(`/api/mail-receipts?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '목록을 불러오지 못했습니다.');
      setItems((data.items ?? []) as MailReceiptView[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load('');
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, { clientId: string; clientName: string; items: MailReceiptView[] }>();
    for (const item of items) {
      const key = item.clientId || item.clientName || 'unknown';
      const existing = map.get(key);
      if (existing) existing.items.push(item);
      else {
        map.set(key, {
          clientId: item.clientId || '',
          clientName: item.clientName || '수임처 미연결',
          items: [item],
        });
      }
    }
    return [...map.values()].sort((a, b) => a.clientName.localeCompare(b.clientName, 'ko'));
  }, [items]);

  const onSaved = (item: MailReceiptView) => {
    setItems(prev => {
      const idx = prev.findIndex(x => x.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next;
      }
      return [item, ...prev];
    });
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('이 우편물 기록을 삭제할까요?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/mail-receipts/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '삭제 실패');
      }
      setItems(prev => prev.filter(x => x.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <PortalPageShell>
      <PortalPageHeader
        title="우편물 대장"
        description="수임처별로 영수증·우편 사진을 모아 두고, 태그·메모로 바로 찾습니다."
        icon={<PageHeaderIcon name="mail-ledger" />}
        actions={
          <button
            type="button"
            className={portalBtnPrimary}
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            등록
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') void load(query);
          }}
          placeholder="업체명·제목·태그·메모 검색"
          className={`${portalInput} min-w-[240px] flex-1`}
        />
        <button type="button" className={portalBtnSecondary} onClick={() => void load(query)}>
          검색
        </button>
      </div>

      {error ? <p className={`${portalAlertError} mb-4`}>{error}</p> : null}

      {loading ? (
        <div className={portalEmptyState}>불러오는 중…</div>
      ) : groups.length === 0 ? (
        <div className={portalEmptyState}>
          <p className="font-medium text-slate-700">등록된 우편물이 없습니다</p>
          <p className="mt-1 text-sm text-slate-500">우측 상단 등록으로 수임처에 사진을 연결해 보세요.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {groups.map(group => (
            <li key={group.clientId || group.clientName} className={`${portalCard} p-4`}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-slate-900">{group.clientName}</h2>
                <p className="text-xs text-slate-500">{group.items.length}건</p>
              </div>
              <ul className="space-y-3">
                {group.items.map(item => (
                  <li key={item.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {item.receivedAt || '—'}
                          {item.createdByName ? ` · ${item.createdByName}` : ''}
                        </p>
                        {item.tags.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {item.tags.map(tag => (
                              <span key={tag} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {item.memo ? <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{item.memo}</p> : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className={`${portalBtnSecondary} !px-2 !py-1 text-[11px]`}
                          onClick={() => {
                            setEditing(item);
                            setModalOpen(true);
                          }}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className={`${portalBtnDangerFill} !px-2 !py-1 text-[11px]`}
                          disabled={deletingId === item.id}
                          onClick={() => void onDelete(item.id)}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                    {item.images.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.images.map(img => (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => setPreview({ url: img.dataUrl, name: img.name })}
                            className="block"
                            title="미리보기"
                          >
                            <img
                              src={img.dataUrl}
                              alt={img.name}
                              className="h-20 w-20 rounded-md border border-slate-200 object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-slate-400">첨부 이미지 없음</p>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <p className={portalFooterMeta}>수임처별로 모아 보며 태그·메모로 검색합니다.</p>

      <ReceiptFormModal
        open={modalOpen}
        initial={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSaved={onSaved}
      />

      <CenterModal open={!!preview} title={preview?.name || '미리보기'} onClose={() => setPreview(null)}>
        {preview ? <img src={preview.url} alt={preview.name} className="max-h-[70vh] w-full rounded-lg object-contain" /> : null}
      </CenterModal>
    </PortalPageShell>
  );
}
