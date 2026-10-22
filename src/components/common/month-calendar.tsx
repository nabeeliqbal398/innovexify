"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { CalendarMonth, CalendarTone } from "@/lib/calendar";

const TONES: Record<CalendarTone, string> = {
  case: "bg-primary-soft text-primary-soft-foreground",
  info: "bg-info-soft text-info",
  warn: "bg-warning-soft text-warning",
  violet: "bg-violet-soft text-violet",
  q: "border border-dashed border-border-strong bg-muted text-neutral",
  ok: "bg-success-soft text-success",
  bad: "bg-danger-soft text-danger-hover",
};

export const CALENDAR_DOT: Record<CalendarTone, string> = {
  case: "bg-[#6366F1]",
  info: "bg-[#3B82F6]",
  warn: "bg-[#F59E0B]",
  violet: "bg-[#8B5CF6]",
  q: "bg-[#94A3B8]",
  ok: "bg-[#22C55E]",
  bad: "bg-[#EF4444]",
};

interface MonthCalendarProps {
  month: CalendarMonth;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Legend shown on the right of the header. */
  legend?: React.ReactNode;
  /** Message when the month has no items. */
  emptyTitle?: string;
  emptyText?: string;
  /** Show the grid even on narrow screens. By default phones get the agenda list instead. */
  gridOnPhone?: boolean;
  /** Hide the grid (list mode); only the agenda renders. */
  listOnly?: boolean;
}

/** Month grid with previous/next/today controls. On phones it collapses to an agenda list. */
export function MonthCalendar({
  month,
  onPrev,
  onNext,
  onToday,
  legend,
  emptyTitle = "Nothing scheduled this month",
  emptyText,
  gridOnPhone,
  listOnly,
}: MonthCalendarProps) {
  return (
    <section className="card overflow-hidden">
      <div className="card-h">
        <Button size="sm" aria-label="Previous month" onClick={onPrev}>
          <Icon name="chevL" small />
        </Button>
        <span className="h3 min-w-[140px] text-center">{month.title}</span>
        <Button size="sm" aria-label="Next month" onClick={onNext}>
          <Icon name="chevR" small />
        </Button>
        <Button size="sm" variant="ghost" onClick={onToday}>
          Today
        </Button>
        <span className="flex-1" />
        {legend}
      </div>
      {listOnly ? null : (
        <div className={cn("p-2.5", !gridOnPhone && "max-[860px]:hidden")}>
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="grid grid-cols-7">
              {month.dow.map((d) => (
                <span key={d} className="border-b border-border bg-background px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
                  {d}
                </span>
              ))}
            </div>
            {month.weeks.map((week) => (
              <div key={week[0].iso} className="grid grid-cols-7">
                {week.map((d) => (
                  <div
                    key={d.iso}
                    aria-label={d.label}
                    className={cn("flex min-h-[92px] min-w-0 flex-col gap-[3px] border-b border-r border-muted px-[5px] py-1", d.outside && "bg-surface-muted")}
                  >
                    <span
                      className={cn(
                        "self-start text-[11px] font-semibold text-neutral",
                        d.outside && "font-normal text-muted-foreground",
                        d.today && "rounded-full bg-primary px-1.5 text-primary-foreground",
                      )}
                    >
                      {d.num}
                    </span>
                    {d.items.map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        title={`${i.kind}: ${i.title}`}
                        onClick={i.onSelect}
                        className={cn("block w-full cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap rounded-[5px] border-0 px-[5px] py-0.5 text-left text-[11px] leading-[15px]", TONES[i.tone])}
                      >
                        {i.title}
                      </button>
                    ))}
                    {d.more ? <span className="help text-[10px]">+{d.more} more</span> : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className={cn(!listOnly && !gridOnPhone && "hidden max-[860px]:block")}>
        {month.agenda.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={a.onSelect}
            className="row w-full cursor-pointer items-center border-x-0 border-b-0 bg-transparent text-left hover:bg-primary-soft"
          >
            <span className="help mono w-[84px] flex-none">{a.dayLabel}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">{a.title}</span>
              <span className="help">
                {a.kind} · {a.rel}
              </span>
            </span>
          </button>
        ))}
        {month.agenda.length === 0 ? <EmptyState title={emptyTitle} text={emptyText} /> : null}
      </div>
    </section>
  );
}
