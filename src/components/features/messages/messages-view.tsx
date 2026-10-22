"use client";

import { useEffect, useRef } from "react";

import { MessageBubble } from "@/components/common/message-bubble";
import { MessageComposer } from "@/components/features/messages/message-composer";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Avatar, PageHeader } from "@/components/ui/primitives";
import { CASE_TONE, ROLE_LABEL, STAGES } from "@/constants/vocab";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { initials } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { openConversation } from "@/store/actions/comms";
import { projectOfClient, userById, userName } from "@/store/selectors";
import type { DemoData, User } from "@/types/domain";

function unreadCount(data: DemoData, meId: string, clientId: string): number {
  const thread = data.msgs[clientId] ?? [];
  const read = data.lastRead[meId]?.[clientId] ?? 0;
  return thread.slice(read).filter((m) => m.from !== meId).length;
}

/** Staff conversations: one shared thread per client, scoped by the permission engine. */
export function MessagesView({ nav }: ViewProps) {
  const data = useData();
  const me = useMe();
  const dispatch = useAppDispatch();
  const navRef = useRef(nav);
  navRef.current = nav;
  const threadRef = useRef<HTMLDivElement>(null);

  const convs = data.users
    .filter((u) => u.role === "CLIENT" && u.status !== "Removed" && can(me, "viewClient", u) && can(me, "conversation", u))
    .map((c) => ({ client: c, unread: unreadCount(data, me.id, c.id) }))
    .sort((a, b) => b.unread - a.unread);

  const selectedId = nav.param("c");
  const cur: User | undefined = convs.find((c) => c.client.id === selectedId)?.client;
  const messages = cur ? (data.msgs[cur.id] ?? []) : [];
  const messageCount = messages.length;

  useEffect(() => {
    if (!selectedId) return;
    if (!dispatch(openConversation(selectedId))) navRef.current.setParams({ c: undefined });
  }, [selectedId, messageCount, dispatch]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selectedId, messageCount]);

  const project = cur ? projectOfClient(data, cur.id) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Messages"
        description="One shared conversation per client. Anything sent here is visible to the client, with your name and role."
      />
      <section className="card split overflow-hidden">
        <div className="list">
          {convs.map(({ client, unread }) => {
            const thread = data.msgs[client.id] ?? [];
            const last = thread[thread.length - 1];
            const on = client.id === cur?.id;
            return (
              <button
                key={client.id}
                type="button"
                className={`litem${on ? " is-on" : ""}`}
                aria-current={on ? "true" : undefined}
                onClick={() => nav.setParams({ c: client.id })}
              >
                <Avatar initials={initials(client.name)} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex gap-1.5">
                    <span className="flex-1 font-semibold">{client.name}</span>
                    {unread > 0 && !on ? (
                      <Badge tone="brand" compact>
                        {unread}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="help mono">
                    {client.caseId} · CSR {userName(data, client.csr)}
                  </span>
                  <span className="help overflow-hidden text-ellipsis whitespace-nowrap">
                    {last ? `${userName(data, last.from).split(" ")[0]}: ${last.text}` : "No messages yet"}
                  </span>
                </span>
              </button>
            );
          })}
          {convs.length === 0 ? <div className="row help">No conversations in your scope.</div> : null}
        </div>
        <div className="flex min-w-0 flex-col">
          {cur ? (
            <>
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-b border-border px-3.5 py-2.5 text-sm">
                <strong>{cur.name}</strong>
                <span className="mono">{cur.caseId}</span>
                <span className="help">CSR {userName(data, cur.csr)}</span>
                <span className="help">
                  {cur.state || "—"} · {project ? STAGES[project.stageIdx] : "No project"}
                </span>
                <Badge tone={project ? (CASE_TONE[project.status] ?? "q") : "q"}>{project?.status ?? "—"}</Badge>
              </div>
              <div ref={threadRef} className="thread" aria-live="polite">
                {messages.map((m, i) => {
                  const sender = userById(data, m.from);
                  const suffix = m.attach
                    ? me.role === "CSR"
                      ? " · Attachment withheld (CSRs can't open client files)"
                      : ` · Attached: ${m.attach} (simulated, not stored)`
                    : undefined;
                  return (
                    <MessageBubble
                      key={`${m.at ?? i}-${i}`}
                      text={m.text}
                      who={sender?.name ?? "Unknown"}
                      role={sender ? ROLE_LABEL[sender.role] : ""}
                      time={m.time}
                      mine={m.from === me.id}
                      senderRole={sender?.role}
                      suffix={suffix}
                    />
                  );
                })}
                {messages.length === 0 ? <span className="help m-auto">No messages yet.</span> : null}
              </div>
              <MessageComposer key={cur.id} client={cur} />
            </>
          ) : (
            <div className="help m-auto p-[30px]">Select a conversation to read and reply.</div>
          )}
        </div>
      </section>
    </div>
  );
}
