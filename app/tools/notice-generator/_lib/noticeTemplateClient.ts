// 담당자(로그인 계정)별 안내문·신고결과보고 서식 서버 연동.
//
// users.notice_template 에 JSON(NoticeTemplateStore)으로 저장한다.
// 레거시: 순수 HTML 또는 시나리오 맵만 있던 형식은 자동 마이그레이션.

import {
  emptyNoticeTemplateStore,
  type NoticeTemplateStore,
  type TemplateMap,
  type TemplateScenario,
  type TemplateSource,
} from './template';

const SCENARIO_KEYS: TemplateScenario[] = [
  'general',
  'withholding_request',
  'withholding_filing',
];

function migrateLegacyMap(map: TemplateMap): NoticeTemplateStore {
  const sources: Partial<Record<TemplateScenario, TemplateSource>> = {};
  for (const k of SCENARIO_KEYS) {
    if (typeof map[k] === 'string' && map[k]!.trim()) {
      sources[k] = 'custom';
    }
  }
  return { version: 2, templates: map, sources };
}

export function parseNoticeTemplateStore(raw: string): NoticeTemplateStore {
  if (!raw || !raw.trim()) return emptyNoticeTemplateStore();
  const trimmed = raw.trim();

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;

      if (obj.version === 2 && typeof obj.templates === 'object' && obj.templates) {
        const store = obj as NoticeTemplateStore;
        return {
          version: 2,
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
        };
      }

      const hasScenarioKey = SCENARIO_KEYS.some(k => typeof obj[k] === 'string');
      if (hasScenarioKey) {
        const map: TemplateMap = {};
        for (const k of SCENARIO_KEYS) {
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

export async function fetchNoticeTemplateStore(signal?: AbortSignal): Promise<NoticeTemplateStore> {
  const res = await fetch('/api/notice-template', {
    credentials: 'same-origin',
    signal,
  });
  if (!res.ok) throw new Error('서식을 불러오지 못했습니다.');
  const data = await res.json();
  return parseNoticeTemplateStore(typeof data.template === 'string' ? data.template : '');
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
  const store = await fetchNoticeTemplateStore().catch(() => emptyNoticeTemplateStore());
  const sources = { ...store.sources };
  for (const k of SCENARIO_KEYS) {
    if (typeof map[k] === 'string' && map[k]!.trim()) sources[k] = 'custom';
  }
  await saveNoticeTemplateStore({ ...store, templates: map, sources });
}
