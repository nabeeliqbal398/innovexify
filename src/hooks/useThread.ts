"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAppDispatch } from "@/hooks/useStore";
import { normalizeApiError } from "@/lib/api-error";
import { messagesApi } from "@/store/api/messages";
import type { ApiError } from "@/types/api";
import type { Message } from "@/types/domain";

export const POLL_MS = 10_000;
const PAGE = 30;

export interface ThreadState {
  messages: Message[];
  loading: boolean;
  error: ApiError | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  loadOlder: () => Promise<void>;
  /** Add a message the person just sent (it is already on the server). */
  append: (message: Message) => void;
  reload: () => void;
}

const sameId = (a: Message, b: Message): boolean => a.id === b.id;

/**
 * One conversation, kept in this list: the newest page first, older pages added above on request (cursor `before`), and new
 * messages added by polling with `since` every 10 seconds, but only while the tab is visible. A hidden tab stops polling and
 * fetches once as soon as it is shown again. Opening the thread marks it read; so does a new message from someone else.
 */
export function useThread(clientId: string | null): ThreadState {
  const dispatch = useAppDispatch();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [nonce, setNonce] = useState(0);
  const state = useRef({ messages: [] as Message[], oldest: null as string | null, clientId: null as string | null });
  state.current.clientId = clientId;

  const set = useCallback((next: Message[]) => {
    state.current.messages = next;
    setMessages(next);
  }, []);

  const markRead = useCallback(
    (id: string) => {
      void dispatch(messagesApi.endpoints.markRead.initiate(id));
    },
    [dispatch],
  );

  const fetchPage = useCallback(
    (args: { clientId: string; before?: string; since?: string }) =>
      dispatch(messagesApi.endpoints.threadPage.initiate({ ...args, limit: PAGE }, { forceRefetch: true, subscribe: false })).unwrap(),
    [dispatch],
  );

  // Open a conversation: newest page, then mark it read.
  useEffect(() => {
    set([]);
    setHasOlder(false);
    setError(null);
    state.current.oldest = null;
    if (!clientId) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchPage({ clientId })
      .then((page) => {
        if (cancelled) return;
        set(page.items);
        state.current.oldest = page.meta.nextBefore;
        setHasOlder(page.meta.hasMore);
        markRead(clientId);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(normalizeApiError(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, nonce, fetchPage, markRead, set]);

  // New messages while the thread is open and the tab is visible.
  useEffect(() => {
    if (!clientId) return undefined;
    let busy = false;
    const poll = async () => {
      if (busy || document.visibilityState !== "visible" || state.current.clientId !== clientId) return;
      busy = true;
      try {
        const have = state.current.messages;
        const last = have[have.length - 1];
        const page = await fetchPage(last ? { clientId, since: last.id } : { clientId });
        if (state.current.clientId !== clientId) return;
        const fresh = page.items.filter((m) => !state.current.messages.some((x) => sameId(x, m)));
        if (fresh.length > 0) {
          set([...state.current.messages, ...fresh]);
          if (fresh.some((m) => !m.mine)) markRead(clientId);
        }
      } catch {
        // A missed poll is fine: the next one (or the person reloading) catches up.
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void poll(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [clientId, fetchPage, markRead, set]);

  const loadOlder = useCallback(async () => {
    const id = state.current.clientId;
    const before = state.current.oldest;
    if (!id || !before) return;
    setLoadingOlder(true);
    try {
      const page = await fetchPage({ clientId: id, before });
      if (state.current.clientId !== id) return;
      const known = new Set(state.current.messages.map((m) => m.id));
      set([...page.items.filter((m) => !known.has(m.id)), ...state.current.messages]);
      state.current.oldest = page.meta.nextBefore ?? state.current.oldest;
      setHasOlder(page.meta.hasMore);
    } catch (e) {
      setError(normalizeApiError(e));
    } finally {
      setLoadingOlder(false);
    }
  }, [fetchPage, set]);

  const append = useCallback(
    (message: Message) => {
      if (state.current.messages.some((m) => m.id === message.id)) return;
      set([...state.current.messages, message]);
    },
    [set],
  );

  return { messages, loading, error, hasOlder, loadingOlder, loadOlder, append, reload: () => setNonce((n) => n + 1) };
}
