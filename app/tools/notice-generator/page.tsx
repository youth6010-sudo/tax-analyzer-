'use client';

import { useMemo } from 'react';
import NoticeHeader from './_components/NoticeHeader';
import CompanyNotesField from './_components/CompanyNotesField';
import TaxTypeSelector from './_components/TaxTypeSelector';
import PeriodSelector from './_components/PeriodSelector';
import TemplateEditor from './_components/TemplateEditor';
import DeadlineCard from './_components/DeadlineCard';
import ResultBox from './_components/ResultBox';
import { TAX_TYPES, TAX_TYPE_META } from './_lib/taxTypes';
import { SELECTABLE_YEARS } from './_lib/holidays';
import { DEFAULT_TEMPLATE, DEFAULT_MATERIALS } from './_lib/template';
import { useLocalStorage } from './_lib/useLocalStorage';
import { calculateDeadline } from './_lib/deadline';
import { renderTemplate } from './_lib/templates';
import type { DeadlineParams, TaxTypeKey } from './_lib/types';

function getDefaultYear() {
  const now = new Date().getFullYear();
  const min = SELECTABLE_YEARS[0];
  const max = SELECTABLE_YEARS[SELECTABLE_YEARS.length - 1];
  return Math.min(Math.max(now, min), max);
}

export default function NoticeGeneratorPage() {
  // 세션 입력값 (업체마다 바뀌는 값)
  const [taxType, setTaxType] = useLocalStorage<TaxTypeKey>('tng.taxType', TAX_TYPES.VAT);
  const [companyName, setCompanyName] = useLocalStorage('tng.company', '');
  const [notes, setNotes] = useLocalStorage('tng.notes', '');
  const [materials, setMaterials] = useLocalStorage('tng.materials', DEFAULT_MATERIALS);

  // 고정 설정 (서식 HTML) - 재방문 시 그대로 유지
  const [template, setTemplate] = useLocalStorage('tng.templateHtml', DEFAULT_TEMPLATE);

  const [params, setParams] = useLocalStorage<DeadlineParams>('tng.params', {
    year: getDefaultYear(),
    month: new Date().getMonth() + 1,
    vatPeriodId: '1-final',
    fyEndMonth: 12,
    filingTypeId: 'general',
  });

  const handleParamChange = (key: keyof DeadlineParams, value: string | number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const deadline = useMemo(() => calculateDeadline(taxType, params), [taxType, params]);

  const messageHtml = useMemo(
    () =>
      renderTemplate({
        template,
        taxType,
        deadline,
        companyName,
        notes,
        materials,
      }),
    [template, taxType, deadline, companyName, notes, materials]
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
              companyName={companyName}
              onCompanyNameChange={setCompanyName}
              materials={materials}
              onMaterialsChange={setMaterials}
              notes={notes}
              onNotesChange={setNotes}
            />
            <TaxTypeSelector selected={taxType} onSelect={setTaxType} />
            <PeriodSelector taxType={taxType} params={params} onChange={handleParamChange} />
            <TemplateEditor html={template} onChange={setTemplate} />
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
          {SELECTABLE_YEARS[0]}~{SELECTABLE_YEARS[SELECTABLE_YEARS.length - 1]}년. 입력값과
          서식은 이 브라우저에 자동 저장됩니다.
        </footer>
      </main>
    </div>
  );
}
