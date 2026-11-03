"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useId, useRef, useState } from "react";

import { AppBar } from "@/components/app-bar";
import { BottomCTA } from "@/components/bottom-cta";
import { ErrorState } from "@/components/error-state";
import { MemberAvatar } from "@/components/member-avatar";
import { Screen } from "@/components/screen";
import { useToast } from "@/components/toast";
import { TripHeader } from "@/components/trip-art";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/utils";
import { useJoinInfo, useJoinTrip } from "@/hooks";
import { t } from "@/i18n/ko";
import type { JoinInfo, JoinTripResult, MemberId } from "@/types/api";

/**
 * 이미 참여한 기기면 그 결과. 계약(`JoinInfo`)에 `alreadyJoined`가 아직 없어서(백엔드 변경안) 있을 때만 읽는다.
 * 계약에 들어오면 `info.alreadyJoined`로 바로 읽고 이 함수를 지운다.
 */
function readAlreadyJoined(info: JoinInfo): JoinTripResult | null {
  const value = (info as JoinInfo & { alreadyJoined?: JoinTripResult | null }).alreadyJoined;
  return value ?? null;
}

/** 참여 (동행, 웹) — 시안 "join": 초대 링크로 들어와 이름을 고르거나 새 이름을 더한다. 잠겼으면 마감 안내. */
export default function JoinPage() {
  // cacheComponents: useParams는 요청 시점에 정해지므로 Suspense 안에서 읽어야 빌드가 된다.
  return (
    <Suspense fallback={<JoinSkeleton />}>
      <JoinContent />
    </Suspense>
  );
}

