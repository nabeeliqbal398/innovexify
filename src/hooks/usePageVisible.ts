"use client";

import { useEffect, useState } from "react";

/** False while the tab is hidden. Polling hooks use it to stop asking the server when nobody is looking. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = (): void => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}
