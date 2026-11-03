"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/components/utils";
import { mulDivFloor } from "@/core/money";
import { t } from "@/i18n/ko";

/** 한 장 = 6.5초. 누르면 넘기고(왼쪽 1/3은 이전), 길게 누르면 멈춘다 (시안 WR_DUR·bindWr). */
const SLIDE_MS = 6500;
const HOLD_MS = 220;
const LEAVE_MS = 700;
const CLOSE_MS = 190;

export interface StorySlide {
  /** 색 클래스: s-brand · s-glow · s-night · s-accent · s-paper · s-deep */
  readonly tone: string;
  readonly content: ReactNode;
}

type Shown = { index: number; enter: "reveal" | "fadein" | null; x: number; y: number };

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 여행 돌아보기 장 넘기기 (시안 .wr): 위 진행 막대, 닫기, 누른 자리에서 원이 퍼지며 다음 장. */
export function Stories({ slides, onClose }: { slides: readonly StorySlide[]; onClose: () => void }) {
  const [shown, setShown] = useState<Shown>({ index: 0, enter: null, x: 0, y: 0 });
  const [leaving, setLeaving] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [closing, setClosing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const remain = useRef(SLIDE_MS);
  const startedAt = useRef(0);
  const downAt = useRef(0);
  const downPoint = useRef({ x: 0, y: 0 });

  const count = slides.length;
  const index = Math.min(shown.index, count - 1);

  const step = useCallback(
    (dir: 1 | -1, at?: { x: number; y: number }) => {
      setShown((current) => {
        const next = Math.max(0, Math.min(count - 1, current.index + dir));
        if (next === current.index) return current;
        const box = rootRef.current?.getBoundingClientRect();
        const width = box?.width ?? 0;
        const height = box?.height ?? 0;
        setLeaving(current.index);
        return {
          index: next,
          enter: dir > 0 ? "reveal" : "fadein",
          x: at ? at.x - (box?.left ?? 0) : width * (dir > 0 ? 0.85 : 0.15),
          y: at ? at.y - (box?.top ?? 0) : height * 0.5,
        };
      });
    },
    [count],
  );

  // 장이 바뀌면 타이머를 처음부터 (마지막 장은 멈춰 있다)
  useEffect(() => {
    window.clearTimeout(timer.current);
    remain.current = SLIDE_MS;
    startedAt.current = performance.now();
    if (index < count - 1) timer.current = window.setTimeout(() => step(1), SLIDE_MS);
    return () => window.clearTimeout(timer.current);
  }, [index, count, step]);

  useEffect(() => {
    if (leaving === null) return;
    const id = window.setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => window.clearTimeout(id);
  }, [leaving]);

  const close = useCallback(() => {
    window.clearTimeout(timer.current);
    if (prefersReducedMotion()) return onClose();
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, close]);

  function resume() {
    window.clearTimeout(timer.current);
    if (index >= count - 1) return;
    startedAt.current = performance.now();
    timer.current = window.setTimeout(() => step(1), Math.max(300, remain.current));
  }

  function release(): boolean {
    if (!downAt.current) return false;
    downAt.current = 0;
    setPaused(false);
    return true;
  }

  function onPointerDown(event: React.PointerEvent) {
    if ((event.target as HTMLElement).closest("button") || event.button > 0) return;
    downAt.current = performance.now();
    downPoint.current = { x: event.clientX, y: event.clientY };
    window.clearTimeout(timer.current);
    remain.current -= downAt.current - startedAt.current;
    setPaused(true);
  }

  function onPointerUp() {
    const held = performance.now() - downAt.current;
    if (!release()) return;
    if (held < HOLD_MS) {
      const box = rootRef.current?.getBoundingClientRect();
      const left = box ? downPoint.current.x - box.left < box.width * 0.33 : false;
      step(left ? -1 : 1, downPoint.current);
    } else {
      resume();
    }
  }

  function onPointerCancel() {
    if (release()) resume();
  }

  const reduce = prefersReducedMotion();

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={t("wrapped.label", { n: index + 1, total: count })}
      className={cn("wr", slides[index].tone, paused && "paused", closing && "closing")}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerCancel}
    >
      <div className="wr-prog" style={{ "--dur": `${SLIDE_MS}ms` } as CSSProperties}>
        {slides.map((_, k) => (
          <i
            key={k === index ? `now-${index}` : k}
            className={cn(
              k < index && "done",
              k === index && (index === count - 1 || reduce ? "done" : "now"),
            )}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label={t("wrapped.close")}
        className="absolute top-[calc(22px+env(safe-area-inset-top))] right-1.5 z-3 size-11 text-[26px]"
      >
        ×
      </button>

      {leaving !== null && leaving !== index ? (
        <section aria-hidden className={cn("slide leaving", slides[leaving].tone)}>
          {slides[leaving].content}
        </section>
      ) : null}
      <section
        key={index}
        aria-live="polite"
        className={cn("slide on", slides[index].tone, shown.enter)}
        style={{ "--x": `${shown.x}px`, "--y": `${shown.y}px` } as CSSProperties}
      >
        {slides[index].content}
      </section>
    </div>
  );
}

/**
 * 큰 숫자가 0부터 빠르게 올라가다 천천히 멈춘다 (시안 runCounts). 정수만 쓴다: 진행률을 1000분율 정수로 바꿔 곱한다.
 * 움직임 줄이기 설정이면 바로 최종 값.
 */
export function CountUp({ to, format }: { to: number; format: (value: number) => string }) {
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (prefersReducedMotion() || to <= 0) return;
    const start = performance.now() + 280;
    const duration = 1100;
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = Math.round(1000 * (1 - Math.pow(1 - progress, 4)));
      setValue(mulDivFloor(to, eased, 1000).quotient);
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    setValue(0);
    return () => cancelAnimationFrame(frame);
  }, [to]);

  return <>{format(value)}</>;
}

/** 正 한 글자 = 다섯 잔. 쓰는 순서대로 획을 긋는다 (시안 tallySVG). */
const STROKES = ["M14 14H86", "M50 14V86", "M50 50H80", "M24 46V86", "M8 86H92"];

export function Tally({ count, label }: { count: number; label: string }) {
  const groups = Math.ceil(count / 5);
  let k = 0;
  return (
    <div className="tally flex flex-wrap gap-2.5" role="img" aria-label={label}>
      {Array.from({ length: groups }, (_, g) => (
        <svg key={g} viewBox="0 0 100 100" aria-hidden>
          {STROKES.slice(0, Math.min(5, count - g * 5)).map((d) => (
            <path key={d} pathLength={1} d={d} style={{ "--k": k++ } as CSSProperties} />
          ))}
        </svg>
      ))}
    </div>
  );
}
