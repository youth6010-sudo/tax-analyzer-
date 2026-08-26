// 담당자(로그인 계정)별 안내문·신고결과보고 서식 서버 연동.
//
// users.notice_template 에 JSON(NoticeTemplateStore)으로 저장한다.
// 레거시: 순수 HTML 또는 시나리오 맵만 있던 형식은 자동 마이그레이션.
// 예전 공통 general / paymentNoticeTemplate 은 부가세 전용으로만 이관한다.
// (전 세목 복사로 법인세·종소세에 부가세 내용이 들어간 경우 정리)

import type { TaxTypeKey } from './types';
import {
  emptyNoticeTemplateStore,
  NOTICE_TEMPLATE_SPLIT_VERSION,
  type NoticeTemplateStore,
  type TemplateMap,
  type TemplateScenario,
  type TemplateSource,
} from './template';

const LEGACY_SCENARIO_KEYS: TemplateScenario[] = [
  'general',
  'withholding_request',
  'withholding_filing',
];

/** 부가세와 동일하면 잘못 복사된 것으로 보고 비울 안내문 키 */
const GUIDE_NON_VAT: TemplateScenario[] = ['general_corporate', 'general_income'];

/** 부가세와 동일하면 잘못 복사된 것으로 보고 비울 납부안내 세목 */
const PAYMENT_NON_VAT: TaxTypeKey[] = ['corporate', 'income', 'withholding'];

function migrateLegacyMap(map: TemplateMap): NoticeTemplateStore {
  const sources: Partial<Record<TemplateScenario, TemplateSource>> = {};
  for (const k of LEGACY_SCENARIO_KEYS) {
    if (typeof map[k] === 'string' && map[k]!.trim()) {
      sources[k] = 'custom';
    }
  }
  return splitSharedTemplates({ version: 3, templates: map, sources });
}

function normHtml(html: string | undefined | null): string {
  return (html || '').replace(/\s+/g, ' ').trim();
}

function sameHtml(a: string | undefined | null, b: string | undefined | null): boolean {
  const na = normHtml(a);
  const nb = normHtml(b);
  return Boolean(na) && na === nb;
}

/**
 * 예전 공통 서식 → 부가세만 이관.
 * templateSplitVersion < 2 이면 법인세·종소세(·원천 납부)에 잘못 복사된 커스텀을 제거.
 */
function splitSharedTemplates(store: NoticeTemplateStore): NoticeTemplateStore {
  const templates: TemplateMap = { ...(store.templates ?? {}) };
  const sources: Partial<Record<TemplateScenario, TemplateSource>> = {
    ...(store.sources ?? {}),
  };

  const legacyGeneral = templates.general;
  if (legacyGeneral?.trim() && !templates.general_vat?.trim()) {
    templates.general_vat = legacyGeneral;
    sources.general_vat = sources.general ?? 'custom';
  }

  const paymentNoticeTemplates: Partial<Record<TaxTypeKey, string>> = {
    ...(store.paymentNoticeTemplates ?? {}),
  };
  const paymentNoticeSources: Partial<Record<TaxTypeKey, TemplateSource>> = {
    ...(store.paymentNoticeSources ?? {}),
  };
  const legacyPay = store.paymentNoticeTemplate;
  const hasAnyTaxPay = (['vat', 'withholding', 'corporate', 'income'] as TaxTypeKey[]).some(k =>
    Boolean(paymentNoticeTemplates[k]?.trim()),
  );
  if (legacyPay?.trim() && !hasAnyTaxPay) {
    paymentNoticeTemplates.vat = legacyPay;
    paymentNoticeSources.vat =
      store.paymentNoticeSource === 'default' || store.paymentNoticeSource === 'custom'
        ? store.paymentNoticeSource
        : 'custom';
  }

  const splitVer = store.templateSplitVersion ?? 1;
  const needsForceScrub = splitVer < NOTICE_TEMPLATE_SPLIT_VERSION;

  if (needsForceScrub) {
    // 세목 분리 직후 전 세목에 부가세 내용이 복제됨 → 법인세·종소세는 기본 서식으로 복구
    for (const key of GUIDE_NON_VAT) {
      delete templates[key];
      delete sources[key];
    }
    for (const key of PAYMENT_NON_VAT) {
      delete paymentNoticeTemplates[key];
      delete paymentNoticeSources[key];
    }
  } else {
    const vatGuide = templates.general_vat || legacyGeneral;
    for (const key of GUIDE_NON_VAT) {
      if (sameHtml(templates[key], vatGuide) || sameHtml(templates[key], legacyGeneral)) {
        delete templates[key];
        delete sources[key];
      }
    }
    const vatPay = paymentNoticeTemplates.vat || legacyPay;
    for (const key of PAYMENT_NON_VAT) {
      if (
        sameHtml(paymentNoticeTemplates[key], vatPay) ||
        sameHtml(paymentNoticeTemplates[key], legacyPay)
      ) {
        delete paymentNoticeTemplates[key];
        delete paymentNoticeSources[key];
      }
    }
  }

  return {
    ...store,
    version: 3,
    templateSplitVersion: NOTICE_TEMPLATE_SPLIT_VERSION,
    templates,
    sources,
    paymentNoticeTemplates,
    paymentNoticeSources,
  };
}

