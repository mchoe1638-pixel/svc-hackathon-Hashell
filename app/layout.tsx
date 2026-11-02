import type { Metadata, Viewport } from "next";
import "./globals.css";

import { t } from "@/i18n/ko";

export const metadata: Metadata = {
  title: t("app.name"),
  description: t("app.description"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // env(safe-area-inset-bottom) 사용에 필요
  themeColor: "#ffffff",
  colorScheme: "light",
};

// TODO: 백엔드가 src/lib/providers.tsx를 주면 {children}을 <Providers>로 감싼다.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full">
        <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-background">
          {children}
        </div>
      </body>
    </html>
  );
}
