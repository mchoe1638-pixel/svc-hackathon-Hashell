"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Suspense, useState, useSyncExternalStore } from "react";

import { AppBar } from "@/components/app-bar";
import { BottomBar } from "@/components/bottom-cta";
import { ConfirmSheet } from "@/components/confirm-sheet";
import { ErrorState } from "@/components/error-state";
import { ListRow } from "@/components/list-row";
import { MemberAvatar } from "@/components/member-avatar";
import { Screen } from "@/components/screen";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLockTrip, useTrip } from "@/hooks";
import { t } from "@/i18n/ko";
import { shareInvite } from "@/lib/native";
import type { InviteCode } from "@/types/api";

/** 초대 링크: 지금 열린 주소(운영·미리보기·로컬)의 `/j/{inviteCode}`. 서버 렌더 중엔 빈 값. */
function useInviteUrl(inviteCode: InviteCode | undefined): string {
  const origin = useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "",
  );
  return origin && inviteCode ? `${origin}/j/${inviteCode}` : "";
}
const noSubscribe = () => () => {};

/** 동행 초대 (총무, 앱) — 시안 "invite": QR + 초대 링크 공유 + 참여 현황 + 링크 잠금. */
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
  const toast = useToast();
  const trip = useTrip(tripId);
  const lockTrip = useLockTrip();

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
        <Screen>
          <ErrorState onRetry={() => trip.refetch()} />
        </Screen>
      </>
    );
  }

  const { status, members, me } = trip.data;
  const isOpen = status === "OPEN";
  const canLock = me.isOrganizer && isOpen;
  const joinedCount = members.filter((member) => member.isBound).length;
  const waitingNames = members
    .filter((member) => !member.isBound)
    .map((member) => member.name)
    .join(", ");

  async function share() {
    if (!url) return;
    const result = await shareInvite(url);
    if (result === "copied") toast(t("invite.copied"));
    if (result === "failed") toast(t("invite.copyFailed"));
  }

  function cancelLock() {
    lockTrip.reset();
    setConfirmingLock(false);
  }

  function lock() {
    lockTrip.mutate(
      { tripId },
      {
        onSuccess: () => {
          setConfirmingLock(false);
          toast(t("invite.lockDone"));
        },
      },
    );
  }

  return (
    <>
      <AppBar title={t("invite.barTitle")} backHref={homeHref} status={status} />
      <Screen>
        <h2 className="mt-1 text-title font-bold tracking-tight text-balance break-keep">
          {isOpen ? t("invite.titleOpen") : t("invite.titleLocked")}
        </h2>
        <p className="-mt-3 text-hint text-sub break-keep">
          {isOpen ? t("invite.hintOpen") : t("invite.hintLocked")}
        </p>

        {url ? (
          <QRCodeSVG
            value={url}
            size={140}
            marginSize={0}
            role="img"
            aria-label={t("invite.qrLabel")}
            className="mx-auto mt-1 block"
          />
        ) : (
          <Skeleton className="mx-auto mt-1 size-35" />
        )}

        <div className="flex items-center gap-2 rounded-md bg-field py-1.5 pr-1.5 pl-3.5">
          <span className="min-w-0 flex-1 truncate text-hint">
            {url.replace(/^https?:\/\//, "")}
          </span>
          <Button size="sm" onClick={share} disabled={!url}>
            {me.isOrganizer ? t("invite.share") : t("invite.copyLink")}
          </Button>
        </div>

        <p className="mt-1.5 text-hint text-sub">
          <b className="text-ink">
            {t("invite.joinedCountStrong", { joined: joinedCount })}
          </b>
          {t("invite.joinedCountRest", { total: members.length })}
        </p>

        <ul className="-mt-2 grid grid-cols-1">
          {members.map((member, order) => (
            <ListRow
              key={member.id}
              leading={<MemberAvatar name={member.name} order={order} />}
              title={
                <>
                  {member.name}
                  {member.isOrganizer ? t("invite.organizer") : null}
                </>
              }
              trailing={
                member.isBound ? (
                  <span className="text-caption font-bold text-ok">
                    {t("invite.joined")}
                  </span>
                ) : (
                  <span className="text-caption text-sub">
                    {t("invite.waiting")}
                  </span>
                )
              }
            />
          ))}
        </ul>

        <BottomBar>
          {canLock ? (
            <Button variant="ghost" onClick={() => setConfirmingLock(true)}>
              {t("invite.lock")}
            </Button>
          ) : null}
          <Button asChild>
            <Link href={homeHref}>{t("invite.goHome")}</Link>
          </Button>
        </BottomBar>
      </Screen>

      <ConfirmSheet
        open={canLock && confirmingLock}
        title={t("invite.lockConfirmTitle")}
        hint={
          waitingNames
            ? t("invite.lockConfirmHint", { names: waitingNames })
            : t("invite.lockConfirmHintNoOne")
        }
        confirmLabel={t("invite.lockConfirm")}
        busy={lockTrip.isPending}
        extra={
          lockTrip.isError ? (
            <p role="alert" className="text-caption text-send">
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
      className="flex flex-1 flex-col gap-4 bg-paper px-gutter pt-5"
    >
      <div className="grid gap-2">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-5 w-full" />
      </div>
      <Skeleton className="mx-auto size-35" />
      <Skeleton className="h-14 rounded-md" />
      <div className="grid gap-3">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-12" />
        ))}
      </div>
    </main>
  );
}