/** 정리 전후가 달라졌는지 — 서버에 다시 저장할지 판단 */
function scrubChanged(raw: string, after: NoticeTemplateStore): boolean {
  if (!raw.trim().startsWith('{')) {
    return Boolean(after.templates.general_vat?.trim());
  }
  try {
    const obj = JSON.parse(raw) as NoticeTemplateStore;
    if ((obj.templateSplitVersion ?? 1) < NOTICE_TEMPLATE_SPLIT_VERSION) return true;

    const beforeTemplates = obj.templates ?? {};
    const beforePay = {
      ...(obj.paymentNoticeTemplates ?? {}),
    };
    if (
      obj.paymentNoticeTemplate?.trim() &&
      !Object.values(beforePay).some(v => Boolean(v?.trim())) &&
      after.paymentNoticeTemplates?.vat?.trim()
    ) {
      return true;
    }
    if (
      beforeTemplates.general?.trim() &&
      !beforeTemplates.general_vat?.trim() &&
      after.templates.general_vat?.trim()
    ) {
      return true;
    }

    const vatGuide = beforeTemplates.general_vat || beforeTemplates.general || '';
    const vatPay = beforePay.vat || obj.paymentNoticeTemplate || '';

    for (const key of GUIDE_NON_VAT) {
      if (sameHtml(beforeTemplates[key], vatGuide) && !after.templates[key]?.trim()) return true;
      if (sameHtml(beforeTemplates[key], beforeTemplates.general) && !after.templates[key]?.trim())
        return true;
    }
    for (const key of PAYMENT_NON_VAT) {
      if (sameHtml(beforePay[key], vatPay) && !after.paymentNoticeTemplates?.[key]?.trim())
        return true;
      if (
        sameHtml(beforePay[key], obj.paymentNoticeTemplate) &&
        !after.paymentNoticeTemplates?.[key]?.trim()
      )
        return true;
    }
  } catch {
    return false;
  }
  return false;
}

function normalizeStore(store: Partial<NoticeTemplateStore>): NoticeTemplateStore {
  return splitSharedTemplates({
    version: 3,
    templateSplitVersion: store.templateSplitVersion,
    templates: { ...(store.templates ?? {}) },
    sources: { ...(store.sources ?? {}) },
    vatReportTemplate:
      typeof store.vatReportTemplate === 'string' ? store.vatReportTemplate : undefined,
    vatReportSource:
      store.vatReportSource === 'custom' || store.vatReportSource === 'default'
        ? store.vatReportSource
        : store.vatReportTemplate?.trim()
          ? 'custom'
          : 'default',
    paymentNoticeTemplate:
      typeof store.paymentNoticeTemplate === 'string' ? store.paymentNoticeTemplate : undefined,
    paymentNoticeSource:
      store.paymentNoticeSource === 'custom' || store.paymentNoticeSource === 'default'
        ? store.paymentNoticeSource
        : store.paymentNoticeTemplate?.trim()
          ? 'custom'
          : 'default',
    paymentNoticeTemplates: store.paymentNoticeTemplates
      ? { ...store.paymentNoticeTemplates }
      : undefined,
    paymentNoticeSources: store.paymentNoticeSources
      ? { ...store.paymentNoticeSources }
      : undefined,
    officialLetters: store.officialLetters ? { ...store.officialLetters } : undefined,
    officialLetterSources: store.officialLetterSources
      ? { ...store.officialLetterSources }
      : undefined,
    officialFormTemplates: store.officialFormTemplates
      ? { ...store.officialFormTemplates }
      : undefined,
    officialFormSources: store.officialFormSources ? { ...store.officialFormSources } : undefined,
  });
}

export function parseNoticeTemplateStore(raw: string): NoticeTemplateStore {
  if (!raw || !raw.trim()) return emptyNoticeTemplateStore();
  const trimmed = raw.trim();

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;

      if (
        (obj.version === 3 || obj.version === 2) &&
        typeof obj.templates === 'object' &&
        obj.templates
      ) {
        return normalizeStore(obj as NoticeTemplateStore);
      }

      const hasScenarioKey = LEGACY_SCENARIO_KEYS.some(k => typeof obj[k] === 'string');
      if (hasScenarioKey) {
        const map: TemplateMap = {};
        for (const k of LEGACY_SCENARIO_KEYS) {
          if (typeof obj[k] === 'string') map[k] = obj[k] as string;
        }
        return migrateLegacyMap(map);
      }
    } catch {
      /* 레거시 HTML로 취급 */
    }
  }

  return migrateLegacyMap({ general: raw });
}

/**
 * 파싱 + (부가세 복제 정리 시) 서버에 다시 저장.
 * 페이지 로드 시 한 번 호출하면 DB에 꼬인 법인세·종소세 서식이 기본값으로 복구됩니다.
 */
export async function fetchNoticeTemplateStore(signal?: AbortSignal): Promise<NoticeTemplateStore> {
  const res = await fetch('/api/notice-template', {
    credentials: 'same-origin',
    signal,
  });
  if (!res.ok) throw new Error('서식을 불러오지 못했습니다.');
  const data = await res.json();
  const raw = typeof data.template === 'string' ? data.template : '';
  const parsed = parseNoticeTemplateStore(raw);

  if (scrubChanged(raw, parsed) && !signal?.aborted) {
    try {
      await saveNoticeTemplateStore(parsed);
    } catch {
      /* 로드는 유지, 저장 실패는 무시 */
    }
  }

  return parsed;
}

export async function saveNoticeTemplateStore(store: NoticeTemplateStore): Promise<void> {
  const res = await fetch('/api/notice-template', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ template: JSON.stringify(store) }),
  });
  if (!res.ok) throw new Error('서식을 저장하지 못했습니다.');
}

/** @deprecated fetchNoticeTemplateStore 사용 */
export async function fetchNoticeTemplates(signal?: AbortSignal): Promise<TemplateMap> {
  const store = await fetchNoticeTemplateStore(signal);
  return store.templates;
}

/** @deprecated saveNoticeTemplateStore 사용 */
export async function saveNoticeTemplates(map: TemplateMap): Promise<void> {
  const prev = await fetchNoticeTemplateStore();
  await saveNoticeTemplateStore({ ...prev, templates: map });
}
