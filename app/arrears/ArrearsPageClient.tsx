'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PortalPageShell from '@/app/components/portal/PortalPageShell';
import {
  portalAlertError,
  portalBtnPrimary,
  portalBtnSecondary,
  portalInput,
  portalMain,
} from '@/app/components/portal/uiClasses';
import CenterModal from '@/app/components/portal/CenterModal';
import {
  ARREARS_MANAGER_NAMES,
  ARREARS_MGMT_CATEGORIES,
  arrearsCategoryChipClass,
  arrearsCategoryLabel,
  arrearsCategoryRowClass,
  formatArrearsWon,
  type ArrearsEntryDto,
  type ArrearsManagerTotal,
} from '@/app/types/arrears';
import { fetchWithTimeout } from '@/app/utils/fetchTimeout';
import { managerNamesMatch } from '@/app/utils/managerMatch';
import ArrearsManualEntryModal, {
  type ManualChannel,
} from '@/app/arrears/ArrearsManualEntryModal';
import ArrearsMatchPanel from '@/app/arrears/ArrearsMatchPanel';
import ArrearsFeeEventsImport from '@/app/arrears/ArrearsFeeEventsImport';
import { toArrearsListExportItem } from '@/lib/arrearsListExportShared';

type BulkRow = {
  clientId?: string;
  clientName?: string;
  companyName?: string;
  manager?: string;
  managerName?: string;
  monthlyFee?: number;
  fee?: number;
  balance?: number;
  monthCount?: number;
  covered?: number;
  remainder?: number;
  entryId: string | null;
  externalCode: string | null;
  status: string;
  statusLabel: string;
  description?: string;
  proposedDescriptions?: string[];
};

type BulkPreview = {
  yearMonth?: string;
  year?: number;
  description?: string;
  ready: number;
  readyAmount: number;
  skipped: number;
  totalClients?: number;
  endYearMonthOverride?: string;
  rows: BulkRow[];
};

type ChargeMode = 'bookkeeping' | 'adjustment' | 'backfill';

const ARREARS_LIST_UI_KEY = 'arrears-list-ui-v1';

type ArrearsListUiPersist = {
  editMode?: boolean;
  q?: string;
  managers?: string[];
  categories?: string[];
  showZero?: boolean;
  churnedOnly?: boolean;
};

