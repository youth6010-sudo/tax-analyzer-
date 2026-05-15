import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Docker 등 자체 호스팅용 단일 실행 번들 (Vercel도 호환) */
  output: "standalone",
  /**
   * Next.js 15+ 개발 모드: localhost 외 호스트에서 온 요청은 /_next/* 등이 기본 차단됨.
   * 127.0.0.1·IPv6 로 접속한 일반 브라우저에서도 스크립트가 로드되도록 허용.
   * (Cursor 미리보기는 localhost 쪽이라 되고, 크롬만 127로 열면 깨지는 현상 완화)
   */
  allowedDevOrigins: ["127.0.0.1", "::1", "[::1]"],
  turbopack: {
    resolveAlias: {
      canvas: "./empty-module.js",
    },
  },
};

export default nextConfig;
