import type { NextConfig } from "next";

/** 사무실 PC 여러 대에서 dev 접속 시 HMR 차단 완화: .env.local 에 ALLOWED_DEV_ORIGINS=192.168.0.10,192.168.0.11 */
const extraDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(/[,;\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  /** Docker 등 자체 호스팅용 단일 실행 번들 (Vercel도 호환) */
  output: "standalone",
  allowedDevOrigins: Array.from(
    new Set([...extraDevOrigins, "127.0.0.1", "::1", "[::1]", "192.168.0.42"]),
  ),
  turbopack: {
    resolveAlias: {
      canvas: "./empty-module.js",
    },
  },
};

export default nextConfig;
