'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import NoticeHeader from './_components/NoticeHeader';
import NoticeClientPicker, { type PickedClient } from './_components/NoticeClientPicker';
import CompanyNotesField from './_components/CompanyNotesField';
import TaxTypeSelector from './_components/TaxTypeSelector';
import PeriodSelector from './_components/PeriodSelector';
import MaterialDeadlineField from './_components/MaterialDeadlineField';
import PaymentNoticeField from './_components/PaymentNoticeField';
import VatReportField from './_components/VatReportField';
import TemplateEditor from './_components/TemplateEditor';
import DeadlineCard from './_components/DeadlineCard';
import ResultBox from './_components/ResultBox';
import { TAX_TYPES, TAX_TYPE_META } from './_lib/taxTypes';
import { SELECTABLE_YEARS } from './_lib/holidays';
import {
  DEFAULT_TEMPLATE_BY_SCENARIO,
  SCENARIO_LABEL,
  type TemplateMap,
  type TemplateScenario,
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
  hasLocalIncomeTax,
  defaultPaymentSlips,
  installmentSchedule,
} from './_lib/templates';
import { fetchNoticeTemplates, saveNoticeTemplates } from './_lib/noticeTemplateClient';
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

const EMPTY_VAT_REPORT: VatReport = {
  salesSupply: 0,
  salesVat: 0,
  taxInvoiceSupply: 0,
  taxInvoiceVat: 0,
  fixedAssetSupply: 0,
  fixedAssetVat: 0,
  cardCashSupply: 0,
  cardCashVat: 0,
  reductionLabel: '',
  reductionAmount: 0,
};

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

  // 안내문 서식(HTML) — 담당자(로그인 계정)별 서버 저장(시나리오별) + 자동저장
  const [templates, setTemplates] = useState<TemplateMap>({});
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [templateSaveState, setTemplateSaveState] = useState<SaveState>('idle');
  const templateSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    fetchNoticeTemplates(ac.signal)
      .then(saved => {
        setTemplates(saved);
        setTemplateLoaded(true);
      })
      .catch(err => {
        if (err?.name !== 'AbortError') setTemplateLoaded(true);
      });
    return () => ac.abort();
  }, []);

  const deadline = useMemo(() => calculateDeadline(taxType, params), [taxType, params]);

  const isWithholding = taxType === TAX_TYPES.WITHHOLDING;

  const effectivePayrollByUs = inClientMode ? clientPayrollByUs : localPayrollByUs;

  // 현재 활성 시나리오: 원천세는 급여대장 작성 여부로 자료요청/신고안내 분기
  const scenario: TemplateScenario = !isWithholding
    ? 'general'
    : effectivePayrollByUs
      ? 'withholding_filing'
      : 'withholding_request';

  const activeTemplate = templates[scenario] ?? DEFAULT_TEMPLATE_BY_SCENARIO[scenario];

  // 서식 편집 → 디바운스 자동저장 (담당자 계정 기준, 시나리오별)
  const handleTemplateChange = (html: string) => {
    const nextMap: TemplateMap = { ...templates, [scenario]: html };
    setTemplates(nextMap);
    setTemplateSaveState('saving');
    if (templateSaveTimer.current) clearTimeout(templateSaveTimer.current);
    templateSaveTimer.current = setTimeout(async () => {
      try {
        await saveNoticeTemplates(nextMap);
        setTemplateSaveState('saved');
      } catch {
        setTemplateSaveState('error');
      }
    }, 800);
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
    () => buildPaymentNoticeHtml({ taxType, deadline, payment }),
    [taxType, deadline, payment],
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
    () => buildVatReportHtml({ taxType, deadline, report: vatReport }),
    [taxType, deadline, vatReport],
  );

  const meta = TAX_TYPE_META[taxType];

  return (
    <div className="notice-bg flex-1 text-slate-900">
      <NoticeHeader />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* 좌측: 입력 영역 */}
          <div className="space-y-5">
            <CompanyNotesField
              companyName={effectiveCompanyName}
              onCompanyNameChange={handleCompanyNameChange}
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
            <TaxTypeSelector selected={taxType} onSelect={handleSelectTax} />
            <PeriodSelector taxType={taxType} params={params} onChange={handleParamChange} />
            <MaterialDeadlineField
              value={materialDeadline}
              onChange={handleMaterialDeadlineChange}
            />
            {templateLoaded && (
              <TemplateEditor
                key={scenario}
                html={activeTemplate}
                onChange={handleTemplateChange}
                saveState={templateSaveState}
                title={SCENARIO_LABEL[scenario]}
                defaultHtml={DEFAULT_TEMPLATE_BY_SCENARIO[scenario]}
              />
            )}
          </div>

          {/* 우측: 결과 영역 */}
          <div className="space-y-5">
            <DeadlineCard meta={meta} deadline={deadline} />
            <ResultBox messageHtml={messageHtml} />
            {isVat && (
              <>
                <VatReportField value={vatReport} onChange={setVatReport} />
                <ResultBox messageHtml={vatReportHtml} title="신고 결과 보고 및 검토 안내 문구" editable />
              </>
            )}
            <PaymentNoticeField
              value={payment}
              onChange={setPayment}
              taxTypeName={meta.name}
              hasLocalTax={hasLocalIncomeTax(taxType)}
              isWithholding={taxType === TAX_TYPES.WITHHOLDING}
              showInstallments={isVat}
            />
            <ResultBox messageHtml={paymentHtml} title="신고 결과 안내 문구 (납부세액)" editable />
          </div>
        </div>

        <footer className="mt-8 text-center text-xs text-slate-400">
          🌷 마감일은 일반적인 법정기한 기준입니다. 반기납부 특례·기한연장 등 개별
          사정은 별도 확인이 필요합니다. 공휴일 데이터: 2025~2035년. 선택 가능 연도:{' '}
          {SELECTABLE_YEARS[0]}~{SELECTABLE_YEARS[SELECTABLE_YEARS.length - 1]}년. 안내문 서식은
          담당자 계정별·유형별로 서버에 자동 저장됩니다. 수임처 연결 시 &lsquo;수임처에 저장&rsquo;
          버튼으로 세목별 필요자료·특이사항이 저장되며, 미연결 시 입력값은 이 브라우저에 저장됩니다.
        </footer>
      </main>
    </div>
  );
}
