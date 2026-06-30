'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  portalInput,
  portalBtnPrimary,
  portalBtnSecondary,
  portalBtnDanger,
  portalAlertError,
  portalAlertInfo,
} from '../portal/uiClasses';
import {
  CLIENT_SYNC_FIELDS,
  BLUEHOLE_CREATE_FIELDS,
  buildBlueholeCreatePrefill,
} from '@/lib/bluehole/clientFieldMap';
import { actionLabel, actionBadge, columnLabel } from './blueholeLogLabels';

export interface ClientOursForSync {
  companyName: string;
  businessNo: string;
  corporateNo: string;
  representative: string;
  residentNo: string;
  fax: string;
  businessEntityType?: string;
  // 블루홀 신규 등록 폼 프리필용(선택)
  phone?: string;
  mobilePhone?: string;
  email?: string;
  address?: string;
  zipCode?: string;
  industry?: string;
  item?: string;
  openDate?: string;
  program?: string;
  fee?: string;
}

interface BhCandidate {
  id: string;
  name: string;
  business_number?: string;
}

interface BhSearchItem {
  id: string;
  name: string;
  aka?: string;
  business_number?: string;
  branch_name?: string;
  manager_name?: string;
}

interface BhInfo {
  id: string;
  name?: string;
  business_number?: string;
  manager?: string;
  branch?: string;
  updated_at?: string;
  values?: Record<string, string>;
}

interface LastSync {
  at: string;
  userName: string;
  successCols: string[];
  warnings: string[];
}

interface LinkState {
  blueholeClientId: string;
  linked: boolean;
  configured: boolean;
  info?: BhInfo | null;
  infoError?: string;
  lastSync?: LastSync | null;
  deeplink?: string;
}

