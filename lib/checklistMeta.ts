import { CHECKLIST_KEYS } from '@/app/types/intake';
import type { ChecklistKey } from '@/app/types/intake';
import type { ChecklistMeta, ProcessChecklist } from '@/app/types/externalRefs';

export function checklistBools(checklist: ProcessChecklist | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of CHECKLIST_KEYS) {
    out[k] = Boolean(checklist?.[k]);
  }
  return out;
}

export function applyChecklistMeta(
  checklist: ProcessChecklist,
  toggledKey: ChecklistKey,
  actorName: string,
): ProcessChecklist {
  const next: ProcessChecklist = { ...checklist };
  const meta: ChecklistMeta = { ...(next._meta ?? {}) };
  if (next[toggledKey]) {
    meta[toggledKey] = { by: actorName, at: new Date().toISOString() };
  } else {
    delete meta[toggledKey];
  }
  next._meta = meta;
  return next;
}
