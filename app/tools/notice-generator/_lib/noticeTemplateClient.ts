// 담당자(로그인 계정)별 안내문 서식 서버 연동 헬퍼.
//
// 서버에는 users.noticeTemplate 단일 문자열로 저장되지만, 시나리오별 서식을
// 지원하기 위해 JSON(TemplateMap)으로 인코딩해 저장한다.
// - 과거에 저장된 값(순수 HTML 문자열)은 general 시나리오로 자동 마이그레이션한다.

import type { TemplateMap, TemplateScenario } from './template';

const SCENARIO_KEYS: TemplateScenario[] = [
  'general',
  'withholding_request',
  'withholding_filing',
];

function parseStored(raw: string): TemplateMap {
  if (!raw || !raw.trim()) return {};
  const trimmed = raw.trim();
  // JSON(map)으로 저장된 경우
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      // 시나리오 키를 가진 객체인지 확인 (HTML이 우연히 {로 시작하는 경우 방지)
      const hasScenarioKey = SCENARIO_KEYS.some(k => typeof obj[k] === 'string');
      if (hasScenarioKey) {
        const out: TemplateMap = {};
        for (const k of SCENARIO_KEYS) {
          if (typeof obj[k] === 'string') out[k] = obj[k] as string;
        }
        return out;
      }
    } catch {
      // JSON 파싱 실패 → 레거시 HTML로 취급
    }
  }
  // 레거시: 순수 HTML 한 벌 → general
  return { general: raw };
}

export async function fetchNoticeTemplates(signal?: AbortSignal): Promise<TemplateMap> {
  const res = await fetch('/api/notice-template', {
    credentials: 'same-origin',
    signal,
  });
  if (!res.ok) throw new Error('서식을 불러오지 못했습니다.');
  const data = await res.json();
  return parseStored(typeof data.template === 'string' ? data.template : '');
}

export async function saveNoticeTemplates(map: TemplateMap): Promise<void> {
  const res = await fetch('/api/notice-template', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ template: JSON.stringify(map) }),
  });
  if (!res.ok) throw new Error('서식을 저장하지 못했습니다.');
}
