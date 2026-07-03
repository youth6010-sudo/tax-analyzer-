'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHeaderIcon } from '@/app/components/dashboard/SidebarNavIcon';
import { PortalPageHeader } from '@/app/components/portal/PortalPageShell';
import { portalFooterMeta } from '@/app/components/portal/uiClasses';
import NoticeClientPicker, { type PickedClient } from './_components/NoticeClientPicker';
import NoticeSetupBar from './_components/NoticeSetupBar';
import NoticeCollapsibleSection from './_components/NoticeCollapsibleSection';
import NoticeResultTabs from './_components/NoticeResultTabs';
import CompanyNotesField from './_components/CompanyNotesField';
import PaymentNoticeField from './_components/PaymentNoticeField';
import VatReportField from './_components/VatReportField';
import TemplateEditor from './_components/TemplateEditor';
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
  defaultPaymentSlips,
  installmentSchedule,
} from './_lib/templates';
import { fetchNoticeTemplateStore, saveNoticeTemplateStore } from './_lib/noticeTemplateClient';
import {
  DEFAULT_MATERIALS_BY_TAX,
  NOTES_EXAMPLE_BY_TAX,
  fetchClientNotice,
  saveClientNotice,
  type ClientNoticeMap,
} from './_lib/clientNotice';
import type {
  DeadlineParams,
  MaterialDeadline,
  PaymentNotice,
  TaxTypeKey,
  VatReport,
} from './_lib/types';
import { EMPTY_VAT_REPORT } from './_lib/types';

function getDefaultYear() {
  const now = new Date().getFullYear();
  const min = SELECTABLE_YEARS[0];
  const max = SELECTABLE_YEARS[SELECTABLE_YEARS.length - 1];
  return Math.min(Math.max(now, min), max);
}

