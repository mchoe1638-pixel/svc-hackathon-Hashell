"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { BottomCTA } from "@/components/bottom-cta";
import { ErrorState } from "@/components/error-state";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/components/utils";
import { useLockTrip, useTrip } from "@/hooks";
import { t } from "@/i18n/ko";
import type { InviteCode } from "@/types/api";

function inviteUrl(inviteCode: InviteCode): string {
  return `${window.location.origin}/j/${inviteCode}`;
}

/**
 * TODO(native): 백엔드가 `src/lib/native.ts`를 만들면 `shareInvite(url)`로 교체한다
 * (앱이면 기본 공유창, 웹이면 복사). 지금은 웹 복사만 임시로 한다.
 */
async function shareInviteTemporary(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/** 링크 공유 (총무, 앱): 초대 링크 공유 + 참여 현황 + 링크 잠금. */
export default function InvitePage() {
  const { tripId } = useParams<{ tripId: string }>();
  const trip = useTrip(tripId);
  const lockTrip = useLockTrip();

  const [copied, setCopied] = useState(false);
  const [confirmingLock, setConfirmingLock] = useState(false);

  if (trip.status === "pending") {
    return <InviteSkeleton />;
  }

  if (trip.status === "error") {
    return (
      <main className="flex flex-1 flex-col px-gutter">
        <ErrorState onRetry={() => trip.refetch()} />
      </main>
    );
  }

  const { status, members, me, inviteCode } = trip.data;
  const isOpen = status === "OPEN";
  const canLock = me.isOrganizer && isOpen;
  const joinedCount = members.filter((member) => member.isBound).length;
  const url = inviteUrl(inviteCode);

  async function share() {
    const ok = await shareInviteTemporary(url);
    setCopied(ok);
  }

  function lock() {
    lockTrip.mutate(
      { tripId },
      { onSuccess: () => setConfirmingLock(false) },
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-6 px-gutter pt-6">
      <div className="grid gap-2">
        <span
          className={cn(
            "w-fit rounded-full px-3 py-1 text-caption font-medium",
            isOpen ? "bg-brand-soft text-brand" : "bg-muted text-foreground",
          )}
        >
          {t(`status.${status}`)}
        </span>
        <h1 className="text-title font-bold tracking-tight break-keep">
          {isOpen ? t("invite.titleOpen") : t("invite.titleLocked")}
        </h1>
        <p className="text-caption text-muted-foreground break-keep">
          {isOpen ? t("invite.hintOpen") : t("invite.hintLocked")}
        </p>
      </div>

      {/* TODO(qr): QR 코드 자리. QR 라이브러리 추가 여부를 백엔드와 정한 뒤 넣는다. */}

      {isOpen ? (
        <div className="flex items-center gap-2 rounded-lg bg-muted py-1.5 pr-1.5 pl-4">
          <span className="min-w-0 flex-1 truncate text-caption">{url}</span>
          <Button size="sm" onClick={share} aria-live="polite">
            {copied
              ? t("common.copied")
              : me.isOrganizer
                ? t("invite.share")
                : t("invite.copyLink")}
          </Button>
        </div>
      ) : null}

      <section className="grid gap-1">
        <p className="text-caption text-muted-foreground">
          {t("invite.joinedCount", {
            joined: joinedCount,
            total: members.length,
          })}
        </p>
        <ul className="grid">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex min-h-15 items-center gap-3 border-b border-border py-2.5 last:border-b-0"
            >
              <MemberAvatar name={member.name} />
              <span className="min-w-0 flex-1 truncate text-body font-bold">
                {member.name}
                {member.isOrganizer ? (
                  <span className="ml-1.5 text-caption font-medium text-muted-foreground">
                    {t("invite.organizer")}
                  </span>
                ) : null}
              </span>
              {member.isBound ? (
                <span className="shrink-0 text-caption font-bold text-brand">
                  {t("invite.joined")}
                </span>
              ) : (
                <span className="shrink-0 text-caption text-muted-foreground">
                  {t("invite.waiting")}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canLock ? (
        confirmingLock ? (
          <section className="grid gap-3 rounded-xl bg-muted p-4">
            <p className="text-body font-bold">{t("invite.lockConfirmTitle")}</p>
            <p className="text-caption text-muted-foreground break-keep">
              {t("invite.lockConfirmHint")}
            </p>
            {lockTrip.isError ? (
              <p role="alert" className="text-caption text-destructive">
                {lockTrip.error.status === 423
                  ? t("invite.lockSettled")
                  : t("common.error")}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={lockTrip.isPending}
                onClick={() => {
                  lockTrip.reset();
                  setConfirmingLock(false);
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={lockTrip.isPending}
                onClick={lock}
              >
                {t("invite.lockConfirm")}
              </Button>
            </div>
          </section>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmingLock(true)}>
            {t("invite.lock")}
          </Button>
        )
      ) : null}

      <BottomCTA asChild>
        <Link href={`/trip/${tripId}`}>{t("invite.goHome")}</Link>
      </BottomCTA>
    </main>
  );
}

function InviteSkeleton() {
  return (
    <main
      aria-busy
      aria-label={t("common.loading")}
      className="flex flex-1 flex-col gap-6 px-gutter pt-6"
    >
      <div className="grid gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-5 w-full" />
      </div>
      <Skeleton className="h-14 rounded-lg" />
      <div className="grid gap-3">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-12" />
        ))}
      </div>
    </main>
  );
}