function readArrearsListUi(): ArrearsListUiPersist {
  try {
    const raw = sessionStorage.getItem(ARREARS_LIST_UI_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ArrearsListUiPersist;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function defaultYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function defaultYear() {
  return String(new Date().getFullYear());
}

export default function ArrearsPageClient() {
  const router = useRouter();
  const [items, setItems] = useState<ArrearsEntryDto[]>([]);
  const [totals, setTotals] = useState<ArrearsManagerTotal[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalLinesOpen, setTotalLinesOpen] = useState(0);
  const [asOfDate, setAsOfDate] = useState('');
  const [canManage, setCanManage] = useState(false);
  /** 총미수 목록 엑셀 — 관리자·인디·찰리 */
  const [canExportList, setCanExportList] = useState(false);
  /** 로그인 사용자 표시명 — 일반 담당은 본인만 필터 가능 */
  const [viewerName, setViewerName] = useState('');
  /** 인디 등 관리자: 기본은 담당자 화면과 동일, 켤 때만 수정 UI — 탭 세션 유지 */
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [matchOpen, setMatchOpen] = useState(false);
  const [feeImportOpen, setFeeImportOpen] = useState(false);

  const [managers, setManagers] = useState<string[]>([]);
  /** 선택된 관리분류 id. '' = 미분류. 빈 배열 = 전체 */
  const [categories, setCategories] = useState<string[]>([]);
  /** false=잔액0 숨김(기본), true=0원도 보기 */
  const [showZero, setShowZero] = useState(false);
  const [churnedOnly, setChurnedOnly] = useState(false);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  /** sessionStorage 복원 전에는 목록 요청하지 않음 */
  const [uiReady, setUiReady] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualChannel, setManualChannel] = useState<ManualChannel>('thebill');
  const [manualEntryId, setManualEntryId] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<ChargeMode>('bookkeeping');
  const [bulkYearMonth, setBulkYearMonth] = useState(defaultYearMonth);
  const [bulkYear, setBulkYear] = useState(defaultYear);
  const [bulkManager, setBulkManager] = useState('');
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [listExportBusy, setListExportBusy] = useState(false);
  /** 목록 정렬 — 기본 잔액 내림차순(서버와 동일) */
  const [sortKey, setSortKey] = useState<'companyName' | 'balance'>('balance');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  /** 상호·잔액 다중선택 필터 (빈 배열 = 전체) */
  const [filterCompanies, setFilterCompanies] = useState<string[]>([]);
  const [filterBalances, setFilterBalances] = useState<number[]>([]);
  const [companyFilterOpen, setCompanyFilterOpen] = useState(false);
  const [balanceFilterOpen, setBalanceFilterOpen] = useState(false);
  const [companyFilterQ, setCompanyFilterQ] = useState('');
  const [balanceFilterQ, setBalanceFilterQ] = useState('');
  const [bulkFieldManager, setBulkFieldManager] = useState('');
  const [bulkFieldCategory, setBulkFieldCategory] = useState('__keep__');
  const [bulkFieldBusy, setBulkFieldBusy] = useState(false);

  useEffect(() => {
    const saved = readArrearsListUi();
    if (saved.editMode) setEditMode(true);
    if (typeof saved.q === 'string' && saved.q) {
      setQ(saved.q);
      setQDebounced(saved.q.trim());
    }
    if (Array.isArray(saved.managers)) setManagers(saved.managers.filter(Boolean));
    if (Array.isArray(saved.categories)) setCategories(saved.categories);
    if (typeof saved.showZero === 'boolean') setShowZero(saved.showZero);
    if (typeof saved.churnedOnly === 'boolean') setChurnedOnly(saved.churnedOnly);
    setUiReady(true);
  }, []);

  useEffect(() => {
    if (!uiReady) return;
    try {
      const payload: ArrearsListUiPersist = {
        editMode,
        q,
        managers,
        categories,
        showZero,
        churnedOnly,
      };
      sessionStorage.setItem(ARREARS_LIST_UI_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
  }, [uiReady, editMode, q, managers, categories, showZero, churnedOnly]);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (mode: 'full' | 'soft' = 'full') => {
      const params = new URLSearchParams();
      for (const m of managers) params.append('manager', m);
      for (const c of categories) {
        params.append('category', c === '' ? 'none' : c);
      }
      if (!showZero) params.set('nonzero', '1');
      if (churnedOnly) params.set('churned', '1');
      if (qDebounced) params.set('q', qDebounced);

      if (mode === 'full') {
        setLoading(true);
        setError('');
      }

      try {
        const res = await fetchWithTimeout(
          `/api/arrears?${params.toString()}`,
          { cache: 'no-store' },
          20_000,
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || '목록 조회 실패');

        setItems((data as { items: ArrearsEntryDto[] }).items || []);
        setTotals((data as { totalsByManager: ArrearsManagerTotal[] }).totalsByManager || []);
        setTotalBalance((data as { totalBalance?: number }).totalBalance || 0);
        setTotalLinesOpen((data as { totalLinesOpen?: number }).totalLinesOpen || 0);
        setAsOfDate((data as { asOfDate?: string }).asOfDate || '');
        setCanManage(!!(data as { canManage?: boolean }).canManage);
        setCanExportList(!!(data as { canExportList?: boolean }).canExportList);
        setViewerName((data as { viewerName?: string }).viewerName?.trim() || '');
      } catch (e) {
        if (mode === 'full') {
          setError(e instanceof Error ? e.message : '불러오기 실패');
        }
      } finally {
        if (mode === 'full') setLoading(false);
      }
    },
    [managers, categories, showZero, churnedOnly, qDebounced],
  );

  useEffect(() => {
    if (!uiReady) return;
    void load('full');
  }, [load, uiReady]);

  useEffect(() => {
    if (!uiReady) return;
    const soft = () => {
      if (document.visibilityState === 'visible') void load('soft');
    };
    document.addEventListener('visibilitychange', soft);
    const id = window.setInterval(soft, 45_000);
    return () => {
      document.removeEventListener('visibilitychange', soft);
      window.clearInterval(id);
    };
  }, [load, uiReady]);

  const patchRow = useCallback(
    async (
      id: string,
      patch: Partial<Pick<ArrearsEntryDto, 'managerName' | 'mgmtCategory' | 'memo'>>,
    ) => {
      setSavingId(id);
      setError('');
      try {
        const res = await fetch(`/api/arrears/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || '저장 실패');
        const item = (data as { item: ArrearsEntryDto }).item;
        setItems(prev => prev.map(r => (r.id === id ? { ...r, ...item } : r)));
        void load('soft');
        return item;
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장 실패');
        throw e;
      } finally {
        setSavingId(null);
      }
    },
    [load],
  );

  const openManual = (channel: ManualChannel, entryId = '') => {
    setManualChannel(channel);
    setManualEntryId(entryId);
    setManualOpen(true);
  };

  const submitManual = async (payload: {
    entryId: string;
    channel: ManualChannel;
    amount: number;
    eventDate: string;
    description: string;
  }) => {
    setManualBusy(true);
    setError('');
    try {
      const res = await fetch('/api/arrears/manual-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '반영 실패');
      setManualOpen(false);
      await load('full');
    } catch (e) {
      throw e instanceof Error ? e : new Error('반영 실패');
    } finally {
      setManualBusy(false);
    }
  };

  const openBulk = (mode: ChargeMode) => {
    setBulkMode(mode);
    setBulkYearMonth(defaultYearMonth());
    setBulkYear(defaultYear());
    setBulkManager(managers.length === 1 ? managers[0] : '');
    setBulkPreview(null);
    setBulkMsg('');
    setBulkOpen(true);
  };

  const previewBulk = async () => {
    setBulkBusy(true);
    setBulkMsg('');
    setError('');
    try {
      const endpoint =
        bulkMode === 'bookkeeping'
          ? '/api/arrears/bulk-bookkeeping'
          : bulkMode === 'adjustment'
            ? '/api/arrears/bulk-adjustment'
            : '/api/arrears/backfill-ledger';
      const body =
        bulkMode === 'bookkeeping'
          ? { yearMonth: bulkYearMonth, manager: bulkManager || undefined, confirm: false }
          : bulkMode === 'adjustment'
            ? { year: bulkYear, manager: bulkManager || undefined, confirm: false }
            : {
                endYearMonth: bulkYearMonth,
                manager: bulkManager || undefined,
                confirm: false,
              };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '미리보기 실패');
      setBulkPreview(data as BulkPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : '미리보기 실패');
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmBulk = async () => {
    if (!bulkPreview?.ready) return;
    const label =
      bulkMode === 'bookkeeping'
        ? bulkPreview.description || '월 기장료'
        : bulkMode === 'adjustment'
          ? bulkPreview.description || '조정료'
          : `원장반영 분해 ${bulkPreview.ready}건`;
    if (
      !window.confirm(
        `${label}\n${bulkPreview.ready}건 · ${formatArrearsWon(bulkPreview.readyAmount)}원 반영할까요?`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    setBulkMsg('');
    setError('');
    try {
      const endpoint =
        bulkMode === 'bookkeeping'
          ? '/api/arrears/bulk-bookkeeping'
          : bulkMode === 'adjustment'
            ? '/api/arrears/bulk-adjustment'
            : '/api/arrears/backfill-ledger';
      const body =
        bulkMode === 'bookkeeping'
          ? { yearMonth: bulkYearMonth, manager: bulkManager || undefined, confirm: true }
          : bulkMode === 'adjustment'
            ? { year: bulkYear, manager: bulkManager || undefined, confirm: true }
            : {
                endYearMonth: bulkYearMonth,
                manager: bulkManager || undefined,
                confirm: true,
              };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || '일괄 반영 실패');
      const applied = Number((data as { applied?: number }).applied) || 0;
      const amount = Number((data as { appliedAmount?: number }).appliedAmount) || 0;
      const failed = Number((data as { failed?: number }).failed) || 0;
      setBulkMsg(
        `반영 완료: ${applied}건` +
          (amount ? ` · ${formatArrearsWon(amount)}원` : '') +
          (failed ? ` · 실패 ${failed}` : ''),
      );
      setBulkPreview(null);
      await load('full');
    } catch (e) {
      setError(e instanceof Error ? e.message : '일괄 반영 실패');
    } finally {
      setBulkBusy(false);
    }
  };

  const managerFilterOptions = useMemo(() => {
    const set = new Set<string>([...ARREARS_MANAGER_NAMES]);
    for (const t of totals) {
      if (t.managerName && t.managerName !== '(미지정)') set.add(t.managerName);
    }
    return [...set];
  }, [totals]);

  /** 인디·찰리·리아(관리자)만 다른 담당 선택 가능. 그 외는 본인만 */

  useEffect(() => {
    if (canManage || !viewerName) return;
    setManagers(prev => {
      const next = prev.filter(n => managerNamesMatch(n, viewerName));
      return next.length === prev.length ? prev : next;
    });
  }, [canManage, viewerName]);

  const toggleManagerFilter = (name: string) => {
    if (!canManage && !managerNamesMatch(name, viewerName)) return;
    setManagers(prev =>
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name],
    );
  };

  const companyOptions = useMemo(() => {
    const names = [...new Set(items.map(i => i.companyName.trim()).filter(Boolean))];
    names.sort((a, b) => a.localeCompare(b, 'ko'));
    return names;
  }, [items]);

  const balanceOptions = useMemo(() => {
    const vals = [...new Set(items.map(i => Math.round(i.balance)))];
    vals.sort((a, b) => b - a);
    return vals;
  }, [items]);

  const filteredCompanyOptions = useMemo(() => {
    const needle = companyFilterQ.trim().toLowerCase();
    if (!needle) return companyOptions;
    return companyOptions.filter(n => n.toLowerCase().includes(needle));
  }, [companyOptions, companyFilterQ]);

  const filteredBalanceOptions = useMemo(() => {
    const needle = balanceFilterQ.trim().replace(/,/g, '');
    if (!needle) return balanceOptions;
    return balanceOptions.filter(b => String(b).includes(needle) || formatArrearsWon(b).includes(needle));
  }, [balanceOptions, balanceFilterQ]);

  const displayItems = useMemo(() => {
    let rows = items;
    if (filterCompanies.length) {
      const set = new Set(filterCompanies);
      rows = rows.filter(r => set.has(r.companyName.trim()));
    }
    if (filterBalances.length) {
      const set = new Set(filterBalances);
      rows = rows.filter(r => set.has(Math.round(r.balance)));
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortKey === 'companyName') {
        return a.companyName.localeCompare(b.companyName, 'ko') * dir;
      }
      const diff = Math.round(a.balance) - Math.round(b.balance);
      if (diff !== 0) return diff * dir;
      return a.companyName.localeCompare(b.companyName, 'ko');
    });
  }, [items, filterCompanies, filterBalances, sortKey, sortDir]);

  const cycleSort = (key: 'companyName' | 'balance') => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(key === 'balance' ? 'desc' : 'asc');
  };

  const sortMark = (key: 'companyName' | 'balance') => {
    if (sortKey !== key) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  const toggleCompanyFilter = (name: string) => {
    setFilterCompanies(prev =>
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name],
    );
  };

  const toggleBalanceFilter = (balance: number) => {
    setFilterBalances(prev =>
      prev.includes(balance) ? prev.filter(x => x !== balance) : [...prev, balance],
    );
  };

  useEffect(() => {
    // 목록이 바뀌면 사라진 선택값 정리
    const nameSet = new Set(companyOptions);
    const balSet = new Set(balanceOptions);
    setFilterCompanies(prev => {
      const next = prev.filter(n => nameSet.has(n));
      return next.length === prev.length ? prev : next;
    });
    setFilterBalances(prev => {
      const next = prev.filter(b => balSet.has(b));
      return next.length === prev.length ? prev : next;
    });
  }, [companyOptions, balanceOptions]);

  const selectedCount = selectedIds.size;
  const selectedSum = useMemo(() => {
    let s = 0;
    for (const row of displayItems) {
      if (selectedIds.has(row.id)) s += row.balance;
    }
    return s;
  }, [displayItems, selectedIds]);

  const listFiltered =
    filterCompanies.length > 0 ||
    filterBalances.length > 0 ||
    displayItems.length !== items.length;

  const displayTotalBalance = useMemo(() => {
    if (!listFiltered) return totalBalance;
    let s = 0;
    for (const row of displayItems) s += row.balance;
    return s;
  }, [listFiltered, totalBalance, displayItems]);

  const displayTotalLinesOpen = useMemo(() => {
    if (!listFiltered) return totalLinesOpen;
    let s = 0;
    for (const row of displayItems) s += row.linesOpen ?? row.balance;
    return s;
  }, [listFiltered, totalLinesOpen, displayItems]);

  const totalLinesOpenDiff = displayTotalBalance - displayTotalLinesOpen;

  const allVisibleSelected =
    displayItems.length > 0 && displayItems.every(r => selectedIds.has(r.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of displayItems) next.delete(r.id);
      } else {
        for (const r of displayItems) next.add(r.id);
      }
      return next;
    });
  };

  const openBatchInvoice = () => {
    if (!selectedCount) return;
    const ids = [...selectedIds].join(',');
    router.push(`/arrears/batch-invoice?ids=${encodeURIComponent(ids)}`);
  };

  const applyBulkFields = async () => {
    if (!canManage || !selectedCount || bulkFieldBusy) return;
    const patch: Partial<Pick<ArrearsEntryDto, 'managerName' | 'mgmtCategory'>> = {};
    if (bulkFieldManager !== '') patch.managerName = bulkFieldManager;
    if (bulkFieldCategory !== '__keep__') {
      patch.mgmtCategory = bulkFieldCategory as ArrearsEntryDto['mgmtCategory'];
    }
    if (Object.keys(patch).length === 0) {
      setError('담당 또는 관리분류를 선택한 뒤 적용하세요.');
      return;
    }
    const ids = [...selectedIds];
    const labelParts: string[] = [];
    if (patch.managerName !== undefined) {
      labelParts.push(`담당 → ${patch.managerName || '(비움)'}`);
    }
    if (patch.mgmtCategory !== undefined) {
      labelParts.push(
        `관리 → ${patch.mgmtCategory ? arrearsCategoryLabel(patch.mgmtCategory) : '미분류'}`,
      );
    }
    if (
      !window.confirm(
        `선택한 ${ids.length}건에 일괄 적용할까요?\n${labelParts.join('\n')}`,
      )
    ) {
      return;
    }
    setBulkFieldBusy(true);
    setError('');
    let ok = 0;
    let fail = 0;
    try {
      for (const id of ids) {
        try {
          const res = await fetch(`/api/arrears/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
          if (!res.ok) {
            fail += 1;
            continue;
          }
          const data = await res.json().catch(() => ({}));
          const item = (data as { item?: ArrearsEntryDto }).item;
          if (item) {
            setItems(prev => prev.map(r => (r.id === id ? { ...r, ...item } : r)));
          }
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      if (fail) {
        setError(`일괄 변경: 성공 ${ok}건 · 실패 ${fail}건`);
      }
      void load('soft');
    } finally {
      setBulkFieldBusy(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** 담당자별 미수 공문 엑셀 (잔액≠0) — 미수수수료_블루-26.07.27.xlsx */
  const exportManagerLetters = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setError('');
    try {
      const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

      if (selectedCount > 0) {
        const params = new URLSearchParams({
          nonzero: '1',
          format: 'xlsx',
          ids: [...selectedIds].join(','),
        });
        if (managers.length) {
          for (const m of managers) params.append('manager', m);
        }
        const res = await fetch(`/api/arrears/export?${params}`, { cache: 'no-store' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || '엑셀 저장 실패');
        }
        const cd = res.headers.get('Content-Disposition') || '';
        const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
        const filename = decodeURIComponent(m?.[1] || m?.[2] || '미수수수료_선택.xlsx');
        downloadBlob(await res.blob(), filename);
        return;
      }

      if (managers.length > 0) {
        const params = new URLSearchParams({
          nonzero: '1',
          format: 'xlsx',
        });
        for (const m of managers) params.append('manager', m);
        for (const c of categories) {
          params.append('category', c === '' ? 'none' : c);
        }
        if (qDebounced) params.set('q', qDebounced);
        const res = await fetch(`/api/arrears/export?${params}`, { cache: 'no-store' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || '엑셀 저장 실패');
        }
        const cd = res.headers.get('Content-Disposition') || '';
        const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
        const label = managers.length === 1 ? managers[0] : `선택${managers.length}`;
        const filename = decodeURIComponent(m?.[1] || m?.[2] || `미수수수료_${label}.xlsx`);
        downloadBlob(await res.blob(), filename);
        return;
      }

      const metaRes = await fetch('/api/arrears/export?byManager=1&nonzero=1&format=xlsx', {
        cache: 'no-store',
      });
      const meta = await metaRes.json().catch(() => ({}));
      if (!metaRes.ok) {
        throw new Error((meta as { error?: string }).error || '엑셀 저장 실패');
      }
      const files = (meta as { files?: { manager: string; filename: string; count: number }[] })
        .files;
      if (!files?.length) throw new Error('내보낼 담당자가 없습니다.');

      const ok = window.confirm(
        `담당자별 공문 엑셀 ${files.length}개 파일을 다운로드합니다.\n` +
          files.map(f => `· ${f.filename} (${f.count}곳)`).join('\n') +
          `\n\n브라우저가 여러 번 다운로드를 물을 수 있습니다.`,
      );
      if (!ok) return;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const res = await fetch(
          `/api/arrears/export?manager=${encodeURIComponent(f.manager)}&nonzero=1&format=xlsx`,
          { cache: 'no-store' },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error || `${f.manager} 엑셀 저장 실패`,
          );
        }
        downloadBlob(await res.blob(), f.filename);
        if (i < files.length - 1) await sleep(500);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '엑셀 저장 실패');
    } finally {
      setExportBusy(false);
    }
  };

  /** 화면 목록(총미수) 요약 엑셀 — 화면 데이터·행 색상 그대로 (DB 재조회 없음) */
  const exportArrearsList = async () => {
    if (!canExportList || listExportBusy) return;
    if (!displayItems.length) {
      setError('내보낼 미수 목록이 없습니다.');
      return;
    }
    setListExportBusy(true);
    setError('');
    try {
      const res = await fetch('/api/arrears/export-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          asOfDate,
          items: displayItems.map(toArrearsListExportItem),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || '총미수 엑셀 저장 실패');
      }
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
      const filename = decodeURIComponent(m?.[1] || m?.[2] || '미수목록_전체.xlsx');
      downloadBlob(await res.blob(), filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : '총미수 엑셀 저장 실패');
    } finally {
      setListExportBusy(false);
    }
  };

  return (
    <PortalPageShell bare>
      <div className={`${portalMain} w-full space-y-4 py-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">미수관리</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              잔액·최근 입금은 원장/상세 PDF 기준. 잔액 0원이어도 입력해 둔 공문·원장 내역이 있으면
              목록·상세에 그대로 보입니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <button
                type="button"
                className={`${portalBtnSecondary} ${editMode ? 'border-amber-400 bg-amber-50 text-amber-950' : ''}`}
                onClick={() => {
                  setEditMode(v => {
                    if (v) {
                      setMatchOpen(false);
                      setFeeImportOpen(false);
                    }
                    return !v;
                  });
                }}
                title="켜면 담당·분류·더빌 등 수정 도구가 표시됩니다"
              >
                {editMode ? '수정 모드 끄기' : '수정 모드'}
              </button>
            ) : null}
            {editMode ? (
              <button
                type="button"
                className={`${portalBtnSecondary} ${matchOpen ? 'border-violet-400 bg-violet-50 text-violet-900' : ''}`}
                onClick={() => setMatchOpen(o => !o)}
                title="공문만 있고 원장 코드가 없는 업체 연결"
              >
                {matchOpen ? '연결필요 닫기' : '연결필요'}
              </button>
            ) : null}
            {editMode ? (
              <button
                type="button"
                className={`${portalBtnSecondary} ${feeImportOpen ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : ''}`}
                onClick={() => setFeeImportOpen(o => !o)}
                title="세금계산서 발급 엑셀(품목) · CMS"
              >
                {feeImportOpen ? '세금계산서 닫기' : '세금계산서'}
              </button>
            ) : null}
            <button
              type="button"
              className={portalBtnSecondary}
              disabled={exportBusy}
              onClick={() => void exportManagerLetters()}
              title="잔액≠0 업체만 · 담당자별 미수수수료_블루-YY.MM.DD.xls 형태"
            >
              {exportBusy
                ? '엑셀 저장 중…'
                : selectedCount
                  ? `공문 엑셀 (${selectedCount})`
                  : managers.length === 1
                    ? `${managers[0]} 공문 엑셀`
                    : managers.length > 1
                      ? `공문 엑셀 (${managers.length}명)`
                      : '담당자별 공문 엑셀'}
            </button>
            <button
              type="button"
              className={portalBtnPrimary}
              disabled={!selectedCount}
              onClick={openBatchInvoice}
              title="선택한 업체를 한 장의 미수 수수료 안내로"
            >
              일괄 청구서{selectedCount ? ` (${selectedCount})` : ''}
            </button>
            {editMode ? (
              <>
              <button type="button" className={portalBtnSecondary} onClick={() => openBulk('bookkeeping')}>
                월 기장료
              </button>
              <button
                type="button"
                className={portalBtnSecondary}
                onClick={() => openBulk('adjustment')}
              >
                조정료
              </button>
              <button
                type="button"
                className={portalBtnSecondary}
                onClick={() => openBulk('backfill')}
              >
                원장 분해
              </button>
              <button
                type="button"
                className={portalBtnSecondary}
                onClick={() => openManual('thebill')}
              >
                더빌
              </button>
              <button
                type="button"
                className={portalBtnSecondary}
                onClick={() => openManual('cms')}
              >
                CMS
              </button>
              </>
            ) : null}
          </div>
        </div>

        {editMode && matchOpen ? (
          <ArrearsMatchPanel
            onLinked={() => void load('full')}
            onClose={() => setMatchOpen(false)}
          />
        ) : null}

        {editMode && feeImportOpen ? (
          <ArrearsFeeEventsImport
            onApplied={() => void load('full')}
            onClose={() => setFeeImportOpen(false)}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-800">
            기준일 {asOfDate || '—'}
          </span>
          <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 font-semibold text-amber-900 tabular-nums">
            총미수 {formatArrearsWon(displayTotalBalance)}원
            {listFiltered ? (
              <span className="ml-1 text-[11px] font-medium text-amber-800/80">(화면 필터)</span>
            ) : null}
          </span>
          {totalLinesOpenDiff !== 0 ? (
            <span
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 tabular-nums"
              title="원장 잔액 합계와 공문·원장 내역 합계가 다른 업체가 있습니다"
            >
              내역합계 {formatArrearsWon(displayTotalLinesOpen)}원 · 차{' '}
              {formatArrearsWon(totalLinesOpenDiff)}
            </span>
          ) : null}
          <span className="text-xs text-slate-500">
            {displayItems.length === items.length
              ? `${items.length}건`
              : `${displayItems.length}/${items.length}건`}
          </span>
          {canExportList ? (
            <button
              type="button"
              className={`${portalBtnSecondary} !py-1.5 text-xs`}
              disabled={listExportBusy || loading || displayItems.length === 0}
              onClick={() => void exportArrearsList()}
              title="현재 화면에 보이는 총미수 목록 엑셀 (관리자·인디·찰리)"
            >
              {listExportBusy ? '총미수 엑셀…' : '총미수 엑셀'}
            </button>
          ) : null}
          {selectedCount ? (
            <span className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 tabular-nums">
              선택 {selectedCount} · {formatArrearsWon(selectedSum)}원
            </span>
          ) : null}
        </div>

        {editMode && selectedCount > 0 ? (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3 shadow-sm">
            <p className="w-full text-xs font-semibold text-violet-900">
              선택 {selectedCount}건 일괄 변경
            </p>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              담당
              <select
                className={`${portalInput} min-w-[7rem] py-2`}
                value={bulkFieldManager}
                onChange={e => setBulkFieldManager(e.target.value)}
                disabled={bulkFieldBusy}
              >
                <option value="">변경 안 함</option>
                {ARREARS_MANAGER_NAMES.map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                {managerFilterOptions
                  .filter(n => !(ARREARS_MANAGER_NAMES as readonly string[]).includes(n))
                  .map(n => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              관리
              <select
                className={`${portalInput} min-w-[7rem] py-2`}
                value={bulkFieldCategory}
                onChange={e => setBulkFieldCategory(e.target.value)}
                disabled={bulkFieldBusy}
              >
                <option value="__keep__">변경 안 함</option>
                <option value="">미분류</option>
                {ARREARS_MGMT_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={`${portalBtnPrimary} py-2`}
              disabled={
                bulkFieldBusy ||
                (bulkFieldManager === '' && bulkFieldCategory === '__keep__')
              }
              onClick={() => void applyBulkFields()}
            >
              {bulkFieldBusy ? '적용 중…' : '선택 건에 적용'}
            </button>
            <button
              type="button"
              className={`${portalBtnSecondary} py-2`}
              disabled={bulkFieldBusy}
              onClick={() => setSelectedIds(new Set())}
            >
              선택 해제
            </button>
          </div>
        ) : null}

        {totals.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {totals.map(t => {
              const name = t.managerName;
              const selectable =
                !!name &&
                name !== '(미지정)' &&
                (canManage || managerNamesMatch(name, viewerName));
              const selected = selectable && managers.includes(name);
              return (
              <button
                key={name}
                type="button"
                disabled={!selectable}
                onClick={() => {
                  if (!selectable) return;
                  toggleManagerFilter(name);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors ${
                  selected
                    ? 'border-blue-400 bg-blue-50 text-blue-800'
                    : selectable
                      ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                }`}
              >
                {name} · {formatArrearsWon(t.balance)} ({t.count})
              </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex min-w-[12rem] flex-col gap-1.5 self-start">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">담당 (다중선택)</span>
              {canManage && managers.length > 0 ? (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                  onClick={() => setManagers([])}
                >
                  전체
                </button>
              ) : null}
            </div>
            <div className="flex max-w-md flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
              {[
                ...ARREARS_MANAGER_NAMES,
                ...managerFilterOptions.filter(
                  n => !(ARREARS_MANAGER_NAMES as readonly string[]).includes(n),
                ),
              ].map(n => {
                const own = managerNamesMatch(n, viewerName);
                const locked = !canManage && !own;
                const on = managers.includes(n);
                return (
                  <label
                    key={n}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                      locked
                        ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400'
                        : on
                          ? 'cursor-pointer border-blue-400 bg-blue-50 text-blue-900'
                          : 'cursor-pointer border-slate-200 bg-white text-slate-700'
                    }`}
                    title={
                      locked
                        ? '본인 담당만 선택할 수 있습니다'
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={on}
                      disabled={locked}
                      onChange={() => toggleManagerFilter(n)}
                    />
                    {n}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex min-w-[14rem] flex-col gap-1.5 self-start">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">관리분류 (다중선택)</span>
              {categories.length > 0 ? (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                  onClick={() => setCategories([])}
                >
                  전체
                </button>
              ) : null}
            </div>
            <div className="flex max-w-lg flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
              <label
                className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  categories.includes('')
                    ? 'border-slate-500 bg-slate-100 text-slate-900'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  className="rounded border-slate-300"
                  checked={categories.includes('')}
                  onChange={() =>
                    setCategories(prev =>
                      prev.includes('') ? prev.filter(x => x !== '') : [...prev, ''],
                    )
                  }
                />
                미분류
              </label>
              {ARREARS_MGMT_CATEGORIES.map(c => {
                const on = categories.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${arrearsCategoryChipClass(c.id)} ${
                      on ? 'ring-2 ring-slate-500 ring-offset-1' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={on}
                      onChange={() =>
                        setCategories(prev =>
                          prev.includes(c.id)
                            ? prev.filter(x => x !== c.id)
                            : [...prev, c.id],
                        )
                      }
                    />
                    {c.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col justify-end gap-1.5 pb-0.5 text-sm text-slate-700">
            <label className="flex items-center gap-2 whitespace-nowrap">
              <input
                type="checkbox"
                checked={showZero}
                onChange={e => setShowZero(e.target.checked)}
                className="rounded border-slate-300"
              />
              0원인것도 보기
            </label>
            <label className="flex items-center gap-2 whitespace-nowrap">
              <input
                type="checkbox"
                checked={churnedOnly}
                onChange={e => setChurnedOnly(e.target.checked)}
                className="rounded border-slate-300"
              />
              유출만
            </label>
          </div>

          <label className="flex min-w-[10rem] max-w-xs flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
            검색
            <input
              className={`${portalInput} py-2`}
              placeholder="상호·코드·사업자번호"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={`${portalBtnSecondary} py-2`}
            onClick={() => void load('full')}
          >
            새로고침
          </button>
        </div>

        {error ? <div className={portalAlertError}>{error}</div> : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-2 py-2.5 w-10 print:hidden">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    title="화면의 업체 모두 선택"
                    aria-label="전체 선택"
                  />
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap">코드</th>
                <th className="relative px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 hover:bg-slate-200/80"
                      onClick={() => cycleSort('companyName')}
                      title="상호 정렬"
                    >
                      상호 <span className="tabular-nums text-[10px] text-slate-500">{sortMark('companyName')}</span>
                    </button>
                    <button
                      type="button"
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        filterCompanies.length || companyFilterOpen
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      onClick={() => {
                        setCompanyFilterOpen(o => !o);
                        setBalanceFilterOpen(false);
                      }}
                      title="상호 다중 선택 필터"
                    >
                      필터{filterCompanies.length ? `(${filterCompanies.length})` : ''}
                    </button>
                    {filterCompanies.length > 0 ? (
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-slate-500 hover:text-slate-800"
                        onClick={() => setFilterCompanies([])}
                      >
                        해제
                      </button>
                    ) : null}
                  </div>
                  {companyFilterOpen ? (
                    <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                      <input
                        className={`${portalInput} mb-2 w-full py-1.5 text-xs`}
                        placeholder="상호 검색"
                        value={companyFilterQ}
                        onChange={e => setCompanyFilterQ(e.target.value)}
                        autoFocus
                      />
                      <div className="mb-1.5 flex gap-2 text-[11px]">
                        <button
                          type="button"
                          className="font-semibold text-blue-700 hover:underline"
                          onClick={() => setFilterCompanies([...filteredCompanyOptions])}
                        >
                          보이는 것 모두
                        </button>
                        <button
                          type="button"
                          className="font-semibold text-slate-500 hover:underline"
                          onClick={() => setFilterCompanies([])}
                        >
                          전체 해제
                        </button>
                        <button
                          type="button"
                          className="ml-auto font-semibold text-slate-500 hover:underline"
                          onClick={() => setCompanyFilterOpen(false)}
                        >
                          닫기
                        </button>
                      </div>
                      <div className="max-h-56 space-y-0.5 overflow-y-auto">
                        {filteredCompanyOptions.length === 0 ? (
                          <p className="px-1 py-2 text-xs text-slate-400">없음</p>
                        ) : (
                          filteredCompanyOptions.map(name => (
                            <label
                              key={name}
                              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                className="rounded border-slate-300"
                                checked={filterCompanies.includes(name)}
                                onChange={() => toggleCompanyFilter(name)}
                              />
                              <span className="truncate">{name}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </th>
                <th className="relative px-3 py-2.5 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 hover:bg-slate-200/80"
                      onClick={() => cycleSort('balance')}
                      title="미수 잔액 정렬"
                    >
                      미수 잔액{' '}
                      <span className="tabular-nums text-[10px] text-slate-500">{sortMark('balance')}</span>
                    </button>
                    <button
                      type="button"
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        filterBalances.length || balanceFilterOpen
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      onClick={() => {
                        setBalanceFilterOpen(o => !o);
                        setCompanyFilterOpen(false);
                      }}
                      title="미수 잔액 다중 선택 필터"
                    >
                      필터{filterBalances.length ? `(${filterBalances.length})` : ''}
                    </button>
                    {filterBalances.length > 0 ? (
                      <button
                        type="button"
                        className="text-[10px] font-semibold text-slate-500 hover:text-slate-800"
                        onClick={() => setFilterBalances([])}
                      >
                        해제
                      </button>
                    ) : null}
                  </div>
                  {balanceFilterOpen ? (
                    <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 text-left shadow-lg">
                      <input
                        className={`${portalInput} mb-2 w-full py-1.5 text-xs`}
                        placeholder="금액 검색"
                        value={balanceFilterQ}
                        onChange={e => setBalanceFilterQ(e.target.value)}
                        autoFocus
                      />
                      <div className="mb-1.5 flex gap-2 text-[11px]">
                        <button
                          type="button"
                          className="font-semibold text-blue-700 hover:underline"
                          onClick={() => setFilterBalances([...filteredBalanceOptions])}
                        >
                          보이는 것 모두
                        </button>
                        <button
                          type="button"
                          className="font-semibold text-slate-500 hover:underline"
                          onClick={() => setFilterBalances([])}
                        >
                          전체 해제
                        </button>
                        <button
                          type="button"
                          className="ml-auto font-semibold text-slate-500 hover:underline"
                          onClick={() => setBalanceFilterOpen(false)}
                        >
                          닫기
                        </button>
                      </div>
                      <div className="max-h-56 space-y-0.5 overflow-y-auto">
                        {filteredBalanceOptions.length === 0 ? (
                          <p className="px-1 py-2 text-xs text-slate-400">없음</p>
                        ) : (
                          filteredBalanceOptions.map(bal => (
                            <label
                              key={bal}
                              className="flex cursor-pointer items-center justify-between gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-50"
                            >
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="rounded border-slate-300"
                                  checked={filterBalances.includes(bal)}
                                  onChange={() => toggleBalanceFilter(bal)}
                                />
                                <span className="tabular-nums">{formatArrearsWon(bal)}</span>
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </th>
                <th className="px-3 py-2.5 min-w-[12rem]">미수 사유</th>
                <th className="px-3 py-2.5 whitespace-nowrap">담당</th>
                <th className="px-3 py-2.5 whitespace-nowrap">관리</th>
                <th className="px-3 py-2.5 min-w-[8rem]">메모</th>
                {editMode ? (
                  <th className="px-3 py-2.5 whitespace-nowrap print:hidden">입력</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={editMode ? 9 : 8} className="px-3 py-10 text-center text-slate-500">
                    불러오는 중…
                  </td>
                </tr>
              ) : displayItems.length === 0 ? (
                <tr>
                  <td colSpan={editMode ? 9 : 8} className="px-3 py-10 text-center text-slate-500">
                    표시할 미수 항목이 없습니다.
                    {!showZero ? ' 「0원인것도 보기」를 켜 보세요.' : ''}
                    {filterCompanies.length || filterBalances.length
                      ? ' 상호·잔액 필터를 해제해 보세요.'
                      : ''}
                  </td>
                </tr>
              ) : (
                displayItems.map(row => (
                  <tr
                    key={row.id}
                    className={`hover:brightness-[0.98] ${
                      row.externalCode.startsWith('letter:')
                        ? 'bg-amber-50/80'
                        : arrearsCategoryRowClass(row.mgmtCategory)
                    } ${selectedIds.has(row.id) ? 'ring-1 ring-inset ring-violet-300' : ''}`}
                  >
                    <td className="px-2 py-2 print:hidden">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        aria-label={`${row.companyName} 선택`}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {row.externalCode.startsWith('letter:') ? (
                        <span
                          className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
                          title="원장 코드 없음 — 공문만 있는 행. 이름 맞추기에서 연결하세요."
                        >
                          연결필요
                        </span>
                      ) : (
                        row.externalCode
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={editMode ? `/arrears/${row.id}?edit=1` : `/arrears/${row.id}`}
                            className={`text-blue-800 underline-offset-2 hover:underline ${
                              row.isChurned ? 'line-through decoration-red-300/80 text-slate-500' : ''
                            }`}
                            title={editMode ? '미수 내역 수정' : '미수 내역'}
                          >
                            {row.companyName}
                          </Link>
                          {row.isChurned ? (
                            <Link
                              href={
                                row.clientId
                                  ? `/clients/churn?tab=history&clientId=${row.clientId}`
                                  : '/clients/churn?tab=history'
                              }
                              className="shrink-0 rounded bg-red-200 px-1.5 py-0.5 text-[10px] font-bold text-red-900 hover:bg-red-300"
                              title="유출 이력"
                            >
                              유출
                            </Link>
                          ) : null}
                          {row.balanceDiffKind === 'mismatch' ? (
                            <span
                              className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-950"
                              title={`원장 ${formatArrearsWon(row.balance)} · 내역 ${formatArrearsWon(row.linesOpen ?? 0)} · 차 ${formatArrearsWon(row.balanceDiff ?? 0)}`}
                            >
                              불일치 {(row.balanceDiff ?? 0) > 0 ? '+' : ''}
                              {formatArrearsWon(row.balanceDiff ?? 0)}
                            </span>
                          ) : null}
                          {row.balanceDiffKind === 'ledger_only' ? (
                            <span
                              className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-800"
                              title="공문 없음 · 내역합 0 · 원장 잔액 유지(장기미수)"
                            >
                              원장만 {formatArrearsWon(row.balance)}
                            </span>
                          ) : null}
                        </div>
                        {row.clientId ? (
                          <Link
                            href={`/clients/${row.clientId}`}
                            className="text-[11px] font-normal text-slate-500 underline-offset-2 hover:underline"
                          >
                            수임처
                          </Link>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {editMode ? (
                        <button
                          type="button"
                          title="CMS 입금 반영"
                          disabled={savingId === row.id}
                          onClick={() => openManual('cms', row.id)}
                          className="rounded px-1.5 py-0.5 tabular-nums font-semibold text-slate-900 underline-offset-2 hover:underline"
                        >
                          {formatArrearsWon(row.balance)}
                        </button>
                      ) : (
                        <span className="tabular-nums font-semibold text-slate-900">
                          {formatArrearsWon(row.balance)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700 max-w-[16rem]">
                      <span className="line-clamp-2" title={row.reasonSummary || ''}>
                        {row.reasonSummary || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {editMode ? (
                        <select
                          className={`${portalInput} py-1 text-xs min-w-[5.5rem] bg-white/80`}
                          value={row.managerName}
                          disabled={savingId === row.id}
                          onChange={e => void patchRow(row.id, { managerName: e.target.value })}
                        >
                          <option value="">미지정</option>
                          {managerFilterOptions.map(n => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                          {row.managerName && !managerFilterOptions.includes(row.managerName) ? (
                            <option value={row.managerName}>{row.managerName}</option>
                          ) : null}
                        </select>
                      ) : (
                        <span className="text-slate-700">{row.managerName || '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editMode ? (
                        <select
                          className={`${portalInput} py-1 text-xs min-w-[6rem] bg-white/80 ${arrearsCategoryChipClass(row.mgmtCategory)}`}
                          value={row.mgmtCategory}
                          disabled={savingId === row.id}
                          onChange={e =>
                            void patchRow(row.id, {
                              mgmtCategory: e.target.value as ArrearsEntryDto['mgmtCategory'],
                            })
                          }
                        >
                          <option value="">미분류</option>
                          {ARREARS_MGMT_CATEGORIES.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${arrearsCategoryChipClass(row.mgmtCategory)}`}
                        >
                          {arrearsCategoryLabel(row.mgmtCategory)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editMode ? (
                        <input
                          className={`${portalInput} py-1 text-xs w-full min-w-[8rem] bg-white/80`}
                          defaultValue={row.memo}
                          key={`${row.id}:${row.updatedAt}:memo`}
                          disabled={savingId === row.id}
                          onBlur={e => {
                            const next = e.target.value;
                            if (next !== row.memo) void patchRow(row.id, { memo: next });
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                        />
                      ) : (
                        <span className="text-slate-600 text-xs">{row.memo || '—'}</span>
                      )}
                    </td>
                    {editMode ? (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => openManual('thebill', row.id)}
                          >
                            더빌
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => openManual('cms', row.id)}
                          >
                            CMS
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ArrearsManualEntryModal
        open={manualOpen}
        channel={manualChannel}
        entries={items}
        initialEntryId={manualEntryId}
        busy={manualBusy}
        onClose={() => setManualOpen(false)}
        onSubmit={submitManual}
      />

      <CenterModal
        open={bulkOpen}
        onClose={() => {
          if (bulkBusy) return;
          setBulkOpen(false);
        }}
        title={
          bulkMode === 'bookkeeping'
            ? '월 기장료 일괄 청구'
            : bulkMode === 'adjustment'
              ? '조정료 일괄 청구'
              : '원장반영 → 월 기장료 분해'
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            {bulkMode === 'bookkeeping'
              ? '수임처 기장수수료(월 공급가)를 미수 내역에 넣습니다. VAT는 더하지 않습니다. 같은 달 설명이 이미 있으면 건너뜁니다.'
              : bulkMode === 'adjustment'
                ? '수임처에 등록된 조정료(공급가)를 「○○년 조정료」로 넣습니다. 같은 설명이면 건너뜁니다.'
                : '공문 상세 없이 원장반영·전기이월만 있는 업체를, 기장수수료×개월로 쪼갭니다. 원장 잔액은 그대로 두고 사유 줄만 바꿉니다. 나누어떨어지지 않으면 «확인필요 잔액차»가 남습니다.'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {bulkMode === 'adjustment' ? (
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                귀속 연도
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  className={portalInput}
                  value={bulkYear}
                  onChange={e => {
                    setBulkYear(e.target.value);
                    setBulkPreview(null);
                  }}
                  disabled={bulkBusy}
                />
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {bulkMode === 'backfill' ? '끝 월 (최근 미수 달)' : '청구 월'}
                <input
                  type="month"
                  className={portalInput}
                  value={bulkYearMonth}
                  onChange={e => {
                    setBulkYearMonth(e.target.value);
                    setBulkPreview(null);
                  }}
                  disabled={bulkBusy}
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              담당
              <select
                className={portalInput}
                value={bulkManager}
                onChange={e => {
                  setBulkManager(e.target.value);
                  setBulkPreview(null);
                }}
                disabled={bulkBusy}
              >
                <option value="">전체</option>
                {managerFilterOptions.map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {bulkPreview ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">
                <span className="font-semibold">
                  {bulkPreview.description ||
                    (bulkMode === 'backfill' ? '원장 분해 미리보기' : '미리보기')}
                </span>
                <br />
                반영 예정 {bulkPreview.ready}건 · {formatArrearsWon(bulkPreview.readyAmount)}원 ·
                건너뜀 {bulkPreview.skipped}건
              </p>
              <div className="max-h-56 overflow-auto rounded border border-slate-200">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left">업체</th>
                      <th className="px-2 py-1.5 text-right">
                        {bulkMode === 'backfill' ? '잔액/개월' : '금액'}
                      </th>
                      <th className="px-2 py-1.5 text-left">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkPreview.rows.map((r, idx) => {
                      const name = r.clientName || r.companyName || '—';
                      const amt =
                        bulkMode === 'adjustment'
                          ? r.fee || 0
                          : bulkMode === 'backfill'
                            ? r.balance || 0
                            : r.monthlyFee || 0;
                      return (
                        <tr key={`${r.entryId || r.clientId || name}-${r.status}-${idx}`}>
                          <td className="px-2 py-1">
                            {name}
                            {r.externalCode ? (
                              <span className="ml-1 font-mono text-slate-400">{r.externalCode}</span>
                            ) : null}
                            {bulkMode === 'backfill' && r.proposedDescriptions?.length ? (
                              <div className="mt-0.5 text-[10px] text-slate-500 line-clamp-2">
                                {r.proposedDescriptions.join(' · ')}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {bulkMode === 'backfill'
                              ? `${formatArrearsWon(amt)} / ${r.monthCount || 0}개월`
                              : amt
                                ? formatArrearsWon(amt)
                                : '—'}
                          </td>
                          <td
                            className={`px-2 py-1 ${
                              r.status === 'ready' ? 'text-emerald-800 font-medium' : 'text-slate-500'
                            }`}
                          >
                            {r.statusLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {bulkMsg ? <p className="text-sm text-emerald-800">{bulkMsg}</p> : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={portalBtnSecondary}
              disabled={bulkBusy}
              onClick={() => setBulkOpen(false)}
            >
              닫기
            </button>
            <button
              type="button"
              className={portalBtnSecondary}
              disabled={bulkBusy}
              onClick={() => void previewBulk()}
            >
              {bulkBusy && !bulkPreview ? '조회 중…' : '미리보기'}
            </button>
            <button
              type="button"
              className={portalBtnPrimary}
              disabled={bulkBusy || !bulkPreview?.ready}
              onClick={() => void confirmBulk()}
            >
              {bulkBusy && bulkPreview ? '반영 중…' : '확정 반영'}
            </button>
          </div>
        </div>
      </CenterModal>
    </PortalPageShell>
  );
}
