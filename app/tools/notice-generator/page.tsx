'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeaderIcon } from '@/app/components/dashboard/SidebarNavIcon';
import { PortalPageHeader } from '@/app/components/portal/PortalPageShell';
import { portalFooterMeta } from '@/app/components/portal/uiClasses';
import { noticePageSplit } from './_components/noticeUi';
import NoticeClientPicker, { type PickedClient } from './_components/NoticeClientPicker';
import NoticeSetupBar from './_components/NoticeSetupBar';
import NoticeCollapsibleSection from './_components/NoticeCollapsibleSection';
import NoticeResultTabs from './_components/NoticeResultTabs';
import CompanyNotesField from './_components/CompanyNotesField';
import PaymentNoticeField from './_components/PaymentNoticeField';
import VatReportField from './_components/VatReportField';
import TemplateEditor from './_components/TemplateEditor';
import OfficialLetterEditor from './_components/OfficialLetterEditor';
import { TAX_TYPES, TAX_TYPE_META } from './_lib/taxTypes';
import { SELECTABLE_YEARS } from './_lib/holidays';
import {
  DEFAULT_TEMPLATE_BY_SCENARIO,
  DEFAULT_VAT_REPORT_TEMPLATE,
  DEFAULT_PAYMENT_NOTICE_TEMPLATE,
  SCENARIO_LABEL,
  VAT_REPORT_TOKENS,
  PAYMENT_NOTICE_TOKENS,
  emptyNoticeTemplateStore,
  type NoticeTemplateStore,
  type TemplateScenario,
  type TemplateSource,
} from './_lib/template';
import {
  DEFAULT_OFFICIAL_LETTER_BY_KIND,
  OFFICIAL_LETTER_LABEL,
  buildOfficialLetterVars,
  legacyTaxKindFromMode,
  normalizeNoticeCategory,
  taxTypeForOfficialKind,
  usesFormalOfficialLayout,
  type NoticeOutputMode,
  type OfficialLetterKind,
} from './_lib/officialLetter';
import {
  defaultOfficialFormBodyForKind,
  resolveOfficialFormId,
  taxKindFromFormId,
} from './_lib/officialFormCatalog';
import type { VatBusinessType } from './_lib/vatBusinessItems';
import { resolveManagerContact } from './_lib/managerContact';
import { useLocalStorage } from './_lib/useLocalStorage';
import { calculateDeadline, defaultMaterialDate } from './_lib/deadline';
import { toISODate } from './_lib/dateUtils';
import {
  renderTemplate,
  formatMaterialDeadlineLine,
  formatMaterialDeadlineNote,
  buildPaymentNoticeHtml,
  buildVatReportHtml,
  calcVatReport,
  hasLocalIncomeTax,
  installmentSchedule,
  htmlToPlainText,
} from './_lib/templates';
import { fetchNoticeTemplateStore, saveNoticeTemplateStore } from './_lib/noticeTemplateClient';
import {
  DEFAULT_MATERIALS_BY_TAX,
  NOTES_EXAMPLE_BY_TAX,
  buildNoticeClientEntry,
  emptyPaymentForTax,
  fetchClientNotice,
  paymentFromNoticeEntry,
  saveClientNotice,
  TAX_TO_DOUZONE_NOTE_KEY,
  vatReportFromNoticeEntry,
  type ClientNoticeMap,
  type NoticeClientData,
} from './_lib/clientNotice';
import type {
  DeadlineParams,
  MaterialDeadline,
  PaymentNotice,
  TaxTypeKey,
  VatReport,
} from './_lib/types';
import { EMPTY_VAT_REPORT } from './_lib/types';
import { currentMonthlyFilingMonth } from '@/lib/periodUtils';

function defaultNoticeParams(): DeadlineParams {
  const { year, month } = currentMonthlyFilingMonth();
  const min = SELECTABLE_YEARS[0];
  const max = SELECTABLE_YEARS[SELECTABLE_YEARS.length - 1];
  return {
    year: Math.min(Math.max(year, min), max),
    month,
    vatPeriodId: '1-final',
    fyEndMonth: 12,
    filingTypeId: 'general',
  };
}

type SelectedClient = {
  id: string;
  intakeData: Record<string, unknown>;
  noticeMap: ClientNoticeMap;
};

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

function withTaxEntry(
  client: SelectedClient,
  tax: TaxTypeKey,
  entry: NoticeClientData,
): SelectedClient {
  const noticeMap = { ...client.noticeMap, [tax]: entry };
  return { ...client, noticeMap };
}

