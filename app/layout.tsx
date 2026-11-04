import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

import { ToastProvider } from "@/components/toast";
import { t } from "@/i18n/ko";
import { BackButtonHandler } from "@/lib/native/BackButtonHandler";
import { Providers } from "@/lib/providers";

// 시안 글꼴. 빌드 때 받아 함께 배포한다 (사용자 기기에서 Google에 요청하지 않음).
const notoSansKr = Noto_Sans_KR({
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-noto-sans-kr",
});

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={`h-full ${notoSansKr.variable}`}>
      <body className="min-h-full">
        <Providers>
          <ToastProvider>
            <BackButtonHandler />
            <div className="relative mx-auto flex min-h-dvh w-full max-w-app flex-col bg-background">
              {children}
            </div>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
