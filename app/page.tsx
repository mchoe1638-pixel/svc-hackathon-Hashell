import { AppBar } from "@/components/app-bar";
import { t } from "@/i18n/ko";

/**
 * 첫 화면 (/). 웹 브라우저로 오면 앱 안내만 보여준다.
 * TODO(ui/create): 백엔드가 `src/lib/native.ts`의 `isNativeApp()`을 만들면,
 * 앱 안에서는 방 만들기 화면을 보여주도록 나눈다.
 */
export default function Home() {
  return (
    <>
      <AppBar title={t("app.name")} />
      <main className="flex flex-1 flex-col px-gutter">
        <div className="mt-12 grid justify-items-center gap-2.5 text-center">
          <p className="text-5xl leading-tight font-black tracking-tighter text-brand">
            {t("app.name")}
          </p>
          <h2 className="text-title font-bold tracking-tight break-keep">
            {t("web.title")}
          </h2>
          <p className="text-sm text-muted-foreground break-keep">
            {t("web.hint")}
          </p>
        </div>
      </main>
    </>
  );
}
