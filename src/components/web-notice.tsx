import { AppBar } from "@/components/app-bar";
import { t } from "@/i18n/ko";

/** 웹 브라우저로 첫 화면에 왔을 때: 방은 앱에서 만든다는 안내만 보여준다. */
export function WebNotice() {
  return (
    <>
      <AppBar title={t("app.name")} />
      <main className="flex flex-1 flex-col px-gutter">
        <div className="mt-12 grid justify-items-center gap-2.5 text-center">
          <p className="bg-grad bg-clip-text text-wordmark font-black tracking-tighter text-transparent">
            {t("app.name")}
          </p>
          <h2 className="text-title font-bold tracking-tight text-balance break-keep">
            {t("web.title")}
          </h2>
          <p className="text-hint text-sub break-keep">{t("web.hint")}</p>
        </div>
      </main>
    </>
  );
}
