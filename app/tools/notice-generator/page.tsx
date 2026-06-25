'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import NoticeHeader from './_components/NoticeHeader';
import NoticeClientPicker, { type PickedClient } from './_components/NoticeClientPicker';
import CompanyNotesField from './_components/CompanyNotesField';
import TaxTypeSelector from './_components/TaxTypeSelector';
import PeriodSelector from './_components/PeriodSelector';
import MaterialDeadlineField from './_components/MaterialDeadlineField';
import TemplateEditor from './_components/TemplateEditor';
import DeadlineCard from './_components/DeadlineCard';
import ResultBox from './_components/ResultBox';
import { TAX_TYPES, TAX_TYPE_META } from './_lib/taxTypes';
import { SELECTABLE_YEARS } from './_lib/holidays';
import { DEFAULT_TEMPLATE, DEFAULT_MATERIALS } from './_lib/template';
import { useLocalStorage } from './_lib/useLocalStorage';
import { calculateDeadline } from './_lib/deadline';
import { toISODate } from './_lib/dateUtils';
import {
  renderTemplate,
  formatMaterialDeadlineLine,
  formatMaterialDeadlineNote,
} from './_lib/templates';
import { fetchNoticeTemplate, saveNoticeTemplate } from './_lib/noticeTemplateClient';
import {
  DEFAULT_MATERIALS_BY_TAX,
  fetchClientNotice,
  saveClientNotice,
  type ClientNoticeMap,
  type NoticeClientData,
} from './_lib/clientNotice';
import type { DeadlineParams, MaterialDeadline, TaxTypeKey } from './_lib/types';

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
  const [materials, setMaterials] = useLocalStorage('tng.materials', DEFAULT_MATERIALS);

  // 안내문 서식(HTML) — 담당자(로그인 계정)별 서버 저장 + 자동저장
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [templateSaveState, setTemplateSaveState] = useState<SaveState>('idle');
  const templateSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 자료 제출 마감 (브라우저별 작성 입력값)
  const [materialDeadline, setMaterialDeadline] = useLocalStorage<MaterialDeadline>(
    'tng.materialDeadline',
    { enabled: false, date: '', hour: 13, minute: 0 },
  );

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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inClientMode = selectedClient !== null;
  const effectiveCompanyName = inClientMode ? clientCompanyName : companyName;
  const effectiveMaterials = inClientMode ? clientMaterials : materials;
  const effectiveNotes = inClientMode ? clientNotes : notes;

  const loadForTax = (noticeMap: ClientNoticeMap, tax: TaxTypeKey) => {
    const entry = noticeMap[tax];
    setClientMaterials(entry?.materials ?? DEFAULT_MATERIALS_BY_TAX[tax]);
    setClientNotes(entry?.notes ?? '');
  };

  const handleSelectClient = async (picked: PickedClient | null) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
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

  const scheduleSave = (data: NoticeClientData) => {
    if (!selectedClient) return;
    const client = selectedClient;
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const nextMap = await saveClientNotice(client.id, client.intakeData, taxType, data);
        setSelectedClient(prev =>
          prev && prev.id === client.id
            ? { ...prev, noticeMap: nextMap, intakeData: { ...prev.intakeData, noticeData: nextMap } }
            : prev,
        );
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 800);
  };

  const handleSelectTax = (next: TaxTypeKey) => {
    setTaxType(next);
    if (selectedClient) loadForTax(selectedClient.noticeMap, next);
  };

  const handleCompanyNameChange = (value: string) => {
    if (inClientMode) setClientCompanyName(value);
    else setCompanyName(value);
  };

  const handleMaterialsChange = (value: string) => {
    if (inClientMode) {
      setClientMaterials(value);
      scheduleSave({ materials: value, notes: clientNotes });
    } else {
      setMaterials(value);
    }
  };

  const handleNotesChange = (value: string) => {
    if (inClientMode) {
      setClientNotes(value);
      scheduleSave({ materials: clientMaterials, notes: value });
    } else {
      setNotes(value);
    }
  };

  const handleParamChange = (key: keyof DeadlineParams, value: string | number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  // 마운트 시 서버에 저장된 담당자 서식 로드 (없으면 기본 서식 유지)
  useEffect(() => {
    const ac = new AbortController();
    fetchNoticeTemplate(ac.signal)
      .then(saved => {
        if (saved && saved.trim()) setTemplate(saved);
        setTemplateLoaded(true);
      })
      .catch(err => {
        if (err?.name !== 'AbortError') setTemplateLoaded(true);
      });
    return () => ac.abort();
  }, []);

  // 서식 편집 → 디바운스 자동저장 (담당자 계정 기준)
  const handleTemplateChange = (html: string) => {
    setTemplate(html);
    setTemplateSaveState('saving');
    if (templateSaveTimer.current) clearTimeout(templateSaveTimer.current);
    templateSaveTimer.current = setTimeout(async () => {
      try {
        await saveNoticeTemplate(html);
        setTemplateSaveState('saved');
      } catch {
        setTemplateSaveState('error');
      }
    }, 800);
  };

  const deadline = useMemo(() => calculateDeadline(taxType, params), [taxType, params]);

  // 자료 제출 마감 변경 — 켤 때 날짜가 비어 있으면 기한일로 prefill
  const handleMaterialDeadlineChange = (next: MaterialDeadline) => {
    if (next.enabled && !next.date && deadline) {
      next = { ...next, date: toISODate(deadline.final) };
    }
    setMaterialDeadline(next);
  };

  // 원천세는 자료 제출 마감/안내 멘트를 표시하지 않는다.
  const showMaterialDeadline = taxType !== TAX_TYPES.WITHHOLDING;

  const materialDeadlineLine = useMemo(
    () => (showMaterialDeadline ? formatMaterialDeadlineLine(materialDeadline) : ''),
    [showMaterialDeadline, materialDeadline],
  );

  const materialDeadlineNote = useMemo(
    () => (showMaterialDeadline ? formatMaterialDeadlineNote(materialDeadline) : ''),
    [showMaterialDeadline, materialDeadline],
  );

  const messageHtml = useMemo(
    () =>
      renderTemplate({
        template,
        taxType,
        deadline,
        companyName: effectiveCompanyName,
        notes: effectiveNotes,
        materials: effectiveMaterials,
        materialDeadline: materialDeadlineLine,
        materialDeadlineNote,
      }),
    [
      template,
      taxType,
      deadline,
      effectiveCompanyName,
      effectiveNotes,
      effectiveMaterials,
      materialDeadlineLine,
      materialDeadlineNote,
    ],
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
              notes={effectiveNotes}
              onNotesChange={handleNotesChange}
              clientLinked={inClientMode}
              saveState={saveState}
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
            {showMaterialDeadline && (
              <MaterialDeadlineField
                value={materialDeadline}
                onChange={handleMaterialDeadlineChange}
              />
            )}
            {templateLoaded && (
              <TemplateEditor
                html={template}
                onChange={handleTemplateChange}
                saveState={templateSaveState}
              />
            )}
          </div>

          {/* 우측: 결과 영역 */}
          <div className="space-y-5">
            <DeadlineCard meta={meta} deadline={deadline} />
            <ResultBox messageHtml={messageHtml} />
          </div>
        </div>

        <footer className="mt-8 text-center text-xs text-slate-400">
          🌷 마감일은 일반적인 법정기한 기준입니다. 반기납부 특례·기한연장 등 개별
          사정은 별도 확인이 필요합니다. 공휴일 데이터: 2025~2035년. 선택 가능 연도:{' '}
          {SELECTABLE_YEARS[0]}~{SELECTABLE_YEARS[SELECTABLE_YEARS.length - 1]}년. 안내문 서식은
          담당자 계정별로 서버에 자동 저장되며, 수임처 미연결 시 입력값은 이 브라우저에 저장됩니다.
        </footer>
      </main>
    </div>
  );
}
