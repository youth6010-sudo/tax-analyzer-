'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import PortalPageShell, { PortalPageHeader } from '../../components/portal/PortalPageShell';
import {
  portalAlertInfo,
  portalBtnPrimary,
  portalBtnSecondary,
  portalCard,
} from '../../components/portal/uiClasses';
import type { TaxTypeId } from '../../config/taxTypes';
import { getClientDouzoneCode } from '@/app/utils/clientsGrouping';
import {
  FILING_TAXES,
  VAT_PHASES,
  defaultPeriod,
  extractSpecialFilings,
  filingTargets,
  getCycle,
  normalizeBizNo,
  parseHometaxFile,
  parsePeriodKey,
  periodKey,
  periodLabel,
  specialFilingKey,
  type FilingPeriod,
  type SpecialFiling,
  type VatPhase,
} from '@/app/utils/filingCheck';
import { hydratePortal, usePortalClients } from '@/app/utils/portalStore';

const inputCls =
  'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20';

// 신고때마다 저장하는 단위 데이터
type CheckRecord = {
  overrides: Record<string, boolean>; // 수동 체크 오버라이드
  excelBizNos: string[]; // 홈택스 접수목록 사업자번호(10자리)
  fileName: string;
  diffReason: string;
  done: boolean;
  specialFilings: SpecialFiling[]; // 자동 감지된 수정·기한후 신고
  specialReasons: Record<string, string>; // 특이신고별 사유 (key = bizNo|type)
};

const EMPTY_RECORD: CheckRecord = {
  overrides: {},
  excelBizNos: [],
  fileName: '',
  diffReason: '',
  done: false,
  specialFilings: [],
  specialReasons: {},
};

const STORAGE_PREFIX = 'filingCheck:v1:';

function readRecord(keyId: string): CheckRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + keyId);
    if (!raw) return null;
    return { ...EMPTY_RECORD, ...(JSON.parse(raw) as Partial<CheckRecord>) };
  } catch {
    return null;
  }
}

function writeRecord(keyId: string, record: CheckRecord): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PREFIX + keyId, JSON.stringify(record));
  } catch {
    /* quota */
  }
}

// 같은 세목의 직전(가장 최근 이전 기간) 신고 기록 찾기 — 자동 불러오기용
function findPreviousFiling(
  taxId: TaxTypeId,
  currentPk: string,
): { record: CheckRecord; key: string } | null {
  if (typeof window === 'undefined') return null;
  const prefix = `${STORAGE_PREFIX}${taxId}:`;
  let bestKey = '';
  let bestRec: CheckRecord | null = null;
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(prefix)) continue;
    const pk = k.slice(prefix.length);
    if (pk >= currentPk) continue; // 현재보다 이전 기간만
    if (pk > bestKey) {
      try {
        const rec = JSON.parse(localStorage.getItem(k) || 'null') as CheckRecord | null;
        if (rec) {
          bestKey = pk;
          bestRec = rec;
        }
      } catch {
        /* skip */
      }
    }
  }
  return bestRec ? { record: bestRec, key: bestKey } : null;
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tone}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="mt-0.5 text-2xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

