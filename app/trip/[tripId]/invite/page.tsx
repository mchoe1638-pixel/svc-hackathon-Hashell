"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useState } from "react";

import { AppBar } from "@/components/app-bar";
import { BottomCTA } from "@/components/bottom-cta";
import { ErrorState } from "@/components/error-state";
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
  // cacheComponents: useParams는 요청 시점에 정해지므로 Suspense 안에서 읽어야 빌드가 된다.
  return (
    <Suspense fallback={<InviteSkeleton />}>
      <InviteContent />
    </Suspense>
  );
}

function InviteContent() {
  const { tripId } = useParams<{ tripId: string }>();
  const trip = useTrip(tripId);
  const lockTrip = useLockTrip();

  const [copied, setCopied] = useState(false);
  const [confirmingLock, setConfirmingLock] = useState(false);

  const homeHref = `/trip/${tripId}`;

  if (trip.status === "pending") {
    return <InviteSkeleton />;
  }

  if (trip.status === "error") {
    return (
      <>
        <AppBar title={t("invite.barTitle")} backHref={homeHref} />
        <main className="flex flex-1 flex-col px-gutter">
          <ErrorState onRetry={() => trip.refetch()} />
        </main>
      </>
    );
  }

  const { status, members, me, inviteCode } = trip.data;
  const isOpen = status === "OPEN";
  const canLock = me.isOrganizer && isOpen;
  const joinedCount = members.filter((member) => member.isBound).length;

  async function share() {
    const ok = await shareInviteTemporary(inviteUrl(inviteCode));
    setCopied(ok);
  }

  function lock() {
    lockTrip.mutate({ tripId }, { onSuccess: () => setConfirmingLock(false) });
  }

  return (
    <>
      <AppBar title={t("invite.barTitle")} backHref={homeHref} />
      <main className="flex flex-1 flex-col gap-3 px-gutter pt-4">
        <span
          className={cn(
            "w-fit rounded-full px-2.5 py-0.5 text-caption font-medium",
            isOpen ? "bg-accent text-accent-foreground" : "bg-muted text-foreground",
          )}
        >
          {t(`status.${status}`)}
        </span>

        <h2 className="text-title font-bold tracking-tight break-keep">
          {isOpen ? t("invite.titleOpen") : t("invite.titleLocked")}
        </h2>

        {/* TODO(qr): QR 코드 자리 (가운데 120px). QR 라이브러리를 백엔드와 정한 뒤 넣는다. */}

        <Button
          variant="outline"
          className="w-full border-primary text-primary"
          onClick={share}
          aria-live="polite"
        >
          {copied
            ? t("common.copied")
            : me.isOrganizer
              ? t("invite.share")
              : t("invite.copyLink")}
        </Button>

        <p className="text-caption text-muted-foreground">
          {t("invite.joinedCount", {
            joined: joinedCount,
            total: members.length,
          })}
        </p>

        <ul className="rounded-xl border border-border px-3">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex min-h-12 items-center gap-3 border-b border-border py-2 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-body font-medium">
                {member.name}
                {member.isOrganizer ? t("invite.organizer") : null}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-caption",
                  member.isBound
                    ? "bg-accent text-accent-foreground"
                    : "border border-border text-muted-foreground",
                )}
              >
                {member.isBound ? t("invite.joined") : t("invite.waiting")}
              </span>
            </li>
          ))}
        </ul>

        {canLock && confirmingLock ? (
          <section className="grid gap-2 rounded-xl bg-muted p-4">
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
            <Button
              variant="ghost"
              className="justify-self-start"
              disabled={lockTrip.isPending}
              onClick={() => {
                lockTrip.reset();
                setConfirmingLock(false);
              }}
            >
              {t("common.cancel")}
            </Button>
          </section>
        ) : null}

        {canLock ? (
          confirmingLock ? (
            <BottomCTA
              variant="destructive"
              disabled={lockTrip.isPending}
              onClick={lock}
            >
              {t("invite.lockConfirm")}
            </BottomCTA>
          ) : (
            <BottomCTA onClick={() => setConfirmingLock(true)}>
              {t("invite.lock")}
            </BottomCTA>
          )
        ) : (
          <BottomCTA asChild>
            <Link href={homeHref}>{t("invite.goHome")}</Link>
          </BottomCTA>
        )}
      </main>
    </>
  );
}

function InviteSkeleton() {
  return (
    <main
      aria-busy
      aria-label={t("common.loading")}
      className="flex flex-1 flex-col gap-3 px-gutter pt-4"
    >
      <Skeleton className="h-6 w-24 rounded-full" />
      <Skeleton className="h-8 w-60" />
      <Skeleton className="h-11 rounded-md" />
      <Skeleton className="h-5 w-24" />
      <div className="grid gap-2">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-12" />
        ))}
      </div>
    </main>
  );
}
