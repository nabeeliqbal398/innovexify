"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { ROLE_PATH } from "@/constants/vocab";
import { useMe } from "@/hooks/useStore";

export interface GoOptions {
  /** Second path segment, such as a case id on the case-detail route. */
  id?: string;
  /** Query parameters, such as `tab` or `client`. Empty values are dropped. */
  query?: Record<string, string | undefined>;
}

export interface WorkspaceNav {
  /** Current view id, such as "overview" or "cases". */
  view: string;
  /** Second path segment when present. */
  id?: string;
  /** Read a query parameter. */
  param: (key: string) => string;
  /** Navigate to a view in the signed-in role's workspace. */
  go: (view: string, options?: GoOptions) => void;
  /** Change query parameters on the current page without adding history entries. */
  setParams: (patch: Record<string, string | undefined>) => void;
  /** Build the href for a view, for links. */
  href: (view: string, options?: GoOptions) => string;
}

function buildQuery(query?: Record<string, string | undefined>): string {
  if (!query) return "";
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v) qs.set(k, v);
  });
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** Routing for a role workspace: `/<role>/<view>[/<id>]?query`. */
export function useWorkspaceNav(view: string, id?: string): WorkspaceNav {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const me = useMe();
  const base = `/${ROLE_PATH[me.role]}`;

  const href = useCallback(
    (v: string, o?: GoOptions) => `${base}/${v}${o?.id ? `/${encodeURIComponent(o.id)}` : ""}${buildQuery(o?.query)}`,
    [base],
  );

  return useMemo<WorkspaceNav>(
    () => ({
      view,
      id,
      param: (key) => search.get(key) ?? "",
      go: (v, o) => {
        router.push(href(v, o));
        if (typeof window !== "undefined") window.scrollTo(0, 0);
      },
      setParams: (patch) => {
        const next = new URLSearchParams(search.toString());
        Object.entries(patch).forEach(([k, v]) => {
          if (v) next.set(k, v);
          else next.delete(k);
        });
        const qs = next.toString();
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      },
      href,
    }),
    [view, id, search, router, pathname, href],
  );
}
