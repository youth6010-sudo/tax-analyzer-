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
  embedded?: boolean;
};

export default function NoticeResultTabs({
  mainHtml,
  paymentHtml,
  vatHtml,
  showVat,
  embedded = false,
}: Props) {
  const [tab, setTab] = useState<TabId>('main');

  const tabs: { id: TabId; label: string }[] = [
    { id: 'main', label: '자료요청·신고안내' },
    ...(showVat ? [{ id: 'vat' as const, label: '부가세 보고' }] : []),
    { id: 'payment', label: '납부·환급 안내' },
  ];

  const activeTab = tabs.some(t => t.id === tab) ? tab : 'main';

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

      {activeTab === 'main' && <ResultBox messageHtml={mainHtml} editable compact embedded />}
      {activeTab === 'vat' && showVat && vatHtml != null && (
        <ResultBox messageHtml={vatHtml} editable compact embedded />
      )}
      {activeTab === 'payment' && (
        <ResultBox messageHtml={paymentHtml} editable compact embedded />
      )}
    </>
  );

  if (embedded) return <div>{body}</div>;
  return <section className={noticeSection}>{body}</section>;
}
