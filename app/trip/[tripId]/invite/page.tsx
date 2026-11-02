"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Suspense, useEffect, useState } from "react";

import { AppBar } from "@/components/app-bar";
import { BottomBar } from "@/components/bottom-cta";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { ErrorState } from "@/components/error-state";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLockTrip, useTrip } from "@/hooks";
import { t } from "@/i18n/ko";
import type { InviteCode } from "@/types/api";

/** 초대 링크: 지금 열린 주소(운영·미리보기·로컬)의 `/j/{inviteCode}`. 서버 렌더 중엔 빈 값. */
function useInviteUrl(inviteCode: InviteCode | undefined): string {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin && inviteCode ? `${origin}/j/${inviteCode}` : "";
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

/** 동행 초대 (총무, 앱): QR + 초대 링크 공유 + 참여 현황 + 링크 잠금. */
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
  const url = useInviteUrl(trip.data?.inviteCode);

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

  const { status, members, me } = trip.data;
  const isOpen = status === "OPEN";
  const canLock = me.isOrganizer && isOpen;
  const joinedCount = members.filter((member) => member.isBound).length;

  async function share() {
    if (!url) return;
    const ok = await shareInviteTemporary(url);
    setCopied(ok);
  }

  function cancelLock() {
    lockTrip.reset();
    setConfirmingLock(false);
  }

  function lock() {
    lockTrip.mutate({ tripId }, { onSuccess: () => setConfirmingLock(false) });
  }

  return (
    <>
      <AppBar title={t("invite.barTitle")} backHref={homeHref} status={status} />
      <main className="flex flex-1 flex-col gap-4 px-4.5 pt-5">
        <div className="grid gap-1">
          <h2 className="text-title font-bold tracking-tight break-keep">
            {isOpen ? t("invite.titleOpen") : t("invite.titleLocked")}
          </h2>
          <p className="text-sm text-muted-foreground break-keep">
            {isOpen ? t("invite.hintOpen") : t("invite.hintLocked")}
          </p>
        </div>

        {url ? (
          <QRCodeSVG
            value={url}
            size={140}
            marginSize={0}
            role="img"
            aria-label={t("invite.qrLabel")}
            className="mx-auto mt-1"
          />
        ) : (
          <Skeleton className="mx-auto mt-1 size-35" />
        )}

        <div className="flex items-center gap-2 rounded-xl bg-muted py-1.5 pr-1.5 pl-3.5">
          <span className="min-w-0 flex-1 truncate text-sm">{url}</span>
          <Button
            size="sm"
            className="rounded-lg px-3.5 font-bold"
            onClick={share}
            disabled={!url}
            aria-live="polite"
          >
            {copied
              ? t("common.copied")
              : me.isOrganizer
                ? t("invite.share")
                : t("invite.copyLink")}
          </Button>
        </div>

        <p className="mt-1.5 text-sm text-muted-foreground">
          <b className="text-foreground">
            {t("invite.joinedCountStrong", { joined: joinedCount })}
          </b>
          {t("invite.joinedCountRest", { total: members.length })}
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
                {member.isOrganizer ? t("invite.organizer") : null}
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

        <BottomBar>
          {canLock ? (
            <Button
              size="lg"
              variant="secondary"
              onClick={() => setConfirmingLock(true)}
            >
              {t("invite.lock")}
            </Button>
          ) : null}
          <Button size="lg" asChild>
            <Link href={homeHref}>{t("invite.goHome")}</Link>
          </Button>
        </BottomBar>
      </main>

      <ConfirmSheet
        open={canLock && confirmingLock}
        title={t("invite.lockConfirmTitle")}
        hint={t("invite.lockConfirmHint")}
        confirmLabel={t("invite.lockConfirm")}
        danger
        busy={lockTrip.isPending}
        extra={
          lockTrip.isError ? (
            <p role="alert" className="text-caption text-destructive">
              {lockTrip.error.status === 423
                ? t("invite.lockSettled")
                : t("common.error")}
            </p>
          ) : null
        }
        onConfirm={lock}
        onCancel={cancelLock}
      />
    </>
  );
}

function InviteSkeleton() {
  return (
    <main
      aria-busy
      aria-label={t("common.loading")}
      className="flex flex-1 flex-col gap-4 px-4.5 pt-5"
    >
      <div className="grid gap-2">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-5 w-full" />
      </div>
      <Skeleton className="mx-auto size-35" />
      <Skeleton className="h-14 rounded-xl" />
      <div className="grid gap-3">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-12" />
        ))}
      </div>
    </main>
  );
}
