"use client";

import { useState } from "react";

import { Pager } from "@/components/common/pager";
import { QueryState } from "@/components/common/query-state";
import { MessageComposer, ThreadMessages } from "@/components/features/messages/message-thread";
import type { ViewProps } from "@/components/features/workspace/types";
import { Badge } from "@/components/ui/badge";
import { Avatar, PageHeader } from "@/components/ui/primitives";
import { CASE_TONE } from "@/constants/vocab";
import { useMe } from "@/hooks/useStore";
import { useThread } from "@/hooks/useThread";
import { initials } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { useConversationsQuery } from "@/store/api/messages";
import { useClientQuery } from "@/store/api/people";

const PAGE_SIZE = 20;

/** Staff conversations: one shared thread per client, scoped by the server. Selected with `?c=<client id>`. */
export function MessagesView({ nav }: ViewProps) {
  const me = useMe();
  const [page, setPage] = useState(1);
  const list = useConversationsQuery({ page, limit: PAGE_SIZE }, { pollingInterval: 30_000, skipPollingIfUnfocused: true });
  const convs = list.data?.items ?? [];
  const meta = list.data?.meta;

  const selectedId = nav.param("c");
  const client = useClientQuery(selectedId, { skip: !selectedId });
  const cur = client.data;
  const thread = useThread(cur ? cur.id : null);
  const writable = cur ? cur.status !== "Suspended" && cur.status !== "Removed" : false;
  const project = cur?.currentCase;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Messages"
        description="One shared conversation per client. Anything sent here is visible to the client, with your name and role."
      />
      <section className="card split overflow-hidden">
        <div className="list">
          <QueryState query={list} isEmpty={convs.length === 0} empty={{ title: "No conversations in your scope." }} rows={4}>
            {convs.map(({ client: c, last, unread }) => {
              const on = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`litem${on ? " is-on" : ""}`}
                  aria-current={on ? "true" : undefined}
                  onClick={() => nav.setParams({ c: c.id })}
                >
                  <Avatar initials={initials(c.name)} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex gap-1.5">
                      <span className="flex-1 font-semibold">{c.name}</span>
                      {unread > 0 && !on ? (
                        <Badge tone="brand" compact>
                          {unread}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="help mono">{c.caseId}</span>
                    <span className="help overflow-hidden text-ellipsis whitespace-nowrap">
                      {last ? `${last.fromName.split(" ")[0]}: ${last.hasAttachment && !last.text ? "Attachment" : last.text}` : "No messages yet"}
                    </span>
                  </span>
                </button>
              );
            })}
            {meta && meta.totalPages > 1 ? (
              <Pager
                page={meta.page - 1}
                pageCount={meta.totalPages}
                total={meta.total}
                pageSize={PAGE_SIZE}
                noun="conversations"
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
                onNext={() => setPage((p) => p + 1)}
              />
            ) : null}
          </QueryState>
        </div>
        <div className="flex min-w-0 flex-col">
          {selectedId && client.isError ? (
            <div className="help m-auto p-[30px]" role="alert">
              {client.error && typeof client.error === "object" && "message" in client.error ? String((client.error as { message: string }).message) : "That conversation isn't available."}
            </div>
          ) : cur ? (
            <>
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-b border-border px-3.5 py-2.5 text-sm">
                <strong>{cur.name}</strong>
                <span className="mono">{cur.caseId}</span>
                <span className="help">CSR {cur.csrName ?? "—"}</span>
                <span className="help">
                  {cur.state || "—"} · {project ? project.stage : "No project"}
                </span>
                <Badge tone={project ? (CASE_TONE[project.status] ?? "q") : "q"}>{project?.status ?? "—"}</Badge>
              </div>
              <ThreadMessages thread={thread} />
              <MessageComposer
                key={cur.id}
                clientId={cur.id}
                ariaLabel={`Message to ${cur.name}`}
                placeholder={`Message ${cur.name.split(" ")[0]}… Enter to send`}
                writable={writable}
                readOnlyText={
                  cur.status === "Suspended"
                    ? `${cur.name}'s account is suspended, so this conversation is read-only. Reactivate the account to send messages.`
                    : `${cur.name} was removed from the portal, so this conversation is read-only.`
                }
                canAttach={can(me, "attachStaff")}
                hint="Sending as {name}. The client is notified in-app."
                onSent={thread.append}
              />
            </>
          ) : selectedId && client.isLoading ? (
            <div className="help m-auto p-[30px]">Opening conversation…</div>
          ) : (
            <div className="help m-auto p-[30px]">Select a conversation to read and reply.</div>
          )}
        </div>
      </section>
    </div>
  );
}
