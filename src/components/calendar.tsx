"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/components/utils";
import {
  dayAriaLabel,
  dayLabel,
  nightsBetween,
  nightsLabel,
  parseIsoDate,
  toIsoDate,
} from "@/components/trip-dates";
import { t } from "@/i18n/ko";
import type { IsoDate } from "@/types/api";

/** 가는 날·오는 날. 오는 날이 null이면 가는 날만 고른 상태. */
export interface DateRange {
  readonly start: IsoDate | null;
  readonly end: IsoDate | null;
}

export const NO_DATES: DateRange = { start: null, end: null };

interface MonthCursor {
  readonly year: number;
  /** 0~11 */
  readonly month: number;
}

interface CellState {
  readonly isStart: boolean;
  readonly isEnd: boolean;
  readonly isMid: boolean;
}

interface RangeCalendarProps {
  readonly value: DateRange;
  readonly onChange: (next: DateRange) => void;
  readonly disabled?: boolean;
}

const TODAY_DOT =
  "after:absolute after:bottom-1.5 after:left-1/2 after:-ml-0.5 after:size-1 after:rounded-full after:bg-current after:content-['']";

/** 시안과 같은 규칙: 처음이거나 이미 범위를 골랐거나 가는 날보다 앞이면 새로 시작, 아니면 오는 날. */
function pickDay(range: DateRange, iso: IsoDate): DateRange {
  const { start, end } = range;
  if (!start || end || iso < start) return { start: iso, end: null };
  return { start, end: iso };
}

function cellState(iso: IsoDate, range: DateRange): CellState {
  const { start, end } = range;
  const isStart = iso === start;
  // 가는 날만 골랐을 때는 그 칸이 양쪽 모서리를 다 둥글게 한다.
  const isEnd = end ? iso === end : isStart;
  const isMid = start !== null && end !== null && iso > start && iso < end;
  return { isStart, isEnd, isMid };
}

function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const moved = new Date(cursor.year, cursor.month + delta, 1);
  return { year: moved.getFullYear(), month: moved.getMonth() };
}

function summaryText(range: DateRange): ReactNode {
  const start = parseIsoDate(range.start);
  const end = parseIsoDate(range.end);
  if (!start) return t("create.dateStartHint");
  if (!end) return t("create.dateEndHint", { start: dayLabel(start) });
  const nights = nightsBetween(toIsoDate(start), toIsoDate(end));
  return (
    <>
      {t("create.dateRangeLead", { start: dayLabel(start), end: dayLabel(end) })}
      <b className="text-brand-ink">{nightsLabel(nights)}</b>
    </>
  );
}

interface MonthNavProps {
  readonly cursor: MonthCursor;
  readonly disabled: boolean;
  readonly onShift: (delta: number) => void;
}

function MonthNav({ cursor, disabled, onShift }: MonthNavProps) {
  const buttonClass = "press grid size-11 place-items-center rounded-md text-2xl leading-none";
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        disabled={disabled}
        aria-label={t("create.datePrev")}
        onClick={() => onShift(-1)}
        className={buttonClass}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <span className="text-lead font-bold">
        {t("create.dateMonth", { year: cursor.year, month: cursor.month + 1 })}
      </span>
      <button
        type="button"
        disabled={disabled}
        aria-label={t("create.dateNext")}
        onClick={() => onShift(1)}
        className={buttonClass}
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}

interface DayCellProps {
  readonly iso: IsoDate;
  readonly dayOfMonth: number;
  readonly state: CellState;
  readonly isToday: boolean;
  readonly label: string;
  readonly disabled: boolean;
  readonly onPick: (iso: IsoDate) => void;
}

function DayCell({ iso, dayOfMonth, state, isToday, label, disabled, onPick }: DayCellProps) {
  const { isStart, isEnd, isMid } = state;
  const isEdge = isStart || isEnd;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      aria-pressed={isEdge || isMid}
      onClick={() => onPick(iso)}
      className={cn(
        "relative h-11 text-hint tabular-nums text-ink active:opacity-60 disabled:opacity-50",
        isMid && "bg-brand-soft",
        isEdge && "bg-brand font-bold text-paper",
        isStart && isEnd && "rounded-md",
        isStart && !isEnd && "rounded-l-md",
        isEnd && !isStart && "rounded-r-md",
        isToday && TODAY_DOT,
      )}
    >
      {dayOfMonth}
    </button>
  );
}

/** 가는 날·오는 날을 누르는 달력. 값은 부모가 가지고 있고 이 컴포넌트는 보여주기만 한다. */
export function RangeCalendar({ value, onChange, disabled = false }: RangeCalendarProps) {
  const labelId = useId();
  // 오늘은 한 번만 정한다. 이 컴포넌트는 브라우저에서만 그려진다(앱 판별 뒤).
  const [today] = useState(() => toIsoDate(new Date()));
  const [cursor, setCursor] = useState<MonthCursor>(() => {
    const base = parseIsoDate(value.start) ?? new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const leadingBlanks = new Date(cursor.year, cursor.month, 1).getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const weekdays = [...t("date.weekdays")];

  return (
    <div role="group" aria-labelledby={labelId} className="grid gap-1.5">
      <span id={labelId} className="text-hint font-medium text-sub">
        {t("create.dateLabel")}
      </span>
      <div className="grid gap-1.5 rounded-xl bg-field p-2">
        <MonthNav
          cursor={cursor}
          disabled={disabled}
          onShift={(delta) => setCursor((current) => shiftMonth(current, delta))}
        />
        <div className="grid grid-cols-7 gap-y-0.5">
          {weekdays.map((weekday, index) => (
            <span
              key={index}
              aria-hidden="true"
              className={cn("py-1 text-center text-xs font-medium text-sub", index === 0 && "text-send")}
            >
              {weekday}
            </span>
          ))}
          {Array.from({ length: leadingBlanks }, (_, index) => (
            <span key={`blank-${index}`} aria-hidden="true" />
          ))}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const dayOfMonth = index + 1;
            const date = new Date(cursor.year, cursor.month, dayOfMonth);
            const iso = toIsoDate(date);
            const state = cellState(iso, value);
            return (
              <DayCell
                key={iso}
                iso={iso}
                dayOfMonth={dayOfMonth}
                state={state}
                isToday={iso === today}
                label={dayCellLabel(date, state)}
                disabled={disabled}
                onPick={(picked) => onChange(pickDay(value, picked))}
              />
            );
          })}
        </div>
      </div>
      <p aria-live="polite" className="mx-1.5 text-hint text-sub">
        {summaryText(value)}
      </p>
    </div>
  );
}

function dayCellLabel(date: Date, state: CellState): string {
  const day = dayAriaLabel(date);
  if (state.isStart) return t("create.dateStartAria", { day });
  if (state.isEnd) return t("create.dateEndAria", { day });
  return day;
}
