import { getAppConfig, setAppConfig } from '@/lib/appConfigDb';
import {
  DEFAULT_TEMPLATE_BY_SCENARIO,
  DEFAULT_VAT_REPORT_TEMPLATE,
  DEFAULT_PAYMENT_NOTICE_TEMPLATE,
  type TemplateScenario,
} from '@/app/tools/notice-generator/_lib/template';

const CONFIG_KEY = 'notice_default_templates';
/** 코드 배포로 기본 서식이 바뀌면 버전을 올려 DB에 저장된 값을 자동 갱신한다 */
const NOTICE_DEFAULTS_VERSION = 8;

type StoredNoticeDefaults = Partial<NoticeGlobalDefaults> & { _version?: number };

const CODE_DEFAULTS: NoticeGlobalDefaults = {
  general: DEFAULT_TEMPLATE_BY_SCENARIO.general,
  withholding_request: DEFAULT_TEMPLATE_BY_SCENARIO.withholding_request,
  withholding_filing: DEFAULT_TEMPLATE_BY_SCENARIO.withholding_filing,
  vatReport: DEFAULT_VAT_REPORT_TEMPLATE,
  paymentNotice: DEFAULT_PAYMENT_NOTICE_TEMPLATE,
};

export type NoticeGlobalDefaults = {
  general: string;
  withholding_request: string;
  withholding_filing: string;
  vatReport: string;
  paymentNotice: string;
};

function asHtml(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

function mergeFromStored(raw: StoredNoticeDefaults | null | undefined): NoticeGlobalDefaults {
  return {
    general: asHtml(raw?.general, CODE_DEFAULTS.general),
    withholding_request: asHtml(raw?.withholding_request, CODE_DEFAULTS.withholding_request),
    withholding_filing: asHtml(raw?.withholding_filing, CODE_DEFAULTS.withholding_filing),
    vatReport: asHtml(raw?.vatReport, CODE_DEFAULTS.vatReport),
    paymentNotice: asHtml(raw?.paymentNotice, CODE_DEFAULTS.paymentNotice),
  };
}

async function persistDefaults(defaults: NoticeGlobalDefaults): Promise<void> {
  await setAppConfig(CONFIG_KEY, { ...defaults, _version: NOTICE_DEFAULTS_VERSION });
}

/** 전역 기본 서식 — DB에 없으면 코드 기본값 */
export async function getNoticeGlobalDefaults(): Promise<NoticeGlobalDefaults> {
  const raw = await getAppConfig<StoredNoticeDefaults>(CONFIG_KEY);
  if (!raw) {
    const defaults = { ...CODE_DEFAULTS };
    await persistDefaults(defaults);
    return defaults;
  }

  const storedVersion = typeof raw._version === 'number' ? raw._version : 1;
  let defaults = mergeFromStored(raw);

  if (storedVersion < NOTICE_DEFAULTS_VERSION) {
    defaults = { ...defaults, vatReport: CODE_DEFAULTS.vatReport };
    await persistDefaults(defaults);
  }

  return defaults;
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
  await persistDefaults(next);
  return next;
}

export function scenarioDefaultFromGlobal(
  defaults: NoticeGlobalDefaults,
  scenario: TemplateScenario,
): string {
  if (scenario === 'withholding_request' || scenario === 'withholding_filing') {
    return defaults[scenario];
  }
  return defaults.general;
}