type SelectedClient = {
  id: string;
  intakeData: Record<string, unknown>;
  noticeMap: ClientNoticeMap;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function NoticeGeneratorPage() {
  // 세션 입력값 (수임처 미연결 시 전역 스크래치 — localStorage)
  const [taxType, setTaxType] = useLocalStorage<TaxTypeKey>('tng.taxType', TAX_TYPES.VAT);
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
  const templateSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vatTemplateSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paymentTemplateSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templateStoreRef = useRef(templateStore);
  templateStoreRef.current = templateStore;

  // 원천세 급여대장 작성 여부 (수임처 미연결 시 localStorage)
  const [localPayrollByUs, setLocalPayrollByUs] = useLocalStorage('tng.payrollByUs', false);
  const [clientPayrollByUs, setClientPayrollByUs] = useState(false);

  // 자료 제출 마감 (브라우저별 작성 입력값) — 모든 세목에서 항시 표시·항상 ON
  const [materialDeadline, setMaterialDeadline] = useLocalStorage<MaterialDeadline>(
    'tng.materialDeadline',
    { enabled: true, date: '', hour: 13, minute: 0 },
  );

  // 신고 결과 안내(납부세액) 입력값 (세션 전용 — 매 신고마다 달라지므로 비영구)
  // 부가세 외 세목(원천세·종소세·법인세)은 본세+지방소득세 → 납부서 기본 2장
  const [payment, setPayment] = useState<PaymentNotice>(() => ({
    slips: defaultPaymentSlips(taxType),
    amount: 0,
    localAmount: 0,
    refundClaimed: false,
    installments: [],
  }));

  // 부가세 신고 결과 보고 및 검토 입력값 (세션 전용)
  const [vatReport, setVatReport] = useState<VatReport>(EMPTY_VAT_REPORT);
  /** 부가세만: 신고결과보고 최종세액 → 납부금액 자동 연동 (수동 수정 시 해제) */
  const [vatPaymentLinked, setVatPaymentLinked] = useState(true);

  const [params, setParams] = useLocalStorage<DeadlineParams>('tng.params', {
    year: getDefaultYear(),
    month: new Date().getMonth() + 1,
    vatPeriodId: '1-final',
    fyEndMonth: 12,
    filingTypeId: 'general',
  });

  // 수임처 연결 모드 상태
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);
  const [clientCompanyName, setClientCompanyName] = useState('');
  const [clientMaterials, setClientMaterials] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const inClientMode = selectedClient !== null;
  const effectiveCompanyName = inClientMode ? clientCompanyName : companyName;
  const effectiveMaterials = inClientMode ? clientMaterials : materials;
  const effectiveNotes = inClientMode ? clientNotes : notes;

  const loadForTax = (noticeMap: ClientNoticeMap, tax: TaxTypeKey) => {
    const entry = noticeMap[tax];
    // 저장된 값이 있으면 그대로, 없으면 비워두고 예시 placeholder로 안내
    setClientMaterials(entry?.materials ?? '');
    setClientNotes(entry?.notes ?? '');
    setClientPayrollByUs(entry?.payrollByUs ?? false);
  };

  const handleSelectClient = async (picked: PickedClient | null) => {
    if (!picked) {
      setSelectedClient(null);
      setSaveState('idle');
      return;
    }
    setSaveState('idle');
    try {
      const fetched = await fetchClientNotice(picked.id);
      setSelectedClient({
        id: fetched.id,
        intakeData: fetched.intakeData,
        noticeMap: fetched.noticeMap,
      });
      setClientCompanyName(fetched.companyName || picked.companyName);
      loadForTax(fetched.noticeMap, taxType);
    } catch {
      setSelectedClient({ id: picked.id, intakeData: {}, noticeMap: {} });
      setClientCompanyName(picked.companyName);
      loadForTax({}, taxType);
      setSaveState('error');
    }
  };

  // 수임처 데이터 명시적 저장 (저장 버튼) — 현재 세목의 필요자료·특이사항·급여대장 여부 저장.
  // 저장 시 업체별 필요자료가 수임처관리 "세목별 특이사항"에도 자동 반영된다.
  const handleSaveClient = async () => {
    if (!selectedClient) return;
    const client = selectedClient;
    setSaveState('saving');
    try {
      const nextMap = await saveClientNotice(client.id, client.intakeData, taxType, {
        materials: clientMaterials,
        notes: clientNotes,
        payrollByUs: clientPayrollByUs,
      });
      setSelectedClient(prev =>
        prev && prev.id === client.id
          ? {
              ...prev,
              noticeMap: nextMap,
              intakeData: { ...prev.intakeData, noticeData: nextMap },
            }
          : prev,
      );
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  };

  const handleSelectTax = (next: TaxTypeKey) => {
    setTaxType(next);
    // 세목별 납부서 기본 장수 적용 + 금액 초기화(세목마다 금액이 다르므로)
    setPayment({
      slips: defaultPaymentSlips(next),
      amount: 0,
      localAmount: 0,
      refundClaimed: false,
      installments: [],
    });
    setVatPaymentLinked(next === TAX_TYPES.VAT);
    // 세목을 바꾸면 자료 제출 마감일을 해당 세목 기본값으로 자동 변경
    // (원천세 -3일 / 부가세 -2주 / 종소세 -3주 / 법인세 직전 달 15일)
    const nextDeadline = calculateDeadline(next, params);
    if (nextDeadline) {
      const def = defaultMaterialDate(next, nextDeadline.final);
      lastAutoMaterialDate.current = def;
      setMaterialDeadline(prev => ({ ...prev, enabled: true, date: def }));
    }
    if (selectedClient) loadForTax(selectedClient.noticeMap, next);
  };

  const handleCompanyNameChange = (value: string) => {
    if (inClientMode) setClientCompanyName(value);
    else setCompanyName(value);
  };

  const handleMaterialsChange = (value: string) => {
    if (inClientMode) {
      setClientMaterials(value);
      if (saveState !== 'idle') setSaveState('idle');
    } else {
      setMaterials(value);
    }
  };

  const handleNotesChange = (value: string) => {
    if (inClientMode) {
      setClientNotes(value);
      if (saveState !== 'idle') setSaveState('idle');
    } else {
      setNotes(value);
    }
  };

  const handlePayrollChange = (value: boolean) => {
    if (inClientMode) {
      setClientPayrollByUs(value);
      if (saveState !== 'idle') setSaveState('idle');
    } else {
      setLocalPayrollByUs(value);
    }
  };

  const handleParamChange = (key: keyof DeadlineParams, value: string | number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  // 마운트 시 서버에 저장된 담당자 시나리오별 서식 로드 (없으면 기본 서식 사용)
  useEffect(() => {
    const ac = new AbortController();
    fetchNoticeTemplateStore(ac.signal)
      .then(saved => {
        setTemplateStore(saved);
        setTemplateLoaded(true);
      })
      .catch(err => {
        if (err?.name !== 'AbortError') setTemplateLoaded(true);
      });
    return () => ac.abort();
  }, []);

  const persistTemplateStore = useCallback(async (next: NoticeTemplateStore) => {
    setTemplateSaveState('saving');
    try {
      await saveNoticeTemplateStore(next);
      setTemplateSaveState('saved');
    } catch {
      setTemplateSaveState('error');
    }
  }, []);

  const schedulePersistStore = useCallback(
    (next: NoticeTemplateStore, kind: 'notice' | 'vat' | 'payment' = 'notice') => {
      setTemplateStore(next);
      const setState =
        kind === 'vat'
          ? setVatTemplateSaveState
          : kind === 'payment'
            ? setPaymentTemplateSaveState
            : setTemplateSaveState;
      setState('saving');
      const timer =
        kind === 'vat'
          ? vatTemplateSaveTimer
          : kind === 'payment'
            ? paymentTemplateSaveTimer
            : templateSaveTimer;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        try {
          await saveNoticeTemplateStore(next);
          setState('saved');
        } catch {
          setState('error');
        }
      }, 800);
    },
    [],
  );

  const deadline = useMemo(() => calculateDeadline(taxType, params), [taxType, params]);

  const isWithholding = taxType === TAX_TYPES.WITHHOLDING;

  const effectivePayrollByUs = inClientMode ? clientPayrollByUs : localPayrollByUs;

  // 현재 활성 시나리오: 원천세는 급여대장 작성 여부로 자료요청/신고안내 분기
  const scenario: TemplateScenario = !isWithholding
    ? 'general'
    : effectivePayrollByUs
      ? 'withholding_filing'
      : 'withholding_request';

  const noticeSource: TemplateSource = templateStore.sources[scenario] ?? 'default';
  const noticeCustomHtml = templateStore.templates[scenario] ?? '';
  const hasNoticeCustom = Boolean(noticeCustomHtml.trim());

  const activeTemplate =
    noticeSource === 'custom' && hasNoticeCustom
      ? noticeCustomHtml
      : DEFAULT_TEMPLATE_BY_SCENARIO[scenario];

  const vatReportSource: TemplateSource = templateStore.vatReportSource ?? 'default';
  const vatReportCustomHtml = templateStore.vatReportTemplate ?? '';
  const hasVatReportCustom = Boolean(vatReportCustomHtml.trim());

  const activeVatReportTemplate =
    vatReportSource === 'custom' && hasVatReportCustom
      ? vatReportCustomHtml
      : DEFAULT_VAT_REPORT_TEMPLATE;

  const paymentNoticeSource: TemplateSource = templateStore.paymentNoticeSource ?? 'default';
  const paymentNoticeCustomHtml = templateStore.paymentNoticeTemplate ?? '';
  const hasPaymentNoticeCustom = Boolean(paymentNoticeCustomHtml.trim());

  const activePaymentNoticeTemplate =
    paymentNoticeSource === 'custom' && hasPaymentNoticeCustom
      ? paymentNoticeCustomHtml
      : DEFAULT_PAYMENT_NOTICE_TEMPLATE;

  const handleNoticeTemplateChange = (html: string) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      templates: { ...prev.templates, [scenario]: html },
      sources: { ...prev.sources, [scenario]: 'custom' },
    };
    schedulePersistStore(next, 'notice');
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
        [scenario]: DEFAULT_TEMPLATE_BY_SCENARIO[scenario],
      };
    }
    schedulePersistStore(next, 'notice');
  };

  const handleNoticeTemplateSave = () => {
    void persistTemplateStore(templateStoreRef.current);
  };

  const handleVatReportTemplateChange = (html: string) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      vatReportTemplate: html,
      vatReportSource: 'custom',
    };
    schedulePersistStore(next, 'vat');
  };

  const handleVatReportSourceChange = (source: TemplateSource) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      vatReportSource: source,
      vatReportTemplate:
        source === 'custom' && !prev.vatReportTemplate?.trim()
          ? DEFAULT_VAT_REPORT_TEMPLATE
          : prev.vatReportTemplate,
    };
    schedulePersistStore(next, 'vat');
  };

  const handleVatReportTemplateSave = () => {
    void persistTemplateStore(templateStoreRef.current);
  };

  const handlePaymentNoticeTemplateChange = (html: string) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      paymentNoticeTemplate: html,
      paymentNoticeSource: 'custom',
    };
    schedulePersistStore(next, 'payment');
  };

  const handlePaymentNoticeSourceChange = (source: TemplateSource) => {
    const prev = templateStoreRef.current;
    const next: NoticeTemplateStore = {
      ...prev,
      paymentNoticeSource: source,
      paymentNoticeTemplate:
        source === 'custom' && !prev.paymentNoticeTemplate?.trim()
          ? DEFAULT_PAYMENT_NOTICE_TEMPLATE
          : prev.paymentNoticeTemplate,
    };
    schedulePersistStore(next, 'payment');
  };

  const handlePaymentNoticeTemplateSave = () => {
    void persistTemplateStore(templateStoreRef.current);
  };

  // 자료 제출 마감은 항시 ON.
  // 세목/기간이 바뀌면 세목별 기본값(원천세 -3일, 부가세 -2주, 종소세 -3주, 법인세 2월 중순)으로
  // 다시 채운다. 단 사용자가 직접 바꿔둔 값은 그대로 둔다.
  const lastAutoMaterialDate = useRef<string | null>(null);
  useEffect(() => {
    if (!deadline) return;
    const finalISO = toISODate(deadline.final);
    const def = defaultMaterialDate(taxType, deadline.final);
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
      next = { ...next, date: defaultMaterialDate(taxType, deadline.final) };
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
      return { ...prev, amount: finalTax, installments };
    });
  }, [isVat, vatReport, payment.slips, vatPaymentLinked]);

  const meta = TAX_TYPE_META[taxType];

  return (
    <div className="space-y-3">
      <PortalPageHeader
        title="안내문 생성기"
        description="세목·기간별 신고 안내·납부 문구를 생성합니다."
        icon={<PageHeaderIcon name="notice-generator" />}
      />

      <div className="space-y-3">
        <NoticeSetupBar
          taxType={taxType}
          onSelectTax={handleSelectTax}
          params={params}
          onParamChange={handleParamChange}
          deadline={deadline}
          taxLabel={meta.name}
          materialDeadline={materialDeadline}
          onMaterialDeadlineChange={handleMaterialDeadlineChange}
          clientPicker={
            <NoticeClientPicker
              value={
                selectedClient
                  ? { id: selectedClient.id, companyName: clientCompanyName }
                  : null
              }
              onSelect={client => void handleSelectClient(client)}
            />
          }
        />

        <CompanyNotesField
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
          onSave={() => void handleSaveClient()}
        />
      </div>

      {isVat && (
        <NoticeCollapsibleSection title="신고 결과 보고 (부가세)">
          <VatReportField value={vatReport} onChange={setVatReport} embedded />
        </NoticeCollapsibleSection>
      )}

      <NoticeCollapsibleSection title="신고 결과 안내 (납부세액)">
        <PaymentNoticeField
          value={payment}
          onChange={setPayment}
          taxTypeName={meta.name}
          hasLocalTax={hasLocalIncomeTax(taxType)}
          isWithholding={taxType === TAX_TYPES.WITHHOLDING}
          showInstallments={isVat}
          vatAmountLinked={isVat && vatPaymentLinked}
          onManualAmountEdit={isVat ? () => setVatPaymentLinked(false) : undefined}
          onReLinkVatAmount={isVat ? () => setVatPaymentLinked(true) : undefined}
          embedded
        />
      </NoticeCollapsibleSection>

      {templateLoaded && (
        <NoticeCollapsibleSection title="담당자 서식 설정">
          <TemplateEditor
            key={scenario}
            html={noticeCustomHtml || DEFAULT_TEMPLATE_BY_SCENARIO[scenario]}
            onChange={handleNoticeTemplateChange}
            source={noticeSource}
            onSourceChange={handleNoticeSourceChange}
            onSave={handleNoticeTemplateSave}
            hasCustomSaved={hasNoticeCustom}
            saveState={templateSaveState}
            title={SCENARIO_LABEL[scenario]}
            defaultHtml={DEFAULT_TEMPLATE_BY_SCENARIO[scenario]}
          />
          {isVat && (
            <TemplateEditor
              key="vat-report-template"
              html={vatReportCustomHtml || DEFAULT_VAT_REPORT_TEMPLATE}
              onChange={handleVatReportTemplateChange}
              source={vatReportSource}
              onSourceChange={handleVatReportSourceChange}
              onSave={handleVatReportTemplateSave}
              hasCustomSaved={hasVatReportCustom}
              saveState={vatTemplateSaveState}
              title="신고 결과 보고 서식 (부가세)"
              defaultHtml={DEFAULT_VAT_REPORT_TEMPLATE}
              tokens={VAT_REPORT_TOKENS}
              hint="부가세 신고 결과 보고 문구 서식입니다."
            />
          )}
          <TemplateEditor
            key="payment-notice-template"
            html={paymentNoticeCustomHtml || DEFAULT_PAYMENT_NOTICE_TEMPLATE}
            onChange={handlePaymentNoticeTemplateChange}
            source={paymentNoticeSource}
            onSourceChange={handlePaymentNoticeSourceChange}
            onSave={handlePaymentNoticeTemplateSave}
            hasCustomSaved={hasPaymentNoticeCustom}
            saveState={paymentTemplateSaveState}
            title="신고 결과 안내 서식 (납부세액)"
            defaultHtml={DEFAULT_PAYMENT_NOTICE_TEMPLATE}
            tokens={PAYMENT_NOTICE_TOKENS}
            hint="납부·환급·분납 안내 문구 서식입니다."
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

      <p className={portalFooterMeta}>
        마감일은 법정기한 기준입니다. 공휴일: 2025~2035년 · 연도: {SELECTABLE_YEARS[0]}~
        {SELECTABLE_YEARS[SELECTABLE_YEARS.length - 1]}년. 서식은 담당자별 저장 · 미연결 시 브라우저 저장.
      </p>
    </div>
  );
}
