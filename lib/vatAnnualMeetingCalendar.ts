import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { personalChecklistItems } from '@/db/schema';
import { managerNamesMatch } from '@/app/utils/managerMatch';
import {
  createPersonalChecklistItem,
  deletePersonalChecklistItem,
  updatePersonalChecklistItem,
} from '@/lib/personalChecklist';
import type { VatAnnualYearState } from '@/lib/vatAnnualProgress';

/** 연간진행표 대면 미팅 → 인디 캘린더 일정 */
const MEETING_OWNER = '인디';

type MeetingKind = 'preliminary' | 'report';

function meetingFields(kind: MeetingKind, annual: VatAnnualYearState) {
  if (kind === 'preliminary') {
    return {
      date: annual.preliminaryMeetingDate || '',
      time: annual.preliminaryMeetingTime || '',
      mode: annual.preliminaryMeetingMode || '',
      eventId: annual.preliminaryMeetingEventId || '',
      titlePrefix: '가결산 미팅',
      eventKey: 'preliminaryMeetingEventId' as const,
    };
  }
  return {
    date: annual.reportMeetingDate || '',
    time: annual.reportMeetingTime || '',
    mode: annual.reportMeetingMode || '',
    eventId: annual.reportMeetingEventId || '',
    titlePrefix: '보고서 미팅',
    eventKey: 'reportMeetingEventId' as const,
  };
}

async function eventOwnerName(eventId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ ownerName: personalChecklistItems.ownerName })
    .from(personalChecklistItems)
    .where(eq(personalChecklistItems.id, eventId))
    .limit(1);
  return row?.ownerName ?? null;
}

/**
 * 대면(face)+날짜+시각일 때만 인디 개인 체크리스트(캘린더)에 등록.
 * 통화·미입력·불완전하면 기존 연동 일정을 제거.
 */
export async function syncAnnualMeetingCalendar(input: {
  /** @deprecated 소유자는 항상 인디 — 하위 호환용 */
  actorName?: string;
  clientId: string;
  companyName: string;
  annual: VatAnnualYearState;
}): Promise<Partial<VatAnnualYearState>> {
  const patch: Partial<VatAnnualYearState> = {};
  for (const kind of ['preliminary', 'report'] as const) {
    const f = meetingFields(kind, input.annual);
    const shouldRegister = f.mode === 'face' && !!f.date && !!f.time;
    const title = `${f.titlePrefix} · ${input.companyName}`;

    if (shouldRegister) {
      if (f.eventId) {
        const owner = (await eventOwnerName(f.eventId)) || MEETING_OWNER;
        if (managerNamesMatch(owner, MEETING_OWNER)) {
          try {
            await updatePersonalChecklistItem(f.eventId, owner, {
              title,
              dueDate: f.date,
              dueTime: f.time,
              clientId: input.clientId,
              taxType: 'other',
            });
            continue;
          } catch {
            /* 재생성 */
          }
        } else {
          // 예전 담당자 소유분이면 지우고 인디로 재생성
          try {
            await deletePersonalChecklistItem(f.eventId, owner);
          } catch {
            /* ignore */
          }
        }
      }
      const created = await createPersonalChecklistItem(MEETING_OWNER, {
        title,
        taxType: 'other',
        clientId: input.clientId,
        dueDate: f.date,
        dueTime: f.time,
      });
      patch[f.eventKey] = created.id;
    } else if (f.eventId) {
      const owner = (await eventOwnerName(f.eventId)) || MEETING_OWNER;
      try {
        await deletePersonalChecklistItem(f.eventId, owner);
      } catch {
        /* ignore */
      }
      patch[f.eventKey] = '';
    }
  }
  return patch;
}
