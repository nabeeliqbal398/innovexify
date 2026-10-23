"use client";

import { useEffect, useState } from "react";

/** The value, but only after it has stopped changing for `ms` (search boxes: do not ask the server on every keystroke). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
