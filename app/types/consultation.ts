export interface FieldCondition {
  field: string;
  values: string[];
}

export interface ConsultationField {
  key: string;
  label: string;
  required?: boolean;
  type?: 'textarea' | 'date' | 'number' | 'email' | 'password' | 'select';
  options?: string[];
  placeholder?: string;
  showWhen?: FieldCondition;
}

export interface ConsultationStep {
  id: string;
  phase: string;
  order: number;
  title: string;
  description?: string;
  guide?: string;
  fields: ConsultationField[];
}

export interface ConsultationPhase {
  id: string;
  label: string;
}

export interface ConsultationFormConfig {
  version: number;
  title: string;
  subtitle?: string;
  note?: string;
  phases: ConsultationPhase[];
  steps: ConsultationStep[];
  /** @deprecated v1 sections */
  sections?: { id: string; title: string; fields: ConsultationField[] }[];
}

export type ConsultationFormData = Record<string, string | number>;

export function getActiveSteps(config: ConsultationFormConfig): ConsultationStep[] {
  if (config.steps?.length) return [...config.steps].sort((a, b) => a.order - b.order);
  return (config.sections ?? []).map((s, i) => ({
    id: s.id,
    phase: 'legacy',
    order: i + 1,
    title: s.title,
    fields: s.fields,
  }));
}

export function isFieldVisible(field: ConsultationField, form: Record<string, string>): boolean {
  if (!field.showWhen) return true;
  const val = form[field.showWhen.field]?.trim() ?? '';
  return field.showWhen.values.includes(val);
}

export function phaseLabel(config: ConsultationFormConfig, phaseId: string): string {
  return config.phases.find(p => p.id === phaseId)?.label ?? phaseId;
}

export type ConsultationPhaseColumn = {
  phaseId: string;
  label: string;
  steps: ConsultationStep[];
};

/** 단계별 마법사 대신 3열(전화·대면·마무리) 레이아웃용 */
export function getPhaseColumns(config: ConsultationFormConfig): ConsultationPhaseColumn[] {
  const steps = getActiveSteps(config);
  return config.phases.map(p => ({
    phaseId: p.id,
    label: p.label,
    steps: steps.filter(s => s.phase === p.id),
  }));
}