export default function NoticeGeneratorPage() {
  // 세션 입력값 (수임처 미연결 시 전역 스크래치 — localStorage)
  const [taxType, setTaxType] = useLocalStorage<TaxTypeKey>('tng.taxType', TAX_TYPES.VAT);
  const [outputModeRaw, setOutputModeRaw] = useLocalStorage<string>('tng.outputMode', 'message');
  const [officialTaxKind, setOfficialTaxKind] = useLocalStorage<OfficialLetterKind>(
    'tng.officialTaxKind',
    'vat',
  );
  const outputMode = normalizeNoticeCategory(outputModeRaw) as NoticeOutputMode;

  useEffect(() => {
    const legacy = legacyTaxKindFromMode(outputModeRaw);
    if (legacy) {
      setOutputModeRaw('official');
      setOfficialTaxKind(legacy);
      return;
    }
    const normalized = normalizeNoticeCategory(outputModeRaw);
    if (outputModeRaw !== normalized) {
      setOutputModeRaw(normalized);
    }
  }, [outputModeRaw, setOutputModeRaw, setOfficialTaxKind]);

  const setOutputMode = (mode: NoticeOutputMode) => setOutputModeRaw(mode);
  const [vatBusinessType, setVatBusinessType] = useLocalStorage<VatBusinessType>(
    'tng.vatBusinessType',
    'individual',
  );
  const [sessionUser, setSessionUser] = useState<{
    name: string;
    loginId: string;
    adminMode?: boolean;
  } | null>(null);
  /** 전역 기본 서식 (리아 관리자 편집 가능) */
  const [globalDefaults, setGlobalDefaults] = useState({
    general: DEFAULT_TEMPLATE_BY_SCENARIO.general,
    withholding_request: DEFAULT_TEMPLATE_BY_SCENARIO.withholding_request,
    withholding_filing: DEFAULT_TEMPLATE_BY_SCENARIO.withholding_filing,
    vatReport: DEFAULT_VAT_REPORT_TEMPLATE,
    paymentNotice: DEFAULT_PAYMENT_NOTICE_TEMPLATE,
  });
  const [defaultSaveState, setDefaultSaveState] = useState<
    'idle' | 'dirty' | 'saving' | 'saved' | 'error'
  >('idle');
  const globalDefaultsRef = useRef(globalDefaults);
  globalDefaultsRef.current = globalDefaults;
  const [companyName, setCompanyName] = useLocalStorage('tng.company', '');
  const [notes, setNotes] = useLocalStorage('tng.notes', '');
  // 기본값은 비움 — 비었을 때는 세목별 예시를 연한 글씨(placeholder)로 안내
  const [materials, setMaterials] = useLocalStorage('tng.materials', '');

  // 안내문 서식(HTML) — 담당자(로그인 계정)별 서버 저장(시나리오별) + 기본/내 서식 선택
  const [templateStore, setTemplateStore] = useState<NoticeTemplateStore>(emptyNoticeTemplateStore);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [templateSaveState, setTemplateSaveState] = useState<SaveState>('idle');
  const [vatTemplateSaveState, setVatTemplateSaveState] = useState<SaveState>('idle');
  const [paymentTemplateSaveState, setPaymentTemplateSaveState] = useState<SaveState>('idle');
  const [officialTemplateSaveState, setOfficialTemplateSaveState] = useState<SaveState>('idle');
  const templateStoreRef = useRef(templateStore);
  // 매 렌더 ref=state 동기화 금지 — blur/저장 사이 중간 렌더가 옛 값으로 ref를 덮어 저장 실패함
  const templateDirtyRef = useRef(false);

  /** setState 전에 ref 즉시 갱신 — 저장 클릭 시 옛 값 저장 방지 */
  const patchTemplateStore = (next: NoticeTemplateStore) => {
    templateStoreRef.current = next;
    setTemplateStore(next);
  };

  // 원천세 급여대장 작성 여부 (수임처 미연결 시 localStorage)
  const [localPayrollByUs, setLocalPayrollByUs] = useLocalStorage('tng.payrollByUs', false);
  const [clientPayrollByUs, setClientPayrollByUs] = useState(false);

  // 자료 제출 마감 (브라우저별 작성 입력값) — 모든 세목에서 항시 표시·항상 ON
  const [materialDeadline, setMaterialDeadline] = useLocalStorage<MaterialDeadline>(
    'tng.materialDeadline',
    { enabled: true, date: '', hour: 13, minute: 0 },
  );

  // 신고 결과 안내(납부세액) — 수임처 미연결 시 세션 전용, 연결 시 세목별 DB 저장
  const [payment, setPayment] = useState<PaymentNotice>(() => emptyPaymentForTax(taxType));

  // 부가세 신고 결과 보고 및 검토 — 수임처 연결 시 세목별 DB 저장
  const [vatReport, setVatReport] = useState<VatReport>(EMPTY_VAT_REPORT);
  /** 부가세만: 신고결과보고 최종세액 → 납부금액 자동 연동 (수동 수정 시 해제) */
  const [vatPaymentLinked, setVatPaymentLinked] = useState(true);

  const [params, setParams] = useLocalStorage<DeadlineParams>('tng.params', defaultNoticeParams());

  // 수임처 연결 모드 상태
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);
  const [clientCompanyName, setClientCompanyName] = useState('');
  const [clientMaterials, setClientMaterials] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [clientDirty, setClientDirty] = useState(false);
  const clientLoadGen = useRef(0);
  const clientSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedClientRef = useRef<SelectedClient | null>(null);
  const taxTypeRef = useRef(taxType);
  const clientMaterialsRef = useRef(clientMaterials);
  const clientNotesRef = useRef(clientNotes);
  const clientPayrollByUsRef = useRef(false);
  const paymentRef = useRef(payment);
  const vatReportRef = useRef(vatReport);
  const vatPaymentLinkedRef = useRef(vatPaymentLinked);
  selectedClientRef.current = selectedClient;
  taxTypeRef.current = taxType;
  paymentRef.current = payment;
  vatReportRef.current = vatReport;
  vatPaymentLinkedRef.current = vatPaymentLinked;

  const inClientMode = selectedClient !== null;
  const effectiveCompanyName = inClientMode ? clientCompanyName : companyName;
  const effectiveMaterials = inClientMode ? clientMaterials : materials;
  const effectiveNotes = inClientMode ? clientNotes : notes;

  const loadForTax = (noticeMap: ClientNoticeMap, tax: TaxTypeKey) => {
    const entry = noticeMap[tax];
    const materialsVal = entry?.materials ?? '';
    const notesVal = entry?.notes ?? '';
    const payrollVal = entry?.payrollByUs ?? false;
    clientMaterialsRef.current = materialsVal;
    clientNotesRef.current = notesVal;
    clientPayrollByUsRef.current = payrollVal;
    setClientMaterials(materialsVal);
    setClientNotes(notesVal);
    setClientPayrollByUs(payrollVal);
    setPayment(paymentFromNoticeEntry(entry, tax));
    setVatReport(vatReportFromNoticeEntry(entry));
    setVatPaymentLinked(entry?.vatPaymentLinked ?? tax === TAX_TYPES.VAT);
    setClientDirty(false);
  };

  const clientEntrySnapshot = useCallback(
    (overrides?: Partial<{ materials: string; notes: string; payrollByUs: boolean }>) =>
      buildNoticeClientEntry(
        overrides?.materials ?? clientMaterialsRef.current,
        overrides?.notes ?? clientNotesRef.current,
        overrides?.payrollByUs ?? clientPayrollByUsRef.current,
        paymentRef.current,
        vatReportRef.current,
        vatPaymentLinkedRef.current,
        taxTypeRef.current,
      ),
    [],
  );

  /** 수임처 해제 후 이전 업체 입력값이 화면에 남지 않도록 초기화 */
  const clearClientFormState = useCallback(() => {
    const tax = taxTypeRef.current;
    clientMaterialsRef.current = '';
    clientNotesRef.current = '';
    clientPayrollByUsRef.current = false;
    setClientMaterials('');
    setClientNotes('');
    setClientPayrollByUs(false);
    setClientCompanyName('');
    setPayment(emptyPaymentForTax(tax));
    setVatReport(EMPTY_VAT_REPORT);
    setVatPaymentLinked(tax === TAX_TYPES.VAT);
  }, []);

  const persistCurrentClient = useCallback(
    async (client: SelectedClient, tax: TaxTypeKey, entry: NoticeClientData) => {
      const nextMap = await saveClientNotice(client.id, client.intakeData, tax, entry);
      const douzoneKey = TAX_TO_DOUZONE_NOTE_KEY[tax];
      const prevNotes =
        client.intakeData.notes && typeof client.intakeData.notes === 'object'
          ? (client.intakeData.notes as Record<string, string>)
          : {};
      const nextIntake = {
        ...client.intakeData,
        noticeData: nextMap,
        notes: { ...prevNotes, [douzoneKey]: htmlToPlainText(entry.materials) },
      };
      const updated: SelectedClient = {
        id: client.id,
        intakeData: nextIntake,
        noticeMap: nextMap,
      };
      setSelectedClient(prev => (prev && prev.id === client.id ? updated : prev));
      return updated;
    },
    [],
  );

  const handleSelectClient = async (picked: PickedClient | null) => {
    const leaving = selectedClientRef.current;
    const entryToSave = leaving ? clientEntrySnapshot() : null;
    const taxToSave = taxTypeRef.current;

    if (clientSaveTimer.current) clearTimeout(clientSaveTimer.current);
    clientLoadGen.current += 1;
    const loadGen = clientLoadGen.current;

    // 저장을 기다리지 않고 화면을 먼저 비움 — 이전 거래처 데이터가 남아 보이지 않게
    if (!picked) {
      setSelectedClient(null);
      clearClientFormState();
      setCompanyName('');
      setMaterials('');
      setNotes('');
      setLocalPayrollByUs(false);
      setSaveState('idle');
      setClientDirty(false);
      if (leaving && entryToSave) {
        void persistCurrentClient(leaving, taxToSave, entryToSave).catch(() => {});
      }
      return;
    }

    setSelectedClient({ id: picked.id, intakeData: {}, noticeMap: {} });
    clearClientFormState();
    setClientCompanyName(picked.companyName);
    setSaveState('idle');
    setClientDirty(false);

    if (leaving && entryToSave && leaving.id !== picked.id) {
      void persistCurrentClient(leaving, taxToSave, entryToSave).catch(() => {});
    }

    try {
      const fetched = await fetchClientNotice(picked.id);
      if (loadGen !== clientLoadGen.current) return;
      setSelectedClient({
        id: fetched.id,
        intakeData: fetched.intakeData,
        noticeMap: fetched.noticeMap,
      });
      setClientCompanyName(fetched.companyName || picked.companyName);
      loadForTax(fetched.noticeMap, taxTypeRef.current);
    } catch {
      if (loadGen !== clientLoadGen.current) return;
      setSelectedClient({ id: picked.id, intakeData: {}, noticeMap: {} });
      setClientCompanyName(picked.companyName);
      loadForTax({}, taxTypeRef.current);
      setSaveState('error');
    }
  };

  // 수임처 데이터 저장 — 필요자료·특이사항·급여대장·첨부 서류 문구(세목별)
  const handleSaveClient = async (flushed?: { materials: string; notes: string }) => {
    if (!selectedClient) return;
    const client = selectedClient;
    if (clientSaveTimer.current) clearTimeout(clientSaveTimer.current);
    if (flushed) {
      clientMaterialsRef.current = flushed.materials;
      clientNotesRef.current = flushed.notes;
      setClientMaterials(flushed.materials);
      setClientNotes(flushed.notes);
    }
    setSaveState('saving');
    try {
      await persistCurrentClient(
        client,
        taxType,
        clientEntrySnapshot(
          flushed
            ? { materials: flushed.materials, notes: flushed.notes }
            : undefined,
        ),
      );
      setClientDirty(false);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  const handleSelectTax = (next: TaxTypeKey) => {
    if (next === taxTypeRef.current) return;

    let noticeMap = selectedClient?.noticeMap ?? {};
    if (selectedClient) {
      const entry = clientEntrySnapshot();
      const updated = withTaxEntry(selectedClient, taxType, entry);
      setSelectedClient(updated);
      noticeMap = updated.noticeMap;
      if (clientSaveTimer.current) clearTimeout(clientSaveTimer.current);
      setSaveState('saving');
      void persistCurrentClient(updated, taxType, entry)
        .then(() => {
          setClientDirty(false);
          setSaveState('saved');
        })
        .catch(() => setSaveState('error'));
    }

    setTaxType(next);
    // 세목 전환 즉시 해당 세목 데이터로 교체 (이전 세목 값이 화면에 남지 않게)
    if (selectedClient) {
      loadForTax(noticeMap, next);
    } else {
      setPayment(emptyPaymentForTax(next));
      setVatReport(EMPTY_VAT_REPORT);
      setVatPaymentLinked(next === TAX_TYPES.VAT);
    }
    // 세목을 바꾸면 자료 제출 마감일을 해당 세목 기본값으로 자동 변경
    // (원천세 -3일 / 부가세 -2주 / 종소세 -3주 / 법인세 직전 달 15일)
    const nextDeadline = calculateDeadline(next, params);
    if (nextDeadline) {
      const def = defaultMaterialDate(next, nextDeadline.final);
      lastAutoMaterialDate.current = def;
      setMaterialDeadline(prev => ({ ...prev, enabled: true, date: def }));
    }
  };

  const handleCompanyNameChange = (value: string) => {
    if (inClientMode) setClientCompanyName(value);
    else setCompanyName(value);
  };

  const handleMaterialsChange = (value: string) => {
    if (inClientMode) {
      clientMaterialsRef.current = value;
      setClientMaterials(value);
      setClientDirty(true);
    } else {
      setMaterials(value);
    }
  };

  const handleNotesChange = (value: string) => {
    if (inClientMode) {
      clientNotesRef.current = value;
      setClientNotes(value);
      setClientDirty(true);
    } else {
      setNotes(value);
    }
  };

  const handlePayrollChange = (value: boolean) => {
    if (inClientMode) {
      clientPayrollByUsRef.current = value;
      setClientPayrollByUs(value);
      setSelectedClient(prev => {
        if (!prev) return prev;
        return withTaxEntry(prev, taxType, clientEntrySnapshot({ payrollByUs: value }));
      });
      setClientDirty(true);
    } else {
      setLocalPayrollByUs(value);
    }
  };

  const handlePaymentChange = (next: PaymentNotice | ((prev: PaymentNotice) => PaymentNotice)) => {
    setPayment(prev => (typeof next === 'function' ? next(prev) : next));
    if (selectedClientRef.current) setClientDirty(true);
  };

  const handleVatReportChange = (next: VatReport | ((prev: VatReport) => VatReport)) => {
    setVatReport(prev => (typeof next === 'function' ? next(prev) : next));
    if (selectedClientRef.current) setClientDirty(true);
  };

  const handleVatPaymentUnlink = () => {
    setVatPaymentLinked(false);
    if (selectedClientRef.current) setClientDirty(true);
  };

  const handleVatPaymentRelink = () => {
    setVatPaymentLinked(true);
    if (selectedClientRef.current) setClientDirty(true);
  };

  // 수임처 연결 시 입력 변경을 잠시 모아 서버에 자동 저장
  useEffect(() => {
    if (!selectedClient || !clientDirty) return;
    const loadGen = clientLoadGen.current;
    setSaveState('saving');
    if (clientSaveTimer.current) clearTimeout(clientSaveTimer.current);
    clientSaveTimer.current = setTimeout(() => {
      void (async () => {
        const client = selectedClientRef.current;
        if (!client || loadGen !== clientLoadGen.current) return;
        const entry = clientEntrySnapshot();
        try {
          await persistCurrentClient(client, taxTypeRef.current, entry);
          if (loadGen !== clientLoadGen.current) return;
          setClientDirty(false);
          setSaveState('saved');
        } catch {
          if (loadGen !== clientLoadGen.current) return;
          setSaveState('error');
        }
      })();
    }, 1500);
    return () => {
      if (clientSaveTimer.current) clearTimeout(clientSaveTimer.current);
    };
  }, [
    selectedClient,
    clientDirty,
    clientEntrySnapshot,
    persistCurrentClient,
  ]);

  const handleParamChange = (key: keyof DeadlineParams, value: string | number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  // 마운트 시 담당자 서식 + 전역 기본 서식 로드
  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      fetchNoticeTemplateStore(ac.signal),
      fetch('/api/notice-template/defaults', { credentials: 'same-origin', signal: ac.signal }).then(
        r => (r.ok ? r.json() : null),
      ),
    ])
      .then(([saved, defaultsJson]) => {
        if (ac.signal.aborted) return;
        // 사용자가 이미 편집·저장 중이면 늦게 도착한 초기 로드로 덮지 않음
        if (!templateDirtyRef.current) {
          templateStoreRef.current = saved;
          setTemplateStore(saved);
        }
        const d = defaultsJson?.defaults;
        if (d && typeof d === 'object') {
          setGlobalDefaults(prev => ({
            general: typeof d.general === 'string' && d.general.trim() ? d.general : prev.general,
            withholding_request:
              typeof d.withholding_request === 'string' && d.withholding_request.trim()
                ? d.withholding_request
                : prev.withholding_request,
            withholding_filing:
              typeof d.withholding_filing === 'string' && d.withholding_filing.trim()
                ? d.withholding_filing
                : prev.withholding_filing,
            vatReport:
              typeof d.vatReport === 'string' && d.vatReport.trim() ? d.vatReport : prev.vatReport,
            paymentNotice:
              typeof d.paymentNotice === 'string' && d.paymentNotice.trim()
                ? d.paymentNotice
                : prev.paymentNotice,
          }));
        }
        setTemplateLoaded(true);
      })
      .catch(err => {
        if (err?.name !== 'AbortError') setTemplateLoaded(true);
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/auth/me', { credentials: 'same-origin', signal: ac.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.user?.name) {
          setSessionUser({
            name: data.user.name,
            loginId: data.user.loginId ?? '',
            adminMode: Boolean(data.user.adminMode),
          });
        }
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  const persistTemplateStore = useCallback(async (next: NoticeTemplateStore) => {
    templateStoreRef.current = next;
    templateDirtyRef.current = true;
    setTemplateSaveState('saving');
    setVatTemplateSaveState('saving');
    setPaymentTemplateSaveState('saving');
    setOfficialTemplateSaveState('saving');
    try {
      await saveNoticeTemplateStore(next);
      setTemplateSaveState('saved');
      setVatTemplateSaveState('saved');
      setPaymentTemplateSaveState('saved');
      setOfficialTemplateSaveState('saved');
    } catch {
      setTemplateSaveState('error');
      setVatTemplateSaveState('error');
      setPaymentTemplateSaveState('error');
      setOfficialTemplateSaveState('error');
    }
  }, []);

  const markTemplateDirty = (kind: 'notice' | 'vat' | 'payment' | 'official') => {
    templateDirtyRef.current = true;
    const setState =
      kind === 'vat'
        ? setVatTemplateSaveState
        : kind === 'payment'
          ? setPaymentTemplateSaveState
          : kind === 'official'
            ? setOfficialTemplateSaveState
            : setTemplateSaveState;
    setState(prev => (prev === 'saving' ? prev : 'dirty'));
  };

  const isOfficialMode = outputMode === 'official';
  const usesFormalLayout = usesFormalOfficialLayout(officialTaxKind);
  const periodTaxType = isOfficialMode ? taxTypeForOfficialKind(officialTaxKind) : taxType;
  const officialFormId = useMemo(
    () => resolveOfficialFormId(officialTaxKind, params),
    [officialTaxKind, params.vatPeriodId, params.fyEndMonth, params.filingTypeId],
  );
  const officialEditorKey = usesFormalLayout ? officialFormId : officialTaxKind;

  const deadline = useMemo(
    () => calculateDeadline(periodTaxType, params),
    [periodTaxType, params],
  );

  const isWithholding = taxType === TAX_TYPES.WITHHOLDING;

  const effectivePayrollByUs = inClientMode ? clientPayrollByUs : localPayrollByUs;

  // 현재 활성 시나리오: 원천세는 급여대장 작성 여부로 자료요청/신고안내 분기
  const scenario: TemplateScenario = !isWithholding
    ? 'general'
    : effectivePayrollByUs
      ? 'withholding_filing'
      : 'withholding_request';

  const canEditGlobalDefault =
    (sessionUser?.loginId ?? '').trim().toLowerCase() === 'ria' && Boolean(sessionUser?.adminMode);

  const scenarioDefaultHtml = globalDefaults[scenario];

  const noticeSource: TemplateSource = templateStore.sources[scenario] ?? 'default';
  const noticeCustomHtml = templateStore.templates[scenario] ?? '';
  const hasNoticeCustom = Boolean(noticeCustomHtml.trim());

  const activeTemplate =
    noticeSource === 'custom' && hasNoticeCustom ? noticeCustomHtml : scenarioDefaultHtml;

  const vatReportSource: TemplateSource = templateStore.vatReportSource ?? 'default';
  const vatReportCustomHtml = templateStore.vatReportTemplate ?? '';
  const hasVatReportCustom = Boolean(vatReportCustomHtml.trim());

  const activeVatReportTemplate =
    vatReportSource === 'custom' && hasVatReportCustom
      ? vatReportCustomHtml
      : globalDefaults.vatReport;

  const paymentNoticeSource: TemplateSource = templateStore.paymentNoticeSource ?? 'default';
  const paymentNoticeCustomHtml = templateStore.paymentNoticeTemplate ?? '';
  const hasPaymentNoticeCustom = Boolean(paymentNoticeCustomHtml.trim());

  const activePaymentNoticeTemplate =
    paymentNoticeSource === 'custom' && hasPaymentNoticeCustom
      ? paymentNoticeCustomHtml
      : globalDefaults.paymentNotice;

  const handleNoticeTemplateChange = (html: string) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      templates: { ...prev.templates, [scenario]: html },
      sources: { ...prev.sources, [scenario]: 'custom' },
    };
    patchTemplateStore(next);
    markTemplateDirty('notice');
  };

  const handleNoticeSourceChange = (source: TemplateSource) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      sources: { ...prev.sources, [scenario]: source },
    };
    if (source === 'custom' && !prev.templates[scenario]?.trim()) {
      next.templates = {
        ...prev.templates,
        [scenario]: globalDefaultsRef.current[scenario],
      };
    }
    patchTemplateStore(next);
    markTemplateDirty('notice');
  };

  const handleNoticeTemplateSave = (html?: string) => {
    const prev = templateStoreRef.current;
    const incoming = typeof html === 'string' ? html : undefined;
    // emit 실패로 빈 문자열이 오면 기존 서식을 지우지 않음
    const nextHtml =
      incoming !== undefined && incoming.trim()
        ? incoming
        : (prev.templates[scenario] ?? '');
    if (!nextHtml.trim()) {
      setTemplateSaveState('error');
      return;
    }
    const next: NoticeTemplateStore = {
      ...prev,
      templates: { ...prev.templates, [scenario]: nextHtml },
      sources: { ...prev.sources, [scenario]: 'custom' },
    };
    patchTemplateStore(next);
    void persistTemplateStore(next);
  };

  const handleGlobalDefaultChange = (html: string) => {
    setGlobalDefaults(prev => {
      const next = { ...prev, [scenario]: html };
      globalDefaultsRef.current = next;
      return next;
    });
    setDefaultSaveState(s => (s === 'saving' ? s : 'dirty'));
  };

  const handleVatGlobalDefaultChange = (html: string) => {
    setGlobalDefaults(prev => {
      const next = { ...prev, vatReport: html };
      globalDefaultsRef.current = next;
      return next;
    });
    setDefaultSaveState(s => (s === 'saving' ? s : 'dirty'));
  };

  const handlePaymentGlobalDefaultChange = (html: string) => {
    setGlobalDefaults(prev => {
      const next = { ...prev, paymentNotice: html };
      globalDefaultsRef.current = next;
      return next;
    });
    setDefaultSaveState(s => (s === 'saving' ? s : 'dirty'));
  };

  const persistGlobalDefaults = useCallback(async () => {
    setDefaultSaveState('saving');
    try {
      const res = await fetch('/api/notice-template/defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ defaults: globalDefaultsRef.current }),
      });
      if (!res.ok) throw new Error('save failed');
      const json = (await res.json()) as { defaults?: typeof globalDefaults };
      if (json.defaults) setGlobalDefaults(prev => ({ ...prev, ...json.defaults }));
      setDefaultSaveState('saved');
    } catch {
      setDefaultSaveState('error');
    }
  }, []);

  const handleVatReportTemplateChange = (html: string) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      vatReportTemplate: html,
      vatReportSource: 'custom',
    };
    patchTemplateStore(next);
    markTemplateDirty('vat');
  };

  const handleVatReportSourceChange = (source: TemplateSource) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      vatReportSource: source,
      vatReportTemplate:
        source === 'custom' && !prev.vatReportTemplate?.trim()
          ? globalDefaultsRef.current.vatReport
          : prev.vatReportTemplate,
    };
    patchTemplateStore(next);
    markTemplateDirty('vat');
  };

  const handleVatReportTemplateSave = (html?: string) => {
    const prev = templateStoreRef.current;
    const incoming = typeof html === 'string' ? html : undefined;
    const nextHtml =
      incoming !== undefined && incoming.trim()
        ? incoming
        : (prev.vatReportTemplate ?? '');
    if (!nextHtml.trim()) {
      setVatTemplateSaveState('error');
      return;
    }
    const next: NoticeTemplateStore = {
      ...prev,
      vatReportTemplate: nextHtml,
      vatReportSource: 'custom',
    };
    patchTemplateStore(next);
    void persistTemplateStore(next);
  };

  const handlePaymentNoticeTemplateChange = (html: string) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      paymentNoticeTemplate: html,
      paymentNoticeSource: 'custom',
    };
    patchTemplateStore(next);
    markTemplateDirty('payment');
  };

  const handlePaymentNoticeSourceChange = (source: TemplateSource) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      paymentNoticeSource: source,
      paymentNoticeTemplate:
        source === 'custom' && !prev.paymentNoticeTemplate?.trim()
          ? globalDefaultsRef.current.paymentNotice
          : prev.paymentNoticeTemplate,
    };
    patchTemplateStore(next);
    markTemplateDirty('payment');
  };

  const handlePaymentNoticeTemplateSave = (html?: string) => {
    const prev = templateStoreRef.current;
    const incoming = typeof html === 'string' ? html : undefined;
    const nextHtml =
      incoming !== undefined && incoming.trim()
        ? incoming
        : (prev.paymentNoticeTemplate ?? '');
    if (!nextHtml.trim()) {
      setPaymentTemplateSaveState('error');
      return;
    }
    const next: NoticeTemplateStore = {
      ...prev,
      paymentNoticeTemplate: nextHtml,
      paymentNoticeSource: 'custom',
    };
    patchTemplateStore(next);
    void persistTemplateStore(next);
  };

  const handleOfficialLetterChange = (kind: OfficialLetterKind, html: string) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      officialLetters: { ...prev.officialLetters, [kind]: html },
      officialLetterSources: { ...prev.officialLetterSources, [kind]: 'custom' },
    };
    patchTemplateStore(next);
    markTemplateDirty('official');
  };

  const handleOfficialLetterSourceChange = (kind: OfficialLetterKind, source: TemplateSource) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      officialLetterSources: { ...prev.officialLetterSources, [kind]: source },
    };
    if (source === 'custom' && !prev.officialLetters?.[kind]?.trim()) {
      next.officialLetters = {
        ...prev.officialLetters,
        [kind]: DEFAULT_OFFICIAL_LETTER_BY_KIND[kind],
      };
    }
    patchTemplateStore(next);
    markTemplateDirty('official');
  };

  const handleOfficialLetterSave = () => {
    void persistTemplateStore(templateStoreRef.current);
  };

  const handleOfficialFormChange = (formId: string, html: string) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      officialFormTemplates: { ...prev.officialFormTemplates, [formId]: html },
      officialFormSources: { ...prev.officialFormSources, [formId]: 'custom' },
    };
    patchTemplateStore(next);
    markTemplateDirty('official');
  };

  const handleOfficialFormSourceChange = (formId: string, source: TemplateSource) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      officialFormSources: { ...prev.officialFormSources, [formId]: source },
    };
    if (source === 'custom' && !prev.officialFormTemplates?.[formId]?.trim()) {
      next.officialFormTemplates = {
        ...prev.officialFormTemplates,
        [formId]: defaultOfficialFormBodyForKind(taxKindFromFormId(formId)),
      };
    }
    patchTemplateStore(next);
    markTemplateDirty('official');
  };

  const handleOutputModeChange = (mode: NoticeOutputMode) => {
    setOutputMode(mode);
  };

  const activeOfficialDefaultHtml = usesFormalLayout
    ? defaultOfficialFormBodyForKind(officialTaxKind)
    : DEFAULT_OFFICIAL_LETTER_BY_KIND[officialTaxKind];

  const managerContact = useMemo(() => resolveManagerContact(sessionUser), [sessionUser]);

  // 자료 제출 마감은 항시 ON.
  // 세목/기간이 바뀌면 세목별 기본값(원천세 -3일, 부가세 -2주, 종소세 -3주, 법인세 2월 중순)으로
  // 다시 채운다. 단 사용자가 직접 바꿔둔 값은 그대로 둔다.
  const lastAutoMaterialDate = useRef<string | null>(null);
  useEffect(() => {
    if (!deadline) return;
    const finalISO = toISODate(deadline.final);
    const def = defaultMaterialDate(periodTaxType, deadline.final);
    const prevAuto = lastAutoMaterialDate.current;
    lastAutoMaterialDate.current = def;
    setMaterialDeadline(prev => {
      // 비어 있거나, 직전 자동값과 동일하거나, (최초 1회) 과거 기본값(신고기한일)과 같으면 자동 갱신
      const isAuto =
        !prev.date ||
        prev.date === prevAuto ||
        (prevAuto === null && prev.date === finalISO);
      return isAuto
        ? { ...prev, enabled: true, date: def }
        : { ...prev, enabled: true };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);

  const handleMaterialDeadlineChange = (next: MaterialDeadline) => {
    if (!next.date && deadline) {
      next = { ...next, date: defaultMaterialDate(periodTaxType, deadline.final) };
    }
    setMaterialDeadline({ ...next, enabled: true });
  };

  const materialDeadlineLine = useMemo(
    () => formatMaterialDeadlineLine(materialDeadline),
    [materialDeadline],
  );

  const materialDeadlineNote = useMemo(
    () => formatMaterialDeadlineNote(materialDeadline),
    [materialDeadline],
  );

  const officialLetterVars = useMemo(
    () =>
      buildOfficialLetterVars({
        deadline,
        materialDeadlineLine,
        manager: managerContact,
        companyName: effectiveCompanyName,
        year: params.year,
        vatPeriodId: params.vatPeriodId,
        vatBusinessType,
        officialKind: isOfficialMode ? officialTaxKind : null,
      }),
    [
      deadline,
      materialDeadlineLine,
      managerContact,
      effectiveCompanyName,
      params.year,
      params.vatPeriodId,
      vatBusinessType,
      isOfficialMode,
      officialTaxKind,
    ],
  );

  const effectiveTemplate = activeTemplate;

  const messageHtml = useMemo(
    () =>
      renderTemplate({
        template: effectiveTemplate,
        taxType,
        deadline,
        companyName: effectiveCompanyName,
        notes: effectiveNotes,
        materials: effectiveMaterials,
        materialDeadline: materialDeadlineLine,
        materialDeadlineNote,
      }),
    [
      effectiveTemplate,
      taxType,
      deadline,
      effectiveCompanyName,
      effectiveNotes,
      effectiveMaterials,
      materialDeadlineLine,
      materialDeadlineNote,
    ],
  );

  const paymentHtml = useMemo(
    () =>
      buildPaymentNoticeHtml({
        taxType,
        deadline,
        payment,
        template: activePaymentNoticeTemplate,
      }),
    [taxType, deadline, payment, activePaymentNoticeTemplate],
  );

  const isVat = taxType === TAX_TYPES.VAT;

  // 부가세 분납: 납부서 장수만큼 회차 행을 맞추고, 빈 일자는 권장 일정으로 자동 채움(수정 가능)
  useEffect(() => {
    if (!isVat || !deadline) return;
    const dates = installmentSchedule(deadline.final).map(toISODate);
    setPayment(prev => {
      const n = Math.max(0, prev.slips);
      const next = Array.from({ length: n }, (_, i) => {
        const ex = prev.installments[i];
        return { date: ex?.date || dates[i] || '', amount: ex?.amount ?? 0 };
      });
      const same =
        prev.installments.length === next.length &&
        prev.installments.every((it, i) => it.date === next[i].date && it.amount === next[i].amount);
      return same ? prev : { ...prev, installments: next };
    });
  }, [isVat, deadline, payment.slips]);

  const vatReportHtml = useMemo(
    () =>
      buildVatReportHtml({
        taxType,
        deadline,
        report: vatReport,
        template: activeVatReportTemplate,
      }),
    [taxType, deadline, vatReport, activeVatReportTemplate],
  );

  // 부가세: 신고 결과 보고 최종세액 → 납부금액 자동 연동 (연동 모드일 때만, 수동 입력 시 중단)
  useEffect(() => {
    if (!isVat || !vatPaymentLinked) return;
    const { finalTax } = calcVatReport(vatReport);
    setPayment(prev => {
      const installments = [...prev.installments];
      if (prev.slips >= 2 && installments.length > 0) {
        installments[0] = { ...installments[0], amount: finalTax };
      }
      const instSynced =
        prev.slips < 2 ||
        (installments[0]?.amount === finalTax);
      if (prev.amount === finalTax && instSynced) return prev;
      if (selectedClientRef.current) setClientDirty(true);
      return { ...prev, amount: finalTax, installments };
    });
  }, [isVat, vatReport, payment.slips, vatPaymentLinked]);

  const meta = TAX_TYPE_META[periodTaxType];

  const filingTaxId = useMemo(() => {
    if (periodTaxType === TAX_TYPES.INCOME) return 'comprehensive';
    if (periodTaxType === TAX_TYPES.CORPORATE) return 'corporate';
    if (periodTaxType === TAX_TYPES.VAT) return 'vat';
    if (periodTaxType === TAX_TYPES.WITHHOLDING) return 'withholding';
    return 'comprehensive';
  }, [periodTaxType]);

  return (
    <div className="space-y-3">
      <PortalPageHeader
        title="안내문 생성기"
        description={
          isOfficialMode
            ? '세목별 신고 공문을 직접 편집·인쇄·저장합니다.'
            : '세목·기간별 신고 안내·납부 문구를 생성합니다.'
        }
        icon={<PageHeaderIcon name="notice-generator" />}
      />

      <NoticeSetupBar
        outputMode={outputMode}
        onOutputModeChange={handleOutputModeChange}
        officialTaxKind={officialTaxKind}
        onOfficialTaxKindChange={setOfficialTaxKind}
        taxType={taxType}
        onSelectTax={handleSelectTax}
        params={params}
        onParamChange={handleParamChange}
        deadline={deadline}
        taxLabel={meta.name}
        materialDeadline={materialDeadline}
        onMaterialDeadlineChange={handleMaterialDeadlineChange}
        vatBusinessType={vatBusinessType}
        onVatBusinessTypeChange={setVatBusinessType}
        clientPicker={
          <NoticeClientPicker
            value={
              selectedClient
                ? { id: selectedClient.id, companyName: clientCompanyName }
                : null
            }
            onSelect={client => void handleSelectClient(client)}
            draftCompanyName={inClientMode ? '' : companyName}
            onDraftCompanyNameChange={inClientMode ? undefined : handleCompanyNameChange}
            filingTax={filingTaxId}
            showReviewLink={
              taxType === TAX_TYPES.CORPORATE || taxType === TAX_TYPES.INCOME
            }
          />
        }
      />

      {isOfficialMode && templateLoaded ? (
        <OfficialLetterEditor
          key={officialEditorKey}
          storageKey={officialEditorKey}
          kind={officialEditorKey}
          title={OFFICIAL_LETTER_LABEL[officialTaxKind]}
          defaultHtml={activeOfficialDefaultHtml}
          customHtml={
            usesFormalLayout
              ? (templateStore.officialFormTemplates?.[officialFormId] ?? '')
              : (templateStore.officialLetters?.[officialTaxKind] ?? '')
          }
          source={
            usesFormalLayout
              ? (templateStore.officialFormSources?.[officialFormId] ?? 'default')
              : (templateStore.officialLetterSources?.[officialTaxKind] ?? 'default')
          }
          vars={officialLetterVars}
          layout={usesFormalLayout ? 'formal' : 'prep'}
          onChange={html =>
            usesFormalLayout
              ? handleOfficialFormChange(officialFormId, html)
              : handleOfficialLetterChange(officialTaxKind, html)
          }
          onSourceChange={source =>
            usesFormalLayout
              ? handleOfficialFormSourceChange(officialFormId, source)
              : handleOfficialLetterSourceChange(officialTaxKind, source)
          }
          onSave={handleOfficialLetterSave}
          hasCustomSaved={
            usesFormalLayout
              ? Boolean(templateStore.officialFormTemplates?.[officialFormId]?.trim())
              : Boolean(templateStore.officialLetters?.[officialTaxKind]?.trim())
          }
          saveState={officialTemplateSaveState}
        />
      ) : (
      <div className={`${noticePageSplit} w-full`}>
        <div className="space-y-3 min-w-0">
          <CompanyNotesField
            key={`${selectedClient?.id ?? 'local'}-${taxType}`}
            materials={effectiveMaterials}
            onMaterialsChange={handleMaterialsChange}
            materialsPlaceholder={DEFAULT_MATERIALS_BY_TAX[taxType]}
            notes={effectiveNotes}
            onNotesChange={handleNotesChange}
            notesPlaceholder={NOTES_EXAMPLE_BY_TAX[taxType]}
            clientLinked={inClientMode}
            saveState={saveState}
            showPayroll={isWithholding}
            payrollByUs={effectivePayrollByUs}
            onPayrollChange={handlePayrollChange}
            onSave={flushed => void handleSaveClient(flushed)}
          />

          {isVat && (
            <NoticeCollapsibleSection title="신고 결과 보고 (부가세)">
              <VatReportField value={vatReport} onChange={handleVatReportChange} embedded />
            </NoticeCollapsibleSection>
          )}

          <NoticeCollapsibleSection title="신고 결과 안내 (납부세액)">
            <PaymentNoticeField
              value={payment}
              onChange={handlePaymentChange}
              taxTypeName={meta.name}
              hasLocalTax={hasLocalIncomeTax(taxType)}
              isWithholding={taxType === TAX_TYPES.WITHHOLDING}
              showInstallments={isVat}
              vatAmountLinked={isVat && vatPaymentLinked}
              onManualAmountEdit={isVat ? handleVatPaymentUnlink : undefined}
              onReLinkVatAmount={isVat ? handleVatPaymentRelink : undefined}
              clientLinked={inClientMode}
              embedded
            />
          </NoticeCollapsibleSection>
        </div>

        <div className="space-y-3 min-w-0 md:border-l md:border-slate-200 md:pl-4">
          {templateLoaded && (
            <NoticeCollapsibleSection title="담당자 서식 설정">
              <TemplateEditor
                key={scenario}
                html={noticeCustomHtml}
                onChange={handleNoticeTemplateChange}
                source={noticeSource}
                onSourceChange={handleNoticeSourceChange}
                onSave={handleNoticeTemplateSave}
                hasCustomSaved={hasNoticeCustom}
                saveState={templateSaveState}
                title={SCENARIO_LABEL[scenario]}
                defaultHtml={scenarioDefaultHtml}
                canEditDefault={canEditGlobalDefault}
                onDefaultChange={handleGlobalDefaultChange}
                onDefaultSave={() => void persistGlobalDefaults()}
                defaultSaveState={defaultSaveState}
              />
              {isVat && (
                <TemplateEditor
                  key="vat-report-template"
                  html={vatReportCustomHtml}
                  onChange={handleVatReportTemplateChange}
                  source={vatReportSource}
                  onSourceChange={handleVatReportSourceChange}
                  onSave={handleVatReportTemplateSave}
                  hasCustomSaved={hasVatReportCustom}
                  saveState={vatTemplateSaveState}
                  title="신고 결과 보고 서식 (부가세)"
                  defaultHtml={globalDefaults.vatReport}
                  tokens={VAT_REPORT_TOKENS}
                  hint="부가세 신고 결과 보고 문구 서식입니다."
                  canEditDefault={canEditGlobalDefault}
                  onDefaultChange={handleVatGlobalDefaultChange}
                  onDefaultSave={() => void persistGlobalDefaults()}
                  defaultSaveState={defaultSaveState}
                />
              )}
              <TemplateEditor
                key="payment-notice-template"
                html={paymentNoticeCustomHtml}
                onChange={handlePaymentNoticeTemplateChange}
                source={paymentNoticeSource}
                onSourceChange={handlePaymentNoticeSourceChange}
                onSave={handlePaymentNoticeTemplateSave}
                hasCustomSaved={hasPaymentNoticeCustom}
                saveState={paymentTemplateSaveState}
                title="신고 결과 안내 서식 (납부세액)"
                defaultHtml={globalDefaults.paymentNotice}
                tokens={PAYMENT_NOTICE_TOKENS}
                hint="납부·환급·분납 안내 문구 서식입니다."
                canEditDefault={canEditGlobalDefault}
                onDefaultChange={handlePaymentGlobalDefaultChange}
                onDefaultSave={() => void persistGlobalDefaults()}
                defaultSaveState={defaultSaveState}
              />
            </NoticeCollapsibleSection>
          )}

          <NoticeCollapsibleSection title="생성된 안내 문구">
            <NoticeResultTabs
              mainHtml={messageHtml}
              paymentHtml={paymentHtml}
              vatHtml={vatReportHtml}
              showVat={isVat}
              embedded
            />
          </NoticeCollapsibleSection>
        </div>
      </div>
      )}

      <p className={portalFooterMeta}>
        마감일은 법정기한 기준입니다. 공휴일: 2025~2035년 · 연도: {SELECTABLE_YEARS[0]}~
        {SELECTABLE_YEARS[SELECTABLE_YEARS.length - 1]}년. 서식은 담당자별 저장 · 미연결 시 브라우저 저장.
      </p>
    </div>
  );
}
