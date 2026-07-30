import type { Metadata } from "next";
import "./globals.css";
import AppChrome from "./components/dashboard/AppChrome";

export const metadata: Metadata = {
  title: "청년들 B-System",
  description: "세무법인청년들 부산지점 업무 포털",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
