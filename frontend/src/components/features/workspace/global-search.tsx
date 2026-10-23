"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { useDebounced } from "@/hooks/useDebounced";
import { useMe } from "@/hooks/useStore";
import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { isApiError, normalizeApiError } from "@/lib/api-error";
import { useLazySearchQuery, type SearchGroup, type SearchItem } from "@/store/api/dashboard";
import type { ApiError } from "@/types/api";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

/**
 * Search over the records the signed-in role may see, answered by the server (which applies the same scope as the lists).
 * Typing waits 250 ms, needs 2 characters, and a newer search cancels the one still in flight, so an old answer never
 * replaces a newer one. A "too many searches" answer shows the server's own wait message. Document files and internal reports are never searched.
 */
export function GlobalSearch({
  open,
  onOpenChange,
  nav,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nav: WorkspaceNav;
}) {
  const me = useMe();
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), DEBOUNCE_MS);
  const [trigger] = useLazySearchQuery();
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const shown = open && query.trim().length >= MIN_CHARS;

  useEffect(() => {
    if (q.length < MIN_CHARS) {
      setGroups([]);
      setError(null);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const request = trigger(q, false);
    request
      .unwrap()
      .then((result) => {
        setGroups(result.groups);
        setError(null);
      })
      .catch((e: unknown) => {
        // An aborted request is a newer search taking over: say nothing.
        if (isApiError(e) || (typeof e === "object" && e !== null && "status" in e)) setError(isApiError(e) ? e : normalizeApiError(e));
      })
      .finally(() => setSearching(false));
    return () => request.abort();
  }, [q, trigger]);

  const done = (): void => {
    setQuery("");
    onOpenChange(false);
  };
  const go = (item: SearchItem): void => {
    done();
    nav.go(item.target.view, { id: item.target.id, query: item.target.query });
  };

  const hint =
    me.role === "CLIENT"
      ? "Search your case, tickets, messages and documents"
      : `Search clients, cases, ${me.role === "ADMIN" || me.role === "MANAGER" ? "tasks, " : ""}tickets and messages`;

  return (
    <div role="search" className="relative z-30 flex min-w-40 flex-[0_1_280px] items-center max-[860px]:order-10 max-[860px]:max-w-none max-[860px]:flex-[1_1_100%]">
      <Icon name="search" small className="pointer-events-none absolute left-2.5 text-muted-foreground" />
      <input
        type="search"
        aria-label={hint}
        placeholder="Search…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onOpenChange(true);
        }}
        className="h-[34px] w-full rounded-md border border-border-strong bg-background pl-8 pr-2.5"
      />
      {shown ? (
        <div
          role="dialog"
          aria-label="Search results"
          className="absolute left-0 top-[42px] z-40 w-[min(440px,calc(100vw-32px))] animate-pop overflow-hidden rounded-lg border border-border bg-surface shadow-pop max-[860px]:w-full"
        >
          <div className="flex items-center gap-2 border-b border-muted py-2.5 pl-3.5 pr-3">
            <span className="h3 flex-1">Results for “{query.trim()}”</span>
            <button
              type="button"
              aria-label="Close search results"
              onClick={() => onOpenChange(false)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-neutral hover:bg-muted"
            >
              <Icon name="x" small />
            </button>
          </div>
          <div className="max-h-[min(420px,60vh)] overflow-auto" aria-busy={searching}>
            {error ? (
              <div role="alert" className="empty-s">
                <strong>{error.errorCode === "TOO_MANY_REQUESTS" ? "Slow down a little" : "Search is not available right now"}</strong>
                <span className="help">{error.message}</span>
              </div>
            ) : null}
            {!error
              ? groups.map((g) => (
                  <div key={g.key} className="border-b border-muted py-1.5">
                    <div className="px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{g.label}</div>
                    {g.items.map((r) => (
                      <button
                        key={`${r.title}-${r.meta}`}
                        type="button"
                        onClick={() => go(r)}
                        className="flex w-full cursor-pointer flex-col items-start gap-px border-0 bg-transparent px-3.5 py-[7px] text-left hover:bg-primary-soft"
                      >
                        <span className="text-sm font-medium">{r.title}</span>
                        <span className="help">{r.meta}</span>
                      </button>
                    ))}
                  </div>
                ))
              : null}
            {!error && searching && groups.length === 0 ? (
              <div className="empty-s">
                <span className="help">Searching…</span>
              </div>
            ) : null}
            {!error && !searching && groups.length === 0 && q.length >= MIN_CHARS ? (
              <div className="empty-s">
                <strong>No matches</strong>
                <span className="help">Results only include records your role can open. Try a client name, case ID or ticket number.</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
