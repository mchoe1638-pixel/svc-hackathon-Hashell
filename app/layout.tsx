import type { Metadata, Viewport } from "next";
import "./globals.css";

import { t } from "@/i18n/ko";
import { Providers } from "@/lib/providers";

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
    <html lang="ko" className="h-full">
      <body className="min-h-full">
        <Providers>
          <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-background">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
