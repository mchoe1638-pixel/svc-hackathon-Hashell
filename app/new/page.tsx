"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AppBar } from "@/components/app-bar";
import {
  CreateTripForm,
  parseFund,
  parseScope,
  type TripScope,
} from "@/components/create-trip-form";
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

/** 공금 카드. 국내/해외 카드와 같은 모양이고 그림은 없다. */
const FUND_CHOICES = [
  { value: "yes", title: "create.fundYes", hint: "create.fundYesHint" },
  { value: "no", title: "create.fundNo", hint: "create.fundNoHint" },
] as const;

/**
 * 새 여행 (/new). 국내/해외(`?scope=`) → 공금(`&fund=yes|no`) 순서로 고르고, 둘 다 있으면 여행 만들기 폼.
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
  const params = useSearchParams();
  const scope = parseScope(params.get("scope"));
  const usesFund = parseFund(params.get("fund"));

  if (mode === "checking") return null;
  if (mode === "web") return <WebNotice />;
  if (!scope) return <ScopeChoice />;
  if (usesFund === null) return <FundChoice scope={scope} />;
  return <CreateTripForm scope={scope} usesFund={usesFund} />;
}

/** 공금 고르기 (국내/해외 다음). 고른 값은 저장하지 않고 다음 화면 주소로만 넘긴다. */
function FundChoice({ scope }: { scope: TripScope }) {
  return (
    <>
      <AppBar title={t("create.scopeBarTitle")} backHref="/new" />
      <Screen>
        <h2 className="mt-1 text-title font-bold tracking-tight">{t("create.fundQuestion")}</h2>
        <p className="-mt-2 text-hint text-sub">{t("create.fundHint")}</p>

        <div className="grid auto-rows-fr gap-4">
          {FUND_CHOICES.map((choice) => (
            <Link
              key={choice.value}
              href={`/new?scope=${scope}&fund=${choice.value}`}
              className="press grid content-center gap-1 rounded-2xl border-2 border-line bg-paper px-4.5 py-5 text-left"
            >
              <b className="text-lead font-bold">{t(choice.title)}</b>
              <span className="text-hint text-sub">{t(choice.hint)}</span>
            </Link>
          ))}
        </div>
      </Screen>
    </>
  );
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
