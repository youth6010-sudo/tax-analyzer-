import { clientIpFromHeaders, isYouthIdsIpAllowed } from '@/lib/clientIp';

/** 청년들 ID 경로 여부 */
export function isYouthIdsPath(pathname: string): boolean {
  return pathname === '/youth-ids' || pathname.startsWith('/youth-ids/');
}

export function youthIdsForbiddenHtml(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>회사 네트워크에서만 이용</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
      background: #f1f5f9; color: #0f172a; }
    main { max-width: 28rem; padding: 2rem; text-align: center; }
    h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
    p { margin: 0 0 1.25rem; color: #475569; line-height: 1.6; font-size: 0.95rem; }
    a { color: #1d4ed8; font-weight: 600; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <main>
    <h1>회사 네트워크에서만 이용할 수 있습니다</h1>
    <p>청년들 ID는 사무실 공인 IP에서만 열립니다. 회사망에 연결된 뒤 다시 시도해 주세요.</p>
    <a href="/">대시보드로 돌아가기</a>
  </main>
</body>
</html>`;
}

export function assertYouthIdsIpAllowed(headers: Headers): boolean {
  const ip = clientIpFromHeaders(headers);
  return isYouthIdsIpAllowed(ip);
}
