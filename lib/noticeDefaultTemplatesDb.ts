import { getAppConfig, setAppConfig } from '@/lib/appConfigDb';
import {
  DEFAULT_TEMPLATE_BY_SCENARIO,
  DEFAULT_VAT_REPORT_TEMPLATE,
  DEFAULT_PAYMENT_NOTICE_TEMPLATE,
  type TemplateScenario,
} from '@/app/tools/notice-generator/_lib/template';

const CONFIG_KEY = 'notice_default_templates';

export type NoticeGlobalDefaults = {
  general: string;
  withholding_request: string;
  withholding_filing: string;
  vatReport: string;
  paymentNotice: string;
};

const CODE_DEFAULTS: NoticeGlobalDefaults = {
  general: DEFAULT_TEMPLATE_BY_SCENARIO.general,
  withholding_request: DEFAULT_TEMPLATE_BY_SCENARIO.withholding_request,
  withholding_filing: DEFAULT_TEMPLATE_BY_SCENARIO.withholding_filing,
  vatReport: DEFAULT_VAT_REPORT_TEMPLATE,
  paymentNotice: DEFAULT_PAYMENT_NOTICE_TEMPLATE,
};

function asHtml(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

/** 전역 기본 서식 — DB에 없으면 코드 기본값 */
export async function getNoticeGlobalDefaults(): Promise<NoticeGlobalDefaults> {
  const raw = await getAppConfig<Partial<NoticeGlobalDefaults>>(CONFIG_KEY);
  if (!raw) return { ...CODE_DEFAULTS };
  return {
    general: asHtml(raw.general, CODE_DEFAULTS.general),
    withholding_request: asHtml(raw.withholding_request, CODE_DEFAULTS.withholding_request),
    withholding_filing: asHtml(raw.withholding_filing, CODE_DEFAULTS.withholding_filing),
    vatReport: asHtml(raw.vatReport, CODE_DEFAULTS.vatReport),
    paymentNotice: asHtml(raw.paymentNotice, CODE_DEFAULTS.paymentNotice),
  };
}

export async function setNoticeGlobalDefaults(
  patch: Partial<NoticeGlobalDefaults>,
): Promise<NoticeGlobalDefaults> {
  const current = await getNoticeGlobalDefaults();
  const next: NoticeGlobalDefaults = {
    general: asHtml(patch.general, current.general),
    withholding_request: asHtml(patch.withholding_request, current.withholding_request),
    withholding_filing: asHtml(patch.withholding_filing, current.withholding_filing),
    vatReport: asHtml(patch.vatReport, current.vatReport),
    paymentNotice: asHtml(patch.paymentNotice, current.paymentNotice),
  };
  await setAppConfig(CONFIG_KEY, next);
  return next;
}

export function scenarioDefaultFromGlobal(
  defaults: NoticeGlobalDefaults,
  scenario: TemplateScenario,
): string {
  return defaults[scenario];
}