export default function FilingCheckPage() {
  const clients = usePortalClients();
  const [tax, setTax] = useState<TaxTypeId>('withholding');
  const [period, setPeriod] = useState<FilingPeriod>(() => defaultPeriod());
  const [record, setRecord] = useState<CheckRecord>(EMPTY_RECORD);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [carriedFrom, setCarriedFrom] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cycle = getCycle(tax);
  const taxLabel = FILING_TAXES.find(t => t.id === tax)?.label ?? '';
  const keyId = `${tax}:${periodKey(tax, period)}`;
  const loadedKeyRef = useRef<string>('');

  useEffect(() => {
    hydratePortal();
  }, []);

  // 세목·기간이 바뀌면 저장된 기록을 불러오고,
  // 저장된 게 없으면 직전 신고 기준으로 무조건 불러온다(특이사항·사유 승계).
  // 단, 접수 자체(엑셀/체크)는 신고분마다 새로 받으므로 가져오지 않는다.
  useEffect(() => {
    const saved = readRecord(keyId);
    if (saved) {
      setRecord(saved);
      setCarriedFrom(null);
    } else {
      const prev = findPreviousFiling(tax, periodKey(tax, period));
      if (prev) {
        setRecord({
          ...EMPTY_RECORD,
          diffReason: prev.record.diffReason,
          specialReasons: prev.record.specialReasons ?? {},
        });
        setCarriedFrom(periodLabel(tax, parsePeriodKey(tax, prev.key)));
      } else {
        setRecord(EMPTY_RECORD);
        setCarriedFrom(null);
      }
    }
    loadedKeyRef.current = keyId;
    setParseError('');
    setCopied(false);
    if (fileRef.current) fileRef.current.value = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyId]);

  // 기록 변경 시 즉시 저장(매번 신고분 저장). 로드 직후 stale 저장 방지를 위해 keyId를 넘겨 직접 기록.
  const patchRecord = (patch: Partial<CheckRecord>) => {
    setRecord(prev => {
      const next = { ...prev, ...patch };
      writeRecord(keyId, next);
      setSavedTick(true);
      window.setTimeout(() => setSavedTick(false), 1200);
      return next;
    });
  };

  const handleTaxChange = (next: TaxTypeId) => {
    if (next === tax) return;
    setTax(next);
  };

  const targets = useMemo(() => {
    return filingTargets(clients, tax).sort((a, b) => {
      const ca = getClientDouzoneCode(a);
      const cb = getClientDouzoneCode(b);
      if (ca && cb) {
        const da = ca.replace(/\D/g, '');
        const db = cb.replace(/\D/g, '');
        if (da && db) return parseInt(da, 10) - parseInt(db, 10);
        return ca.localeCompare(cb, 'ko', { numeric: true });
      }
      if (ca) return -1;
      if (cb) return 1;
      return (a.companyName || '').localeCompare(b.companyName || '', 'ko');
    });
  }, [clients, tax]);

  const excelSet = useMemo(() => new Set(record.excelBizNos), [record.excelBizNos]);
  const isReceived = (id: string, bizNo: string) =>
    record.overrides[id] ?? excelSet.has(normalizeBizNo(bizNo));

  const receivedCount = targets.filter(c => isReceived(c.id, c.businessNo)).length;
  const targetCount = targets.length;
  const diff = targetCount - receivedCount;
  const notReceived = targets.filter(c => !isReceived(c.id, c.businessNo));

  const extraCount = useMemo(() => {
    if (excelSet.size === 0) return 0;
    const targetBiz = new Set(targets.map(c => normalizeBizNo(c.businessNo)).filter(Boolean));
    let n = 0;
    for (const b of excelSet) if (!targetBiz.has(b)) n += 1;
    return n;
  }, [excelSet, targets]);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    setParseError('');
    try {
      const { bizNos, filings } = await parseHometaxFile(file);
      const special = extractSpecialFilings(filings);
      // 이전에 적어둔 사유 중 이번에도 존재하는 항목은 보존
      const keptReasons: Record<string, string> = {};
      for (const s of special) {
        const k = specialFilingKey(s.bizNo, s.type);
        if (record.specialReasons[k]) keptReasons[k] = record.specialReasons[k];
      }
      patchRecord({
        excelBizNos: bizNos,
        overrides: {},
        fileName: file.name,
        done: false,
        specialFilings: special,
        specialReasons: keptReasons,
      });
    } catch {
      setParseError('엑셀을 읽지 못했습니다. 홈택스 접수목록 파일(.xlsx/.xls)인지 확인해 주세요.');
    } finally {
      setParsing(false);
    }
  };

  const setSpecialReason = (key: string, value: string) => {
    patchRecord({ specialReasons: { ...record.specialReasons, [key]: value } });
  };

  const summary = useMemo(() => {
    const lines = [
      `[신고대상확인] ${taxLabel} · ${periodLabel(tax, period)}`,
      `· 신고대상: ${targetCount}곳`,
      `· 접수완료: ${receivedCount}곳`,
      `· 차이: ${diff}곳`,
    ];
    const note = record.diffReason.trim();
    if (diff !== 0) {
      lines.push(`· 차이 사유: ${note || '미기재'}`);
    } else if (note) {
      lines.push(`· 특이사항: ${note}`);
    }
    if (record.specialFilings.length > 0) {
      lines.push('· 수정·기한후·경정청구 신고');
      for (const s of record.specialFilings) {
        const reason = record.specialReasons[specialFilingKey(s.bizNo, s.type)]?.trim();
        lines.push(`  - ${s.name || s.bizNo} ${s.type} ${s.count}건${reason ? ` (${reason})` : ''}`);
      }
    }
    if (notReceived.length > 0) {
      lines.push(`· 미접수: ${notReceived.map(c => c.companyName || '(이름없음)').join(', ')}`);
    }
    if (extraCount > 0) {
      lines.push(`· 접수목록 중 비대상: ${extraCount}건`);
    }
    return lines.join('\n');
  }, [
    taxLabel,
    tax,
    period,
    targetCount,
    receivedCount,
    diff,
    record.diffReason,
    record.specialFilings,
    record.specialReasons,
    notReceived,
    extraCount,
  ]);

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const years = (() => {
    const y = new Date().getFullYear();
    return [y + 1, y, y - 1, y - 2];
  })();

  return (
    <PortalPageShell>
      <PortalPageHeader
        title="신고대상확인"
        description="세목·기간별 신고대상 대비 홈택스 접수 현황을 대조하고 요약을 만듭니다. (신고분별 자동 저장)"
        icon="✅"
      />

      {/* 세목 탭 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILING_TAXES.map(t => {
          const active = t.id === tax;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTaxChange(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-bold transition-all ${
                active
                  ? 'border-blue-400 bg-blue-50 text-blue-700 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50/50'
              }`}
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 기간 + 엑셀 업로드 */}
      <div className={`${portalCard} mb-4 flex flex-wrap items-center gap-3 p-4`}>
        <span className="text-sm font-semibold text-slate-700">기간</span>
        <select
          value={period.year}
          onChange={e => setPeriod(p => ({ ...p, year: Number(e.target.value) }))}
          className={inputCls}
        >
          {years.map(y => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        {cycle === 'month' && (
          <select
            value={period.month}
            onChange={e => setPeriod(p => ({ ...p, month: Number(e.target.value) }))}
            className={inputCls}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
        )}
        {cycle === 'vat' && (
          <select
            value={period.vatPhase}
            onChange={e => setPeriod(p => ({ ...p, vatPhase: e.target.value as VatPhase }))}
            className={inputCls}
          >
            {VAT_PHASES.map(ph => (
              <option key={ph} value={ph}>
                {ph}
              </option>
            ))}
          </select>
        )}

        {savedTick && <span className="text-xs font-medium text-emerald-600">저장됨 ✓</span>}

        <div className="ml-auto flex items-center gap-2">
          {record.fileName && (
            <span className="max-w-[12rem] truncate text-xs text-slate-500">{record.fileName}</span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => void handleUpload(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className={portalBtnSecondary}
          >
            {parsing ? '읽는 중…' : '홈택스 접수목록 업로드'}
          </button>
          {(excelSet.size > 0 || Object.keys(record.overrides).length > 0 || record.done) && (
            <button
              type="button"
              onClick={() => {
                patchRecord(EMPTY_RECORD);
                if (fileRef.current) fileRef.current.value = '';
              }}
              className={portalBtnSecondary}
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {parseError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {parseError}
        </div>
      )}

      {/* 특이사항(차이 사유) — 항상 상단에 표시, 다음 신고 때 자동 불러오기 */}
      <div className="mb-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <label className="text-sm font-semibold text-slate-700">특이사항 · 차이 사유</label>
          {carriedFrom && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              지난 신고({carriedFrom}) 특이사항 불러옴
            </span>
          )}
        </div>
        <textarea
          value={record.diffReason}
          onChange={e => patchRecord({ diffReason: e.target.value })}
          placeholder="예) 폐업 신고 예정 · 무실적 · 자료 미수취 등 — 다음 신고 때 자동으로 불러옵니다"
          rows={2}
          className="w-full rounded-xl border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-300/40"
        />
      </div>

      {/* 자동 감지: 수정·기한후 신고 → 항목별 사유 기재 */}
      {record.specialFilings.length > 0 && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
          <p className="mb-2 text-sm font-semibold text-rose-700">
            수정·기한후·경정청구 신고 {record.specialFilings.length}건 — 사유를 적으면 요약에 함께
            들어갑니다.
          </p>
          <div className="space-y-1.5">
            {record.specialFilings.map(s => {
              const k = specialFilingKey(s.bizNo, s.type);
              return (
                <div key={k} className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex min-w-[14rem] items-center gap-1.5 text-sm text-slate-700">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        s.type === '기한후신고'
                          ? 'bg-rose-100 text-rose-700'
                          : s.type === '수정신고'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-sky-100 text-sky-700'
                      }`}
                    >
                      {s.type}
                    </span>
                    <span className="font-semibold text-slate-800">{s.name || s.bizNo}</span>
                    <span className="tabular-nums text-slate-500">{s.count}건</span>
                  </span>
                  <input
                    value={record.specialReasons[k] ?? ''}
                    onChange={e => setSpecialReason(k, e.target.value)}
                    placeholder="사유 (예: 매출 누락 보완, 자료 지연 등)"
                    className="min-w-0 flex-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-300/40"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 현황 */}
      <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-md">
        <StatCard label="신고대상" value={targetCount} tone="border-blue-100 bg-blue-50/60 text-blue-800" />
        <StatCard label="접수완료" value={receivedCount} tone="border-emerald-100 bg-emerald-50/60 text-emerald-800" />
        <StatCard
          label="차이"
          value={diff}
          tone={diff === 0 ? 'border-slate-100 bg-slate-50 text-slate-600' : 'border-rose-100 bg-rose-50/60 text-rose-700'}
        />
      </div>

      {excelSet.size > 0 && (
        <p className={`${portalAlertInfo} mb-4`}>
          접수목록 {excelSet.size}건을 사업자번호로 대조했습니다.
          {extraCount > 0 && ` 이 중 ${extraCount}건은 현재 ${taxLabel} 신고대상 수임처와 일치하지 않습니다.`}
        </p>
      )}

      {/* 대상 목록 */}
      <div className={`${portalCard} overflow-hidden`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <th className="w-12 px-3 py-2 text-center font-semibold">접수</th>
              <th className="w-10 px-2 py-2 text-right font-semibold">#</th>
              <th className="w-24 px-3 py-2 text-left font-semibold">코드</th>
              <th className="px-3 py-2 text-left font-semibold">업체명</th>
              <th className="px-3 py-2 text-left font-semibold">사업자번호</th>
            </tr>
          </thead>
          <tbody>
            {targets.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-slate-400">
                  {taxLabel} 신고대상 수임처가 없습니다.
                </td>
              </tr>
            ) : (
              targets.map((c, i) => {
                const received = isReceived(c.id, c.businessNo);
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-slate-50 ${received ? 'bg-emerald-50/40' : ''}`}
                  >
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={received}
                        onChange={e =>
                          patchRecord({
                            overrides: { ...record.overrides, [c.id]: e.target.checked },
                          })
                        }
                        className="h-4 w-4 accent-emerald-500"
                      />
                    </td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-500">{getClientDouzoneCode(c) || '-'}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold text-slate-800">{c.companyName || '(이름 없음)'}</span>
                      {c.representative && (
                        <span className="ml-1.5 text-xs text-slate-400">{c.representative}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">{c.businessNo || '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 완료 처리 → 요약 */}
      <div className="mt-5 flex items-center gap-3">
        <button type="button" onClick={() => patchRecord({ done: true })} className={portalBtnPrimary}>
          완료 처리
        </button>
        {diff !== 0 && !record.diffReason.trim() && (
          <span className="text-xs text-rose-500">차이가 있어요. 사유를 적으면 요약에 함께 들어갑니다.</span>
        )}
      </div>

      {record.done && (
        <div className={`${portalCard} mt-4 p-4`}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">요약 (블루홀 공유용)</h2>
            <button type="button" onClick={() => void copySummary()} className={portalBtnSecondary}>
              {copied ? '복사됨 ✓' : '복사'}
            </button>
          </div>
          <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
            {summary}
          </pre>
        </div>
      )}
    </PortalPageShell>
  );
}
