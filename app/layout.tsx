import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "종합소득세 신고서 분석 도구",
  description: "PDF 종합소득세 신고서를 업로드하여 업종별 단순경비율과 실제 소득율을 자동 비교 분석합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
