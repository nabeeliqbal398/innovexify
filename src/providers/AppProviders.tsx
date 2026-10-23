"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Provider } from "react-redux";
import { Slide, ToastContainer } from "react-toastify";

import { Icon } from "@/components/ui/icon";
import { bootstrapSession } from "@/lib/session";
import { makeStore, type AppStore } from "@/store";
import { sessionActions } from "@/store/sessionSlice";

import "react-toastify/dist/ReactToastify.css";

function CloseButton({ closeToast }: { closeToast?: (e: React.MouseEvent<HTMLElement>) => void }) {
  return (
    <button
      type="button"
      aria-label="Dismiss notification"
      onClick={closeToast}
      className="flex size-7 flex-none items-center justify-center self-start rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Icon name="x" small />
    </button>
  );
}

/** Store and toast host. Toasts sit top-right with a close icon, a progress bar and pause-on-hover. */
export function AppProviders({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) storeRef.current = makeStore();
  const store = storeRef.current;

  // Who is signed in is decided once, at page load, from the refresh cookie.
  useEffect(() => {
    void bootstrapSession(store.dispatch);
  }, [store]);

  // Browser tests only (NEXT_PUBLIC_E2E_HOOKS is set for the test build, never otherwise): lets a test empty the in-memory access token.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_HOOKS !== "true") return undefined;
    const w = window as unknown as { __e2e?: { dropToken: () => void; token: () => string | null } };
    w.__e2e = {
      dropToken: () => void store.dispatch(sessionActions.tokenSet("")),
      token: () => store.getState().session.accessToken,
    };
    return () => {
      delete w.__e2e;
    };
  }, [store]);

  return (
    <Provider store={store}>
      {children}
      <ToastContainer
        position="top-right"
        transition={Slide}
        autoClose={4500}
        newestOnTop
        closeButton={CloseButton}
        pauseOnHover
        pauseOnFocusLoss
        limit={4}
        toastClassName="!rounded-xl !border !border-border !bg-surface !text-foreground !shadow-pop !font-sans !text-base"
        progressClassName="!bg-primary"
      />
    </Provider>
  );
}
