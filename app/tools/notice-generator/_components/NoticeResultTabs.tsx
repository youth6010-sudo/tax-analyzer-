'use client';

import { useState } from 'react';
import { portalToolTab, portalToolTabGroup } from '@/app/components/portal/uiClasses';
import ResultBox from './ResultBox';
import { noticeSection, noticeSectionTitle } from './noticeUi';

type TabId = 'main' | 'vat' | 'payment';

type Props = {
  mainHtml: string;
  paymentHtml: string;
  vatHtml?: string;
  showVat: boolean;
  showMain?: boolean;
  embedded?: boolean;
};

export default function NoticeResultTabs({
  mainHtml,
  paymentHtml,
  vatHtml,
  showVat,
  showMain = true,
  embedded = false,
}: Props) {
  const [tab, setTab] = useState<TabId>(showMain ? 'main' : 'payment');

  const tabs: { id: TabId; label: string }[] = [
    ...(showMain ? [{ id: 'main' as const, label: '자료요청·신고안내' }] : []),
    ...(showVat ? [{ id: 'vat' as const, label: '부가세 보고' }] : []),
    { id: 'payment', label: showMain ? '납부·환급 안내' : '예정고지 납부 안내' },
  ];
  const fallback = tabs[0]?.id ?? 'payment';
  const activeTab = tabs.some(t => t.id === tab) ? tab : fallback;

  const body = (
    <>
      <div className={`mb-3 flex flex-wrap items-center ${embedded ? 'justify-end' : 'justify-between'} gap-2`}>
        {!embedded && <h2 className={noticeSectionTitle}>생성된 안내 문구</h2>}
        <div className={portalToolTabGroup} role="tablist">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setTab(t.id)}
              className={portalToolTab(activeTab === t.id, 'blue')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 전환 시 언마운트하지 않음 — 편집 내용 유지 */}
      <div hidden={activeTab !== 'main'} role="tabpanel">
        {showMain ? <ResultBox messageHtml={mainHtml} editable compact embedded /> : null}
      </div>
      {showVat && vatHtml != null ? (
        <div hidden={activeTab !== 'vat'} role="tabpanel">
          <ResultBox messageHtml={vatHtml} editable compact embedded />
        </div>
      ) : null}
      <div hidden={activeTab !== 'payment'} role="tabpanel">
        <ResultBox messageHtml={paymentHtml} editable compact embedded />
      </div>
    </>
  );

  if (embedded) return <div>{body}</div>;
  return <section className={noticeSection}>{body}</section>;
}
