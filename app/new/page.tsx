"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AppBar } from "@/components/app-bar";
import { CreateTripForm, parseScope } from "@/components/create-trip-form";
import { Screen } from "@/components/screen";
import { useAppMode } from "@/components/use-app-mode";
import { cn } from "@/components/utils";
import { WebNotice } from "@/components/web-notice";
import { useTrips } from "@/hooks";
import { t } from "@/i18n/ko";

/**
 * 국내/해외 카드. 그림은 분위기만 보여주는 장식이다 (`public/art`).
 * 국내 카드는 그림이 겹쳐 보여서 뺐다 (`art: []`). 해외 카드는 그대로.
 */
const SCOPE_CHOICES = [
  {
    scope: "domestic",
    title: "create.scopeDomestic",
    hint: "create.scopeDomesticHint",
    art: [],
  },
  {
    scope: "overseas",
    title: "create.scopeOverseas",
    hint: "create.scopeOverseasHint",
    art: ["osaka-castle.svg", "eiffel.svg", "big-ben.svg"],
  },
] as const;

/**
 * 새 여행 (/new). `?scope=domestic|overseas`가 없으면 국내/해외부터 고르고, 있으면 여행 만들기 폼.
 * 방 만들기는 앱 안에서만 보인다 (웹 브라우저는 앱 안내만).
 */
export default function NewTripPage() {
  return (
    <Suspense fallback={null}>
      <NewTrip />
    </Suspense>
  );
}

function NewTrip() {
  const mode = useAppMode();
  const scope = parseScope(useSearchParams().get("scope"));

  if (mode === "checking") return null;
  if (mode === "web") return <WebNotice />;
  return scope ? <CreateTripForm scope={scope} /> : <ScopeChoice />;
}

/** 국내/해외 고르기 (시안 "scope"). 고른 값은 저장하지 않고 다음 화면 주소로만 넘긴다. */
function ScopeChoice() {
  const trips = useTrips();
  // 이미 여행이 있으면 목록으로 돌아갈 수 있다. 처음이면 돌아갈 곳이 없다.
  const hasTrips = (trips.data?.length ?? 0) > 0;

  return (
    <>
      <AppBar title={t("create.scopeBarTitle")} backHref={hasTrips ? "/" : undefined} />
      <Screen>
        <h2 className="mt-1 text-title font-bold tracking-tight">{t("create.scopeQuestion")}</h2>
        <p className="-mt-2 text-hint text-sub">{t("create.scopeHint")}</p>

        {/* 두 카드는 같은 높이. 그림이 없는 국내 카드도 해외 카드와 높이가 같고, 글은 세로 가운데에 온다. */}
        <div className="grid auto-rows-fr gap-4">
          {SCOPE_CHOICES.map((choice) => (
            <Link
              key={choice.scope}
              href={`/new?scope=${choice.scope}`}
              className="press grid content-center gap-1 rounded-2xl border-2 border-line bg-paper px-4.5 py-5 text-left"
            >
              {choice.art.length > 0 ? (
                <span aria-hidden className="mb-1.5 flex">
                  {choice.art.map((file, index) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={file}
                      src={`/art/${file}`}
                      alt=""
                      width={44}
                      height={44}
                      className={cn("size-11", index > 0 && "-ml-2.5")}
                    />
                  ))}
                </span>
              ) : null}
              <b className="text-lead font-bold">{t(choice.title)}</b>
              <span className="text-hint text-sub">{t(choice.hint)}</span>
            </Link>
          ))}
        </div>
      </Screen>
    </>
  );
}
