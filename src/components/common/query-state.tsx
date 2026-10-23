"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Callout, EmptyState } from "@/components/ui/primitives";
import { isApiError, normalizeApiError } from "@/lib/api-error";

interface QueryLike {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  refetch: () => unknown;
}

/** Shimmering rows while a list or panel loads. */
export function Skeleton({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div aria-busy="true" aria-label="Loading" className={`flex flex-col gap-2 p-3.5 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel h-9" />
      ))}
    </div>
  );
}

/** What a failed load shows: the server's message (never raw text) and a way to try again. */
export function ErrorState({ error, onRetry, title = "We could not load this" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const e = isApiError(error) ? error : normalizeApiError(error);
  return (
    <div role="alert" className="flex flex-col items-start gap-2 p-3.5">
      <Callout tone="warn" icon="alert" className="w-full">
        <strong>{title}.</strong> {e.message}
        {e.status >= 500 && e.requestId ? <span className="help block">Request ID: {e.requestId}</span> : null}
      </Callout>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The three states every data screen needs, in one place: a skeleton while loading, an error with a retry, and an empty
 * state when there is nothing to show. `children` renders only when there is data.
 */
export function QueryState({
  query,
  isEmpty,
  empty,
  rows,
  errorTitle,
  children,
}: {
  query: QueryLike;
  isEmpty: boolean;
  empty: { title: string; text?: ReactNode };
  rows?: number;
  errorTitle?: string;
  children: ReactNode;
}) {
  if (query.isLoading) return <Skeleton rows={rows} />;
  if (query.isError) return <ErrorState error={query.error} title={errorTitle} onRetry={() => void query.refetch()} />;
  if (isEmpty) return <EmptyState title={empty.title} text={empty.text} />;
  return <>{children}</>;
}