function JoinContent() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const router = useRouter();
  const toast = useToast();
  const joinInfo = useJoinInfo(inviteCode);
  const joinTrip = useJoinTrip();

  const [pickedId, setPickedId] = useState<MemberId | null>(null);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameErrorId = useId();

  // 이 기기가 이미 참여한 방이면 이름 고르기 없이 홈으로 보낸다.
  const alreadyJoined = joinInfo.data ? readAlreadyJoined(joinInfo.data) : null;
  useEffect(() => {
    if (alreadyJoined) router.replace(`/trip/${alreadyJoined.tripId}`);
  }, [alreadyJoined, router]);

  if (joinInfo.status === "pending" || alreadyJoined) {
    return <JoinSkeleton />;
  }

  if (joinInfo.status === "error") {
    if (joinInfo.error.status === 404) {
      return (
        <CenterMessage
          barTitle={t("app.name")}
          title={t("join.notFoundTitle")}
          hint={t("join.notFoundHint")}
        />
      );
    }
    return (
      <>
        <AppBar title={t("app.name")} />
        <Screen>
          <ErrorState onRetry={() => joinInfo.refetch()} />
        </Screen>
      </>
    );
  }

  const { title, members, isLocked } = joinInfo.data;
  const organizer = members.find((member) => member.isOrganizer);
  const lockedByServer = joinTrip.error?.status === 423;

  if (isLocked || lockedByServer) {
    return (
      <CenterMessage
        barTitle={title}
        title={t("join.lockedTitle")}
        hint={t("join.lockedHint", { name: organizer?.name ?? "" })}
      />
    );
  }

  const trimmedName = newName.trim();

  function pick(memberId: MemberId) {
    setPickedId(memberId);
    setNewName("");
    setNameError(null);
  }

  function changeNewName(value: string) {
    setNewName(value);
    setNameError(null);
    if (value !== "") setPickedId(null);
  }

  // 오류는 입력칸 바로 아래에 보여주고 그 칸으로 이동한다
  function showNameError(message: string) {
    setNameError(message);
    nameInputRef.current?.focus();
  }

  function submit() {
    if (joinTrip.isPending) return;
    if (pickedId === null && trimmedName === "") {
      showNameError(t("join.nameMissing"));
      return;
    }
    if (pickedId === null && members.some((m) => m.name === trimmedName)) {
      showNameError(t("join.nameExists"));
      return;
    }
    const name =
      pickedId !== null
        ? (members.find((m) => m.id === pickedId)?.name ?? "")
        : trimmedName;
    const input =
      pickedId !== null
        ? { inviteCode, memberId: pickedId }
        : { inviteCode, newName: trimmedName };
    joinTrip.mutate(input, {
      onSuccess: ({ tripId }) => {
        router.replace(`/trip/${tripId}`);
        toast(t("join.joinedToast", { name }));
      },
      onError: (error) => {
        if (error.status === 409) {
          setPickedId(null);
          showNameError(t("join.nameTaken"));
          joinInfo.refetch();
        } else if (error.status !== 423) {
          toast(t("common.error"));
        }
      },
    });
  }

  return (
    <>
      <AppBar title={title} />
      <Screen>
        <TripHeader
          title={title}
          meta={organizer ? t("join.madeBy", { name: organizer.name }) : undefined}
        />

        <div className="grid gap-1">
          <h2 className="mt-1 text-title font-bold tracking-tight text-balance break-keep">
            {t("join.question")}
          </h2>
          <p className="text-hint text-sub">{t("join.hint")}</p>
        </div>

        <ul className="grid gap-2">
          {members.map((member, order) => (
            <li key={member.id}>
              <button
                type="button"
                disabled={member.isBound || joinTrip.isPending}
                aria-pressed={member.isBound ? undefined : pickedId === member.id}
                onClick={() => pick(member.id)}
                className={cn(
                  "press flex min-h-15 w-full items-center gap-3 rounded-lg border-2 border-line bg-paper px-3.5 text-left",
                  "aria-pressed:border-brand aria-pressed:bg-brand-soft",
                  "disabled:cursor-default disabled:text-sub",
                )}
              >
                <MemberAvatar name={member.name} order={order} />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    !member.isBound && "font-bold",
                  )}
                >
                  {member.name}
                </span>
                {member.isBound ? (
                  <span className="shrink-0 text-caption text-sub">
                    {t("join.boundMeta")}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>

        <label className="mt-1 grid gap-1.5 text-hint font-medium text-sub">
          {t("join.newNameLabel")}
          <Input
            ref={nameInputRef}
            name="name"
            value={newName}
            onChange={(event) => changeNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder={t("join.newNamePlaceholder")}
            autoComplete="name"
            spellCheck={false}
            enterKeyHint="done"
            maxLength={20}
            disabled={joinTrip.isPending}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
          />
        </label>
        {nameError ? (
          <p id={nameErrorId} className="-mt-2.5 text-caption font-medium text-send break-keep">
            {nameError}
          </p>
        ) : null}

        <BottomCTA
          disabled={joinTrip.isPending}
          aria-busy={joinTrip.isPending || undefined}
          onClick={submit}
        >
          {joinTrip.isPending ? t("join.submitting") : t("join.submit")}
        </BottomCTA>
      </Screen>
    </>
  );
}

function CenterMessage({
  barTitle,
  title,
  hint,
}: {
  barTitle: string;
  title: string;
  hint: string;
}) {
  return (
    <>
      <AppBar title={barTitle} />
      <Screen>
        <div className="mt-12 grid justify-items-center gap-2.5 text-center">
          <h2 className="text-title font-bold tracking-tight text-balance break-keep">
            {title}
          </h2>
          <p className="text-hint text-sub break-keep">{hint}</p>
        </div>
      </Screen>
    </>
  );
}

function JoinSkeleton() {
  return (
    <main
      aria-busy
      aria-label={t("common.loading")}
      className="flex flex-1 flex-col gap-4 bg-paper px-gutter pt-5"
    >
      <div className="grid gap-1">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-1">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-44" />
      </div>
      <div className="grid gap-2">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-15 rounded-lg" />
        ))}
      </div>
    </main>
  );
}
