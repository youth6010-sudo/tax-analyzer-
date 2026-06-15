/** 외부 시스템(블루홀·TP·세무사랑·위멤버스) 연동 ID 레지스트리 */

export type ExternalRefEntry = {
  id?: string;
  url?: string;
  registeredAt?: string;
  syncedAt?: string;
  registeredBy?: string;
  note?: string;
};

export type ExternalRefs = {
  bluehole?: ExternalRefEntry;
  tp?: ExternalRefEntry;
  semorang?: ExternalRefEntry;
  wemembers?: ExternalRefEntry;
};

export type ChecklistMetaEntry = { by: string; at: string };
export type ChecklistMeta = Record<string, ChecklistMetaEntry>;

export type ProcessChecklist = Record<string, boolean | ChecklistMeta | undefined> & {
  _meta?: ChecklistMeta;
};
