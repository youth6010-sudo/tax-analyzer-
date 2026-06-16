/** 외부 시스템(TP·세무사랑·위멤버스) 연동 ID 레지스트리 */

export type ExternalRefEntry = {
  id?: string;
  url?: string;
  registeredAt?: string;
  syncedAt?: string;
  registeredBy?: string;
  note?: string;
};

export type ExternalRefs = {
  tp?: ExternalRefEntry;
  semorang?: ExternalRefEntry;
  wemembers?: ExternalRefEntry;
};

export type ChecklistMetaEntry = { by: string; at: string };
export type ChecklistMeta = Record<string, ChecklistMetaEntry>;

export type ProcessChecklist = Record<string, boolean | string | ChecklistMeta | undefined> & {
  _meta?: ChecklistMeta;
};