const deeplinkOf = (bhId: string) => `https://bluehole.world/client/info/${bhId}`;

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export default function ClientBlueholePanel({
  clientId,
  companyName,
  businessNumber,
  canEdit,
  isAdmin = false,
  ours,
}: {
  clientId: string;
  companyName: string;
  businessNumber?: string;
  canEdit: boolean;
  isAdmin?: boolean;
  ours: ClientOursForSync;
}) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<LinkState | null>(null);
  const [error, setError] = useState('');
  const [infoLoading, setInfoLoading] = useState(false);

  const [query, setQuery] = useState(companyName || '');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<BhSearchItem[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [unlinking, setUnlinking] = useState(false);

  // 실시간 블루홀 정보(릴레이 경유, 느림)를 백그라운드로 채운다.
  const loadLive = useCallback(async () => {
    setInfoLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/bluehole?live=1`, { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok) return;
      setState((prev) => (prev ? ({ ...prev, ...(data as object) } as LinkState) : (data as unknown as LinkState)));
    } catch {
      /* 실시간 정보 실패는 연결 상태 표시를 막지 않는다 */
    } finally {
      setInfoLoading(false);
    }
  }, [clientId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // 1단계: 릴레이 없이 연결 상태만 즉시 — 상세 진입이 빨라진다.
      const res = await fetch(`/api/clients/${clientId}/bluehole`, { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '상태를 불러오지 못했습니다.');
      const next = data as unknown as LinkState;
      setState(next);
      setLoading(false);
      // 2단계: 연결+설정된 경우에만 실시간 정보를 백그라운드로 채운다.
      if (next.linked && next.configured) void loadLive();
    } catch (e) {
      setError(e instanceof Error ? e.message : '상태를 불러오지 못했습니다.');
      setLoading(false);
    }
  }, [clientId, loadLive]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError('');
    setResults(null);
    try {
      const res = await fetch(`/api/bluehole/clients?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '검색 실패');
      setResults((data.clients as BhSearchItem[]) || []);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : '검색 실패');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const link = useCallback(
    async (bhId: string) => {
      if (!bhId) return;
      setBusyId(bhId);
      setSearchError('');
      try {
        const res = await fetch(`/api/clients/${clientId}/bluehole`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blueholeClientId: bhId }),
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error((data.error as string) || '연결 실패');
        setState(data as unknown as LinkState);
        setResults(null);
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : '연결 실패');
      } finally {
        setBusyId('');
      }
    },
    [clientId],
  );

  const unlink = useCallback(async () => {
    if (!confirm('블루홀 거래처 연결을 해제할까요? (블루홀 데이터는 삭제되지 않습니다)')) return;
    setUnlinking(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/bluehole`, { method: 'DELETE' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '해제 실패');
      setState({ blueholeClientId: '', linked: false, configured: state?.configured ?? true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '해제 실패');
    } finally {
      setUnlinking(false);
    }
  }, [clientId, state?.configured]);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold text-gray-500">블루홀 거래처</p>
        {state?.linked && (
          <a
            href={state.deeplink || deeplinkOf(state.blueholeClientId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-blue-700 hover:text-blue-800"
          >
            블루홀에서 열기 ↗
          </a>
        )}
      </div>

      {loading ? (
        <p className="py-2 text-sm text-gray-400">불러오는 중…</p>
      ) : error ? (
        <div className={portalAlertError}>{error}</div>
      ) : state?.linked ? (
        <LinkedView
          clientId={clientId}
          state={state}
          canEdit={canEdit}
          isAdmin={isAdmin}
          unlinking={unlinking}
          infoLoading={infoLoading}
          ours={ours}
          onUnlink={unlink}
          onSynced={load}
        />
      ) : !canEdit ? (
        <p className="py-1 text-sm text-gray-400">블루홀 미연결</p>
      ) : state && !state.configured ? (
        <div className={portalAlertInfo}>
          블루홀 계정이 등록되어 있지 않습니다.{' '}
          <Link href="/bluehole" className="font-semibold underline">
            블루홀 페이지
          </Link>
          에서 먼저 계정을 등록하세요.
        </div>
      ) : (
        <div className="space-y-3">
          <UnlinkedSearch
            query={query}
            setQuery={setQuery}
            searching={searching}
            results={results}
            searchError={searchError}
            businessNumber={businessNumber}
            busyId={busyId}
            onSearch={runSearch}
            onLink={link}
          />
          <CreateSection clientId={clientId} ours={ours} busyId={busyId} onLink={link} onCreated={load} />
        </div>
      )}
    </div>
  );
}

function LinkedView({
  clientId,
  state,
  canEdit,
  isAdmin,
  unlinking,
  infoLoading,
  ours,
  onUnlink,
  onSynced,
}: {
  clientId: string;
  state: LinkState;
  canEdit: boolean;
  isAdmin: boolean;
  unlinking: boolean;
  infoLoading: boolean;
  ours: ClientOursForSync;
  onUnlink: () => void;
  onSynced: () => void;
}) {
  const info = state.info;
  return (
    <div className="space-y-2">
      {info ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-gray-500">거래처명</dt>
          <dd className="font-semibold text-gray-900">{info.name || '—'}</dd>
          {info.business_number ? (
            <>
              <dt className="text-gray-500">사업자번호</dt>
              <dd className="tabular-nums text-gray-800">{info.business_number}</dd>
            </>
          ) : null}
          {info.manager ? (
            <>
              <dt className="text-gray-500">담당</dt>
              <dd className="text-gray-800">{info.manager}</dd>
            </>
          ) : null}
          {info.branch ? (
            <>
              <dt className="text-gray-500">지점</dt>
              <dd className="text-gray-800">{info.branch}</dd>
            </>
          ) : null}
        </dl>
      ) : state.infoError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          연결됨 (ID {state.blueholeClientId}). 정보 조회 실패: {state.infoError}
        </div>
      ) : infoLoading ? (
        <p className="text-sm text-gray-400">연결됨 (ID {state.blueholeClientId}) · 블루홀 정보 불러오는 중…</p>
      ) : (
        <p className="text-sm text-gray-600">연결됨 (ID {state.blueholeClientId})</p>
      )}

      <CasesSection clientId={clientId} />

      <LogsSection clientId={clientId} isAdmin={isAdmin} />

      {canEdit && info?.values && (
        <SyncSection
          clientId={clientId}
          bhValues={info.values}
          ours={ours}
          lastSync={state.lastSync}
          onSynced={onSynced}
        />
      )}

      {canEdit && (
        <div className="pt-1">
          <button type="button" onClick={onUnlink} disabled={unlinking} className={portalBtnDanger}>
            {unlinking ? '해제 중…' : '연결 해제'}
          </button>
        </div>
      )}
    </div>
  );
}

interface BhCaseRow {
  id: string;
  subject: string;
  status?: string;
  status_code?: string;
  priority?: string;
  due_date?: string;
  start_date?: string;
  assigned_name?: string;
  url?: string;
}

function CasesSection({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cases, setCases] = useState<BhCaseRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/clients/${clientId}/bluehole/cases`, { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '케이스 조회 실패');
      if (data.error) setError(data.error as string);
      setCases((data.cases as BhCaseRow[]) || []);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '케이스 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) void load();
  };

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between text-left">
        <span className="text-xs font-bold text-slate-600">블루홀 케이스(업무)</span>
        <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-2">
          {loading ? (
            <p className="py-2 text-xs text-slate-400">불러오는 중…</p>
          ) : error ? (
            <div className={portalAlertError}>{error}</div>
          ) : cases.length === 0 ? (
            <p className="py-2 text-xs text-slate-400">연결된 케이스가 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {cases.map((c) => (
                <li key={c.id}>
                  <a
                    href={c.url || `https://bluehole.world/case/info/${c.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border border-slate-100 bg-white px-3 py-2 hover:border-blue-300 hover:shadow-sm transition-shadow"
                  >
                    <p className="truncate text-sm font-semibold text-slate-800">{c.subject || '(제목 없음)'}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
                      {(c.status || c.status_code) && <span>{c.status || c.status_code}</span>}
                      {c.due_date && <span>· 마감 {c.due_date}</span>}
                      {c.assigned_name && <span>· {c.assigned_name}</span>}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface BhLogEntry {
  id: string;
  at: string;
  action: string;
  userName: string;
  changes: Record<string, string>;
  successCols: string[];
  warnings: string[];
}

function LogsSection({ clientId, isAdmin }: { clientId: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<BhLogEntry[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/clients/${clientId}/bluehole/logs`, { cache: 'no-store' });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '로그 조회 실패');
      setLogs((data.logs as BhLogEntry[]) || []);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) void load();
  };

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <button type="button" onClick={toggle} className="flex w-full items-center justify-between text-left">
        <span className="text-xs font-bold text-slate-600">변경 로그</span>
        <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-2">
          {loading ? (
            <p className="py-2 text-xs text-slate-400">불러오는 중…</p>
          ) : error ? (
            <div className={portalAlertError}>{error}</div>
          ) : logs.length === 0 ? (
            <p className="py-2 text-xs text-slate-400">변경 기록이 없습니다.</p>
          ) : (
            <ul className="space-y-1.5">
              {logs.map((l) => {
                const cols = (l.successCols.length ? l.successCols : Object.keys(l.changes))
                  .map(columnLabel)
                  .join(', ');
                return (
                  <li key={l.id} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${actionBadge(l.action)}`}>
                        {actionLabel(l.action)}
                      </span>
                      <span className="text-xs text-slate-500">{new Date(l.at).toLocaleString('ko-KR')}</span>
                      {l.userName && <span className="text-xs font-medium text-slate-600">· {l.userName}</span>}
                    </div>
                    {cols && <p className="mt-1 text-xs text-slate-600">{cols}</p>}
                    {l.warnings.length > 0 && (
                      <p className="mt-0.5 text-xs text-amber-700">{l.warnings.join(' / ')}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {isAdmin && (
            <Link
              href="/admin/bluehole-logs"
              className="mt-2 inline-block text-xs font-semibold text-blue-700 hover:text-blue-800"
            >
              전체 감사 로그 보기 →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function SyncSection({
  clientId,
  bhValues,
  ours,
  lastSync,
  onSynced,
}: {
  clientId: string;
  bhValues: Record<string, string>;
  ours: ClientOursForSync;
  lastSync?: LastSync | null;
  onSynced: () => void;
}) {
  // 우리 값이 있고 블루홀 값과 다른 항목만 후보
  const candidates = CLIENT_SYNC_FIELDS.map((f) => {
    const ourVal = (ours[f.ours] || '').trim();
    const bhVal = (bhValues[f.col] || '').trim();
    return { ...f, ourVal, bhVal, diff: !!ourVal && ourVal !== bhVal };
  }).filter((c) => c.diff);

  const [selected, setSelected] = useState<Record<string, boolean>>(
    () => Object.fromEntries(candidates.map((c) => [c.col, true])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ successCols: string[]; warnings: string[] } | null>(null);

  const toggle = (col: string) => setSelected((s) => ({ ...s, [col]: !s[col] }));

  const pushSelected = useCallback(async () => {
    const changes: Record<string, string> = {};
    for (const c of candidates) if (selected[c.col]) changes[c.col] = c.ourVal;
    const cols = Object.keys(changes);
    if (cols.length === 0) {
      setError('반영할 항목을 선택하세요.');
      return;
    }
    const labels = candidates.filter((c) => selected[c.col]).map((c) => c.label).join(', ');
    if (!confirm(`다음 항목을 블루홀에 반영할까요?\n\n${labels}\n\n(블루홀 실데이터가 수정됩니다)`)) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/bluehole/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error((data.error as string) || '반영 실패');
      setResult({
        successCols: (data.successCols as string[]) || [],
        warnings: (data.warnings as string[]) || [],
      });
      onSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : '반영 실패');
    } finally {
      setBusy(false);
    }
  }, [candidates, selected, clientId, onSynced]);

  return (
    <div className="mt-1 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <p className="text-xs font-bold text-slate-600">블루홀로 수정 반영</p>

      {candidates.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">우리 정보와 블루홀 정보가 일치합니다. 반영할 변경이 없습니다.</p>
      ) : (
        <>
          <ul className="mt-2 space-y-1.5">
            {candidates.map((c) => (
              <li key={c.col} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={!!selected[c.col]}
                  onChange={() => toggle(c.col)}
                  className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                />
                <div className="min-w-0 text-xs leading-relaxed">
                  <span className="font-semibold text-slate-700">{c.label}</span>{' '}
                  <span className={c.mono ? 'tabular-nums text-slate-400 line-through' : 'text-slate-400 line-through'}>
                    {c.bhVal || '(빈값)'}
                  </span>{' '}
                  <span className="text-slate-400">→</span>{' '}
                  <span className={c.mono ? 'tabular-nums font-semibold text-emerald-700' : 'font-semibold text-emerald-700'}>
                    {c.ourVal}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" onClick={pushSelected} disabled={busy} className={`${portalBtnPrimary} mt-2.5`}>
            {busy ? '반영 중…' : '선택 항목 블루홀에 반영'}
          </button>
        </>
      )}

      {error && <div className={`${portalAlertError} mt-2`}>{error}</div>}

      {result && (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
          {result.successCols.length > 0 && <p>반영 완료: {result.successCols.join(', ')}</p>}
          {result.warnings.length > 0 && <p className="text-amber-800">{result.warnings.join(' / ')}</p>}
          {result.successCols.length === 0 && result.warnings.length === 0 && <p>처리되었습니다.</p>}
        </div>
      )}

      {lastSync && !result && (
        <p className="mt-2 text-[11px] text-slate-400">
          최근 반영: {new Date(lastSync.at).toLocaleString('ko-KR')}
          {lastSync.userName ? ` · ${lastSync.userName}` : ''}
          {lastSync.successCols.length ? ` · ${lastSync.successCols.length}개 컬럼` : ''}
        </p>
      )}
    </div>
  );
}

function CreateSection({
  clientId,
  ours,
  busyId,
  onLink,
  onCreated,
}: {
  clientId: string;
  ours: ClientOursForSync;
  busyId: string;
  onLink: (bhId: string) => void;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState<BhCandidate[] | null>(null);
  const [ntsWarning, setNtsWarning] = useState<{ status: string; statusCode: string } | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => buildBlueholeCreatePrefill(ours));

  useEffect(() => {
    setValues(buildBlueholeCreatePrefill(ours));
  }, [ours]);

  const setField = (col: string, v: string) => setValues((prev) => ({ ...prev, [col]: v }));

  // 그룹 순서 유지하며 필드 묶기
  const groups: { group: string; fields: typeof BLUEHOLE_CREATE_FIELDS }[] = [];
  for (const f of BLUEHOLE_CREATE_FIELDS) {
    let g = groups.find((x) => x.group === f.group);
    if (!g) {
      g = { group: f.group, fields: [] };
      groups.push(g);
    }
    g.fields.push(f);
  }

  const submit = useCallback(
    async (force: boolean) => {
      if (
        !confirm(
          force
            ? '중복 가능성이 있는데도 블루홀에 새 거래처를 생성할까요?\n(블루홀은 삭제가 불가능하여 영구 생성됩니다)'
            : '블루홀에 새 거래처를 생성할까요?\n(블루홀은 삭제가 불가능하여 영구 생성됩니다)',
        )
      )
        return;
      setBusy(true);
      setError('');
      try {
        const res = await fetch(`/api/clients/${clientId}/bluehole/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force, values }),
        });
        const data = await readJson(res);
        if (res.status === 409 && data.duplicate) {
          setDuplicates((data.candidates as BhCandidate[]) || []);
          return;
        }
        if (res.status === 409 && data.ntsWarning) {
          const s = (data.ntsStatus as { status?: string; statusCode?: string }) || {};
          setNtsWarning({ status: s.status || '', statusCode: s.statusCode || '' });
          return;
        }
        if (!res.ok) throw new Error((data.error as string) || '생성 실패');
        onCreated();
      } catch (e) {
        setError(e instanceof Error ? e.message : '생성 실패');
      } finally {
        setBusy(false);
      }
    },
    [clientId, onCreated, values],
  );

  const nameEmpty = !(values.name || '').trim();

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={portalBtnSecondary}>
          블루홀에 새 거래처로 등록
        </button>
      ) : (
        <div className="space-y-2.5">
          <p className="text-xs font-bold text-slate-600">블루홀 신규 등록</p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
            ⚠ 블루홀은 <b>거래처 삭제 기능이 없어</b> 한번 생성하면 되돌릴 수 없습니다. 기존 거래처가 있으면 신규 등록 대신 <b>연결</b>을 사용하세요.
          </div>

          {!duplicates && !ntsWarning && (
            <div className="space-y-2.5 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
              <p className="text-[11px] text-slate-400">수임처 정보로 채워졌습니다. 필요한 항목을 직접 수정·추가하세요.</p>
              {groups.map((g) => (
                <fieldset key={g.group} className="space-y-1.5">
                  <legend className="text-[11px] font-bold text-slate-500">{g.group}</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {g.fields.map((f) => (
                      <label key={f.col} className="block text-[11px]">
                        <span className="text-slate-500">
                          {f.label}
                          {f.col === 'name' && <span className="text-red-500"> *</span>}
                        </span>
                        <input
                          type={f.type === 'date' ? 'date' : 'text'}
                          value={values[f.col] ?? ''}
                          onChange={(e) => setField(f.col, e.target.value)}
                          className={`mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300 ${
                            f.mono ? 'tabular-nums' : ''
                          }`}
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}

          {ntsWarning ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-900">
                국세청 조회 결과 <b>{ntsWarning.statusCode === '03' ? '폐업' : ntsWarning.statusCode === '02' ? '휴업' : ntsWarning.status}</b> 상태입니다.
                정말 블루홀에 신규 등록하시겠어요? (휴/폐업 거래처는 등록 전 확인을 권장합니다)
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => submit(true)} disabled={busy} className={portalBtnDanger}>
                  {busy ? '생성 중…' : '상태 경고 무시하고 등록'}
                </button>
                <button type="button" onClick={() => setNtsWarning(null)} disabled={busy} className={portalBtnSecondary}>
                  취소
                </button>
              </div>
            </div>
          ) : duplicates && duplicates.length > 0 ? (
            <div className="space-y-2">
              <div className={portalAlertError}>
                같은 사업자번호의 블루홀 거래처가 이미 있습니다. 새로 만들지 말고 연결을 권장합니다.
              </div>
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 bg-white">
                {duplicates.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{c.name}</p>
                      <p className="mt-0.5 truncate text-xs text-gray-500">{c.business_number || '—'}</p>
                    </div>
                    <button type="button" onClick={() => onLink(c.id)} disabled={!!busyId} className={portalBtnPrimary}>
                      {busyId === c.id ? '연결 중…' : '연결'}
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => submit(true)} disabled={busy} className={portalBtnDanger}>
                {busy ? '생성 중…' : '중복 무시하고 새로 등록'}
              </button>
            </div>
          ) : (
            <>
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                />
                <span>위 정보로 블루홀에 <b>영구 생성</b>됨을 이해했습니다.</span>
              </label>
              {nameEmpty && <p className="text-xs text-red-600">거래처명을 입력하세요.</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => submit(false)}
                  disabled={busy || !agree || nameEmpty}
                  className={portalBtnPrimary}
                >
                  {busy ? '등록 중…' : '중복 확인 후 등록'}
                </button>
                <button type="button" onClick={() => setOpen(false)} disabled={busy} className={portalBtnSecondary}>
                  취소
                </button>
              </div>
            </>
          )}

          {error && <div className={portalAlertError}>{error}</div>}
        </div>
      )}
    </div>
  );
}

function UnlinkedSearch({
  query,
  setQuery,
  searching,
  results,
  searchError,
  businessNumber,
  busyId,
  onSearch,
  onLink,
}: {
  query: string;
  setQuery: (v: string) => void;
  searching: boolean;
  results: BhSearchItem[] | null;
  searchError: string;
  businessNumber?: string;
  busyId: string;
  onSearch: () => void;
  onLink: (bhId: string) => void;
}) {
  const normalizedBiz = (businessNumber || '').replace(/\D/g, '');
  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSearch();
          }}
          placeholder="상호 또는 블루홀 거래처 ID/주소"
          className={`${portalInput} flex-1`}
        />
        <button type="button" onClick={onSearch} disabled={searching || !query.trim()} className={portalBtnPrimary}>
          {searching ? '검색 중…' : '검색'}
        </button>
      </div>

      {/^\d+$/.test(query.trim()) || query.includes('client/info/') ? (
        <button type="button" onClick={() => onLink(query.trim())} disabled={!!busyId} className={portalBtnSecondary}>
          이 ID/주소로 바로 연결
        </button>
      ) : null}

      {searchError && <div className={portalAlertError}>{searchError}</div>}

      {results && (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100">
          {results.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-gray-400">검색 결과가 없습니다.</li>
          ) : (
            results.map((c) => {
              const bizMatch = normalizedBiz && (c.business_number || '').replace(/\D/g, '') === normalizedBiz;
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {c.name}
                      {c.aka ? <span className="ml-1 font-normal text-gray-400">({c.aka})</span> : null}
                      {bizMatch ? (
                        <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                          사업자번호 일치
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {[c.business_number, c.manager_name, c.branch_name].filter(Boolean).join(' · ') || '정보 없음'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLink(c.id)}
                    disabled={!!busyId}
                    className={portalBtnSecondary}
                  >
                    {busyId === c.id ? '연결 중…' : '연결'}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
