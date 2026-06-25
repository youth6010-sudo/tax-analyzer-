'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadLunchDatabase } from '@/app/utils/lunchData';
import type { LunchDatabase } from '@/app/types/lunch';
import LunchPickGame from '@/app/components/lunch/LunchPickGame';
import LunchSpotList from '@/app/components/lunch/LunchSpotList';
import LunchSpotRequestForm from '@/app/components/lunch/LunchSpotRequestForm';
import { useLunchJournal } from '@/app/components/lunch/useLunchJournal';
import { PortalLoading, PortalPageHeader } from '@/app/components/portal/PortalPageShell';
import {
  portalAlertError,
  portalBtnSecondary,
  portalFooterMeta,
} from '@/app/components/portal/uiClasses';

export default function LunchPage() {
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
    loadLunchDatabase()
      .then(setDb)
      .catch(e => setError(String(e)));
  }, []);

  const description =
    (db?.officeLabel ?? '사무실 주변') +
    ' · 캡슐 뽑기 = 오늘 점심' +
    (authorName ? ` · 리뷰 작성자: ${authorName}` : '');

  return (
    <>
      <PortalPageHeader
        icon="🍱"
        title="점심 가챠머신"
        description={description}
        actions={
          <Link href="/gacha?tab=manager" className={portalBtnSecondary}>
            담당자 뽑기 →
          </Link>
        }
      />

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
            방문·리뷰는 브라우저에 저장 (같은 PC에서 로그인한 사람마다 각자 리뷰 가능) · 맛집
            목록: {db.updatedAt}
          </p>
        </>
      )}
    </>
  );
}
