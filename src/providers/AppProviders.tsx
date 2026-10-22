"use client";

import { useRef, type ReactNode } from "react";
import { Provider } from "react-redux";
import { Slide, ToastContainer } from "react-toastify";

import { Icon } from "@/components/ui/icon";
import { makeStore, type AppStore } from "@/store";

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

  return (
    <Provider store={storeRef.current}>
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
