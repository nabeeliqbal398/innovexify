"use client";

import { useMemo, useState } from "react";

import { staffTickets } from "@/components/features/workspace/nav-counts";
import { Icon } from "@/components/ui/icon";
import { STAGES } from "@/constants/vocab";
import { fmtDay } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { useData, useMe } from "@/hooks/useStore";
import type { WorkspaceNav } from "@/hooks/useWorkspaceNav";
import { projectOfClient, userName } from "@/store/selectors";

interface Result {
  title: string;
  meta: string;
  go: () => void;
}
interface Group {
  label: string;
  items: Result[];
}

/** Search over records the signed-in role may see. Document files and internal reports are never searched. */
export function GlobalSearch({
  open,
  onOpenChange,
  nav,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nav: WorkspaceNav;
}) {
  const data = useData();
  const me = useMe();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = open && q.length >= 2;

  const groups = useMemo<Group[]>(() => {
    if (q.length < 2) return [];
    const hit = (x?: string): boolean => (x ?? "").toLowerCase().includes(q);
    const out: Group[] = [];
    const push = (label: string, items: Result[]): void => {
      if (items.length) out.push({ label, items: items.slice(0, 5) });
    };
    const done = (): void => {
      setQuery("");
      onOpenChange(false);
    };

    if (me.role !== "CLIENT") {
      const clients = data.users.filter((u) => u.role === "CLIENT" && u.status !== "Removed" && can(me, "viewClient", u));
      push(
        "Clients",
        clients
          .filter((c) => hit(c.name) || hit(c.email) || hit(c.caseId) || hit(c.biz))
          .map((c) => ({
            title: c.name,
            meta: `${c.caseId} · ${c.biz || "No business name yet"}`,
            go: () => {
              done();
              nav.go("clients", { query: { client: c.id } });
            },
          })),
      );
      push(
        "Cases",
        data.projects
          .map((p) => ({ p, c: data.users.find((u) => u.id === p.client) }))
          .filter(({ p, c }) => c && can(me, "viewClient", c) && (hit(p.id) || hit(c.caseId) || hit(c.name) || hit(c.biz) || hit(STAGES[p.stageIdx])))
          .map(({ p, c }) => ({
            title: `${p.id} · ${c?.name ?? ""}`,
            meta: `${STAGES[p.stageIdx]} · ${p.status}`,
            go: () => {
              done();
              nav.go(me.role === "ADMIN" || me.role === "MANAGER" ? "cases" : "clients", { id: p.id });
            },
          })),
      );
      if (me.role === "ADMIN" || me.role === "MANAGER") {
        push(
          "Tasks",
          data.tasks
            .filter((t) => hit(t.title))
            .map((t) => ({
              title: t.title,
              meta: `${t.project} · due ${fmtDay(t.due)}${t.done ? " · done" : ""}`,
              go: () => {
                done();
                nav.go("tasks", { query: { task: String(t.id) } });
              },
            })),
        );
      }
      push(
        "Tickets",
        staffTickets(data, me)
          .filter((t) => hit(t.id) || hit(t.title) || hit(userName(data, t.client)))
          .map((t) => ({
            title: `${t.id} · ${t.title}`,
            meta: `${userName(data, t.client)} · ${t.status}`,
            go: () => {
              done();
              nav.go("tickets", { query: { ticket: t.id, filter: "all" } });
            },
          })),
      );
      push(
        "Messages",
        clients
          .filter((c) => can(me, "conversation", c))
          .flatMap((c) =>
            (data.msgs[c.id] ?? [])
              .filter((m) => hit(m.text))
              .map((m) => ({
                title: `${userName(data, m.from)}: ${m.text}`,
                meta: `Conversation with ${c.name} · ${m.time}`,
                go: () => {
                  done();
                  nav.go("messages", { query: { c: c.id } });
                },
              })),
          ),
      );
    } else {
      const project = projectOfClient(data, me.id);
      if (project && (hit(project.id) || hit(me.caseId) || hit(me.biz) || hit(STAGES[project.stageIdx]))) {
        push("Your case", [
          {
            title: `${me.caseId} · ${me.biz || "Your business"}`,
            meta: STAGES[project.stageIdx],
            go: () => {
              done();
              nav.go("home");
            },
          },
        ]);
      }
      push(
        "Your tickets",
        data.tickets
          .filter((t) => t.client === me.id && (hit(t.id) || hit(t.title)))
          .map((t) => ({
            title: `${t.id} · ${t.title}`,
            meta: t.status,
            go: () => {
              done();
              nav.go("home", { query: { view: "tickets", ticket: t.id } });
            },
          })),
      );
      push(
        "Messages",
        (data.msgs[me.id] ?? [])
          .filter((m) => hit(m.text))
          .map((m) => ({
            title: `${userName(data, m.from)}: ${m.text}`,
            meta: m.time,
            go: () => {
              done();
              nav.go("cmsgs");
            },
          })),
      );
      push(
        "Documents",
        data.docs
          .filter((d) => d.client === me.id && hit(d.name))
          .map((d) => ({
            title: d.name,
            meta: d.status,
            go: () => {
              done();
              nav.go("cdocs", { query: { doc: String(d.id) } });
            },
          })),
      );
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, data, me, nav.go]);

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
            <span className="h3 flex-1">Results for “{query}”</span>
            <button
              type="button"
              aria-label="Close search results"
              onClick={() => onOpenChange(false)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-neutral hover:bg-muted"
            >
              <Icon name="x" small />
            </button>
          </div>
          <div className="max-h-[min(420px,60vh)] overflow-auto">
            {groups.map((g) => (
              <div key={g.label} className="border-b border-muted py-1.5">
                <div className="px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{g.label}</div>
                {g.items.map((r) => (
                  <button
                    key={`${r.title}-${r.meta}`}
                    type="button"
                    onClick={r.go}
                    className="flex w-full cursor-pointer flex-col items-start gap-px border-0 bg-transparent px-3.5 py-[7px] text-left hover:bg-primary-soft"
                  >
                    <span className="text-sm font-medium">{r.title}</span>
                    <span className="help">{r.meta}</span>
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 ? (
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
