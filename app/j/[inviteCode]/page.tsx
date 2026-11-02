"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";

import { BottomCTA } from "@/components/bottom-cta";
import { ErrorState } from "@/components/error-state";
import { MemberAvatar } from "@/components/member-avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/utils";
import { useJoinInfo, useJoinTrip } from "@/hooks";
import { t } from "@/i18n/ko";
import type { MemberId } from "@/types/api";

/** 참여 (동행, 웹): 초대 링크로 들어와 이름을 고르거나 새 이름을 더한다. 잠겼으면 마감 안내. */
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

  const [pickedId, setPickedId] = useState<MemberId | null>(null);
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
        title={t("join.lockedTitle")}
        hint={t("join.lockedHint", { name: organizer?.name ?? "" })}
      />
    );
  }

  const trimmedName = newName.trim();
  const canSubmit =
    !joinTrip.isPending && (pickedId !== null || trimmedName !== "");

  function pick(memberId: MemberId) {
    setPickedId(memberId);
    setNewName("");
    setNotice(null);
  }

  function changeNewName(value: string) {
    setNewName(value);
    if (value !== "") setPickedId(null);
    setNotice(null);
  }

  function submit() {
    if (!canSubmit) return;
    if (pickedId === null && members.some((m) => m.name === trimmedName)) {
      setNotice(t("join.nameExists"));
      return;
    }
    const input =
      pickedId !== null
        ? { inviteCode, memberId: pickedId }
        : { inviteCode, newName: trimmedName };
    joinTrip.mutate(input, {
      onSuccess: ({ tripId }) => router.replace(`/trip/${tripId}`),
      onError: (error) => {
        if (error.status === 409) {
          setPickedId(null);
          setNotice(t("join.nameTaken"));
          joinInfo.refetch();
        } else if (error.status !== 423) {
          setNotice(t("common.error"));
        }
      },
    });
  }

  return (
    <main className="flex flex-1 flex-col gap-6 px-gutter pt-6">
      <header className="flex items-center gap-3 rounded-xl bg-muted p-4">
        <div className="min-w-0">
          <p className="truncate text-body font-bold">{title}</p>
          {organizer ? (
            <p className="truncate text-caption text-muted-foreground">
              {t("join.madeBy", { name: organizer.name })}
            </p>
          ) : null}
        </div>
      </header>

      <div className="grid gap-1">
        <h1 className="text-title font-bold tracking-tight break-keep">
          {t("join.question")}
        </h1>
        <p className="text-caption text-muted-foreground">{t("join.hint")}</p>
      </div>

      <ul className="grid gap-2">
        {members.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              disabled={member.isBound || joinTrip.isPending}
              aria-pressed={pickedId === member.id}
              onClick={() => pick(member.id)}
              className={cn(
                "flex min-h-15 w-full items-center gap-3 rounded-xl border border-border bg-background px-4 text-left transition-transform",
                "active:scale-[0.97] aria-pressed:border-primary aria-pressed:bg-accent",
                "disabled:active:scale-100 disabled:text-muted-foreground",
              )}
            >
              <MemberAvatar name={member.name} />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-body",
                  !member.isBound && "font-bold",
                )}
              >
                {member.name}
              </span>
              {member.isBound ? (
                <span className="shrink-0 text-caption">
                  {t("join.boundMeta")}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <label className="grid gap-2 text-caption font-medium text-muted-foreground">
        {t("join.newNameLabel")}
        <Input
          value={newName}
          onChange={(event) => changeNewName(event.target.value)}
          placeholder={t("join.newNamePlaceholder")}
          autoComplete="name"
          enterKeyHint="done"
          maxLength={20}
          disabled={joinTrip.isPending}
        />
      </label>

      <BottomCTA
        disabled={!canSubmit}
        onClick={submit}
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
  );
}

function CenterMessage({ title, hint }: { title: string; hint: string }) {
  return (
    <main className="flex flex-1 flex-col px-gutter">
      <div className="mt-12 grid justify-items-center gap-2 text-center">
        <h1 className="text-title font-bold tracking-tight break-keep">{title}</h1>
        <p className="text-body text-muted-foreground break-keep">{hint}</p>
      </div>
    </main>
  );
}

function JoinSkeleton() {
  return (
    <main
      aria-busy
      aria-label={t("common.loading")}
      className="flex flex-1 flex-col gap-6 px-gutter pt-6"
    >
      <Skeleton className="h-18 rounded-xl" />
      <div className="grid gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-44" />
      </div>
      <div className="grid gap-2">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-15 rounded-xl" />
        ))}
      </div>
    </main>
  );
}
