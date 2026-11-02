"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";

import { AppBar } from "@/components/app-bar";
import { BottomCTA } from "@/components/bottom-cta";
import { ErrorState } from "@/components/error-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/utils";
import { useJoinInfo, useJoinTrip } from "@/hooks";
import { t } from "@/i18n/ko";
import type { MemberId } from "@/types/api";

/**
 * 참여 (동행, 웹): 초대 링크로 들어와 내 이름을 누르면 바로 참여한다.
 * 목록에 없으면 새 이름으로 참여. 잠겼으면 마감 안내.
 */
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
  const joinInfo = useJoinInfo(inviteCode);
  const joinTrip = useJoinTrip();

  const [newName, setNewName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  if (joinInfo.status === "pending") {
    return <JoinSkeleton />;
  }

  if (joinInfo.status === "error") {
    if (joinInfo.error.status === 404) {
      return (
        <CenterMessage
          title={t("join.notFoundTitle")}
          hint={t("join.notFoundHint")}
        />
      );
    }
    return (
      <main className="flex flex-1 flex-col px-gutter">
        <ErrorState onRetry={() => joinInfo.refetch()} />
      </main>
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
  const busy = joinTrip.isPending;
  const pendingMemberId =
    busy && joinTrip.variables && "memberId" in joinTrip.variables
      ? joinTrip.variables.memberId
      : null;

  function join(input: { memberId: MemberId } | { newName: string }) {
    setNotice(null);
    joinTrip.mutate(
      { inviteCode, ...input },
      {
        onSuccess: ({ tripId }) => router.replace(`/trip/${tripId}`),
        onError: (error) => {
          if (error.status === 409) {
            setNotice(t("join.nameTaken"));
            joinInfo.refetch();
          } else if (error.status !== 423) {
            setNotice(t("common.error"));
          }
        },
      },
    );
  }

  function joinWithNewName() {
    if (busy || trimmedName === "") return;
    if (members.some((m) => m.name === trimmedName)) {
      setNotice(t("join.nameExists"));
      return;
    }
    join({ newName: trimmedName });
  }

  return (
    <>
      <AppBar title={title} />
      <main className="flex flex-1 flex-col gap-3 px-gutter pt-4">
        <div className="grid gap-1">
          <h2 className="text-title font-bold tracking-tight break-keep">
            {t("join.question")}
          </h2>
          {organizer ? (
            <p className="text-caption text-muted-foreground">
              {t("join.madeBy", { name: organizer.name })}
            </p>
          ) : null}
        </div>

        <ul className="rounded-xl border border-border px-3">
          {members.map((member) => (
            <li
              key={member.id}
              className="border-b border-border last:border-b-0"
            >
              <button
                type="button"
                disabled={member.isBound || busy}
                onClick={() => join({ memberId: member.id })}
                className={cn(
                  "flex min-h-13 w-full items-center gap-3 py-2 text-left",
                  "disabled:cursor-default",
                  pendingMemberId === member.id && "opacity-60",
                )}
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-body",
                    member.isBound ? "text-muted-foreground" : "font-bold",
                  )}
                >
                  {member.name}
                </span>
                {member.isBound ? (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-caption text-muted-foreground">
                    {t("join.boundMeta")}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-caption font-medium text-accent-foreground">
                    {t("join.itsMe")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <label className="mt-1 grid gap-1 text-caption text-muted-foreground">
          {t("join.newNameLabel")}
          <Input
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              setNotice(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") joinWithNewName();
            }}
            placeholder={t("join.newNamePlaceholder")}
            autoComplete="name"
            enterKeyHint="done"
            maxLength={20}
            disabled={busy}
          />
        </label>

        <BottomCTA
          disabled={busy || trimmedName === ""}
          onClick={joinWithNewName}
          top={
            notice ? (
              <p role="alert" className="pb-3 text-caption text-destructive">
                {notice}
              </p>
            ) : null
          }
        >
          {t("join.submit")}
        </BottomCTA>
      </main>
    </>
  );
}

function CenterMessage({
  barTitle,
  title,
  hint,
}: {
  barTitle?: string;
  title: string;
  hint: string;
}) {
  return (
    <>
      {barTitle ? <AppBar title={barTitle} /> : null}
      <main className="flex flex-1 flex-col px-gutter">
        <div className="mt-10 grid justify-items-center gap-2 text-center">
          <h2 className="text-title font-bold tracking-tight break-keep">
            {title}
          </h2>
          <p className="text-body text-muted-foreground break-keep">{hint}</p>
        </div>
      </main>
    </>
  );
}

function JoinSkeleton() {
  return (
    <main
      aria-busy
      aria-label={t("common.loading")}
      className="flex flex-1 flex-col gap-3 px-gutter pt-4"
    >
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-1">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-44" />
      </div>
      <div className="grid gap-2">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-13" />
        ))}
      </div>
    </main>
  );
}
