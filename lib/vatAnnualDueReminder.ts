import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { personalChecklistItems } from '@/db/schema';
import { listClients, updateClientDetail } from '@/lib/clientsDb';
import {
  createPersonalChecklistItem,
  deletePersonalChecklistItem,
  updatePersonalChecklistItem,
} from '@/lib/personalChecklist';
import {
  mergeVatAnnualYearStatePatch,
  readVatAnnualYearState,
  type VatAnnualYearState,
} from '@/lib/vatAnnualProgress';
import { managerNamesMatch } from '@/app/utils/managerMatch';

type DueKind = 'preliminary' | 'report';

function todayYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dueFields(kind: DueKind, annual: VatAnnualYearState, year: number) {
  if (kind === 'preliminary') {
    return {
      dueDate: annual.preliminaryReportDueDate || '',
      done: !!annual.preliminaryReport,
      eventId: annual.preliminaryReportDueEventId || '',
      eventKey: 'preliminaryReportDueEventId' as const,
      title: `${year}년 3/4분기 결산(가결산)`,
    };
  }
  return {
    dueDate: annual.reportDueDate || '',
    done: !!annual.report,
    eventId: annual.reportDueEventId || '',
    eventKey: 'reportDueEventId' as const,
    title: `${year}년 결산(법인 보고서)`,
  };
}

/** 완료예정일이 오늘보다 이전(마감 경과) */
export function isAnnualDueOverdue(dueDate: string, today = todayYmd()): boolean {
  const d = dueDate.trim();
  return !!d && d < today;
}

async function getChecklistLite(eventId: string): Promise<{
  ownerName: string;
  title: string;
  dueDate: string;
  completed: boolean;
} | null> {
  const db = getDb();
  const [row] = await db
    .select({
      ownerName: personalChecklistItems.ownerName,
      title: personalChecklistItems.title,
      dueDate: personalChecklistItems.dueDate,
      completed: personalChecklistItems.completed,
    })
    .from(personalChecklistItems)
    .where(eq(personalChecklistItems.id, eventId))
    .limit(1);
  return row ?? null;
}

/**
 * 가결산·보고서 완료예정일이 지났고 완료 체크가 없으면 담당자 개인 할일에 상기 등록.
 * 완료되거나 예정일이 비었거나 아직 안 지났으면 연동 할일 제거.
 */
export async function syncAnnualDueReminders(input: {
  managerName: string;
  clientId: string;
  companyName: string;
  year: number;
  annual: VatAnnualYearState;
}): Promise<Partial<VatAnnualYearState>> {
  const manager = input.managerName.trim();
  const patch: Partial<VatAnnualYearState> = {};
  const today = todayYmd();

  for (const kind of ['preliminary', 'report'] as const) {
    const f = dueFields(kind, input.annual, input.year);
    const shouldRemind = !f.done && isAnnualDueOverdue(f.dueDate, today) && !!manager;
    const title = `${f.title} · ${input.companyName}`;

    if (shouldRemind) {
      if (f.eventId) {
        const existing = await getChecklistLite(f.eventId);
        if (existing) {
          if (!managerNamesMatch(existing.ownerName, manager)) {
            try {
              await deletePersonalChecklistItem(f.eventId, existing.ownerName);
            } catch {
              /* ignore */
            }
          } else if (
            existing.title === title
            && existing.dueDate === f.dueDate
            && !existing.completed
          ) {
            continue;
          } else {
            try {
              await updatePersonalChecklistItem(f.eventId, existing.ownerName, {
                title,
                dueDate: f.dueDate,
                dueTime: '',
                clientId: input.clientId,
                taxType: 'other',
                completed: false,
              });
              continue;
            } catch {
              /* 재생성 */
            }
          }
        }
      }
      const created = await createPersonalChecklistItem(manager, {
        title,
        taxType: 'other',
        clientId: input.clientId,
        dueDate: f.dueDate,
        dueTime: '',
      });
      patch[f.eventKey] = created.id;
    } else if (f.eventId) {
      const existing = await getChecklistLite(f.eventId);
      const owner = existing?.ownerName || manager || 'system';
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

function yearsInIntake(intakeData: Record<string, unknown> | null | undefined): number[] {
  const raw = intakeData?.vatAnnualProgress;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return [new Date().getFullYear()];
  }
  const years = Object.keys(raw as object)
    .map(k => Number(k))
    .filter(y => Number.isFinite(y) && y >= 2020 && y <= 2100);
  const cur = new Date().getFullYear();
  if (!years.includes(cur)) years.push(cur);
  return [...new Set(years)].sort((a, b) => b - a);
}

/** 담당자 홈/할일 조회 시 — 담당 수임처의 경과된 가결산·보고서 예정일을 할일로 맞춤 */
export async function syncAnnualDueRemindersForManager(input: {
  userId: string;
  userName: string;
}): Promise<{ scanned: number; patched: number }> {
  const rows = await listClients({
    mineOnly: true,
    userId: input.userId,
    userName: input.userName,
    includeVatProgress: true,
    status: 'active',
  });

  let patched = 0;
  for (const client of rows) {
    const manager = (client.manager || '').trim();
    if (!manager) continue;
    if (!managerNamesMatch(manager, input.userName)) continue;

    const intake = (client.intakeData ?? {}) as Record<string, unknown>;
    let nextIntake = { ...intake };
    let dirty = false;

    for (const year of yearsInIntake(intake)) {
      const annual = readVatAnnualYearState(nextIntake, year);
      const duePatch = await syncAnnualDueReminders({
        managerName: manager,
        clientId: client.id,
        companyName: client.companyName || '',
        year,
        annual,
      });
      if (Object.keys(duePatch).length === 0) continue;
      nextIntake = mergeVatAnnualYearStatePatch(nextIntake, year, duePatch);
      dirty = true;
    }

    if (dirty) {
      await updateClientDetail(client.id, { intakeData: nextIntake });
      patched += 1;
    }
  }

  return { scanned: rows.length, patched };
}
