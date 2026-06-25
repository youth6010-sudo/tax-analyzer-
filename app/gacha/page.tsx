'use client';

import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loadLunchDatabase } from '@/app/utils/lunchData';
import type { LunchDatabase } from '@/app/types/lunch';
import LunchPickGame from '@/app/components/lunch/LunchPickGame';
import LunchSpotList from '@/app/components/lunch/LunchSpotList';
import LunchSpotRequestForm from '@/app/components/lunch/LunchSpotRequestForm';
import { useLunchJournal } from '@/app/components/lunch/useLunchJournal';
import ManagerGachaGame from '@/app/components/gacha/ManagerGachaGame';
import {
  PortalLoading,
  PortalPageHeader,
  PortalToolTabs,
} from '@/app/components/portal/PortalPageShell';
import { portalAlertError, portalFooterMeta } from '@/app/components/portal/uiClasses';

type GachaTab = 'lunch' | 'manager';

function GachaPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: GachaTab = searchParams.get('tab') === 'manager' ? 'manager' : 'lunch';

  const [db, setDb] = useState<LunchDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    store,
    authorName,
    recordVisit,
    editVisit,
    removeVisit,
    cancelToday,
  } = useLunchJournal();

  useEffect(() => {
    if (tab !== 'lunch') return;
    loadLunchDatabase()
      .then(setDb)
      .catch(e => setError(String(e)));
  }, [tab]);

  const switchTab = (next: GachaTab) => {
    router.replace(next === 'lunch' ? '/gacha' : '/gacha?tab=manager', { scroll: false });
  };

  const subtitle = useMemo(() => {
    if (tab === 'manager') return '담당자 후보를 넣고 가챠로 한 명 뽑기';
    return db?.officeLabel ? `${db.officeLabel} · 캡슐 뽑기 = 오늘 점심` : '캡슐 뽑기 = 오늘 점심';
  }, [tab, db?.officeLabel]);

  return (
    <>
      <PortalPageHeader
        icon="🎰"
        title="가챠머신"
        description={
          subtitle +
          (tab === 'lunch' && authorName ? ` · 리뷰 작성자: ${authorName}` : '')
        }
      />

      <PortalToolTabs
        className="mb-6"
        value={tab}
        onChange={switchTab}
        tabs={[
          { id: 'lunch', label: '🍱 점심', accent: 'orange' },
          { id: 'manager', label: '👤 담당자', accent: 'indigo' },
        ]}
      />

      {tab === 'manager' && <ManagerGachaGame />}

      {tab === 'lunch' && (
        <>
          {error && <div className={`${portalAlertError} mb-4`}>{error}</div>}

          {!db && !error && <PortalLoading label="맛집 목록을 불러오는 중…" />}

          {db && (
            <>
              <LunchPickGame
                spots={db.spots}
                journal={store}
                authorName={authorName}
                onRecordVisit={recordVisit}
                onEditVisit={editVisit}
                onDeleteVisit={removeVisit}
                onCancelToday={cancelToday}
              />
              <LunchSpotList
                spots={db.spots}
                journal={store}
                authorName={authorName}
                onRecordVisit={recordVisit}
                onEditVisit={editVisit}
                onDeleteVisit={removeVisit}
                onCancelToday={cancelToday}
              />
              <LunchSpotRequestForm />
              <p className={portalFooterMeta}>
                방문·리뷰는 브라우저에 저장 · 맛집 목록: {db.updatedAt}
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}

export default function GachaPage() {
  return (
    <Suspense fallback={<PortalLoading />}>
      <GachaPageContent />
    </Suspense>
  );
}
