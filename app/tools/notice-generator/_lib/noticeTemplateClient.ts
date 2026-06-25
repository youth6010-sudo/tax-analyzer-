// 담당자(로그인 계정)별 안내문 서식 서버 연동 헬퍼.
// 저장된 서식이 없으면 빈 문자열을 반환하므로, 호출부에서 DEFAULT_TEMPLATE로 대체한다.

export async function fetchNoticeTemplate(signal?: AbortSignal): Promise<string> {
  const res = await fetch('/api/notice-template', {
    credentials: 'same-origin',
    signal,
  });
  if (!res.ok) throw new Error('서식을 불러오지 못했습니다.');
  const data = await res.json();
  return typeof data.template === 'string' ? data.template : '';
}

export async function saveNoticeTemplate(template: string): Promise<void> {
  const res = await fetch('/api/notice-template', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ template }),
  });
  if (!res.ok) throw new Error('서식을 저장하지 못했습니다.');
}
