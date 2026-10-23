"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/** Prev/next footer for a paged table. `page` is zero-based. */
export function Pager({
  page,
  pageCount,
  total,
  pageSize,
  noun,
  onPrev,
  onNext,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  noun: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-muted px-3.5 py-2.5">
      <span className="help flex-1">
        Showing {from}–{to} · {total} {noun} in your scope
      </span>
      <Button size="sm" aria-label="Previous page" disabled={page <= 0} onClick={onPrev}>
        <Icon name="chevL" small />
        Prev
      </Button>
      <span className="mini">
        Page {Math.min(page + 1, Math.max(1, pageCount))} of {Math.max(1, pageCount)}
      </span>
      <Button size="sm" aria-label="Next page" disabled={page + 1 >= pageCount} onClick={onNext}>
        Next
        <Icon name="chevR" small />
      </Button>
    </div>
  );
}
