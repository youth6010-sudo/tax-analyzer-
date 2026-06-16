export interface IntakeField {
  key: string;
  label: string;
  required?: boolean;
  type?: 'entity' | 'services' | 'taxTypes' | 'checklist' | 'textarea' | 'date' | 'number' | 'select';
  options?: string[];
}

export interface IntakeStep {
  id: string;
  title: string;
  description: string;
  fields: IntakeField[];
}

export interface IntakeManual {
  version: number;
  steps: IntakeStep[];
}

export const CHECKLIST_KEYS = [
  'contractSent',
  'consent',
  'cms',
  'assignee',
  'programClient',
  'blueholeClient',
  'tpClient',
  'semoReport',
  'bizAccount',
  'kakaoRoom',
] as const;

/** checklist JSON 내부 — 블루홀 업체/케이스 번호 */
export const BLUEHOLE_CODE_KEY = '_blueholeCode';

export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];
