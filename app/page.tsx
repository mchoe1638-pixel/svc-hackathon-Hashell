import { t } from "@/i18n/ko";

// TODO(ui/create): 방 만들기 화면 (여행명, 현지통화, 멤버 이름)으로 교체한다.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col justify-center gap-2 px-gutter">
      <h1 className="text-title font-bold text-brand">{t("app.name")}</h1>
      <p className="text-body text-muted-foreground">{t("app.description")}</p>
    </main>
  );
}
