"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { FileButton, roleLabelOf } from "@/components/features/client/client-shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { useAppDispatch, useData, useMe } from "@/hooks/useStore";
import { cn } from "@/lib/cn";
import { flash } from "@/store/actions/core";
import { sendMessage } from "@/store/actions/comms";
import { userName } from "@/store/selectors";
import { workspaceActions } from "@/store/workspaceSlice";

/** Client Messages: the single shared thread with the team. */
export function ClientMessagesView() {
  const dispatch = useAppDispatch();
  const data = useData();
  const me = useMe();
  const msgs = data.msgs[me.id] ?? [];
  // The divider position comes from the read marker as it was when the page opened, before it is advanced.
  const [unreadFrom] = useState(() => {
    const seen = data.lastRead[me.id]?.[me.id] ?? 0;
    return msgs.length > seen ? seen : -1;
  });
  const [draft, setDraft] = useState("");
  const [attach, setAttach] = useState("");
  const [error, setError] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dispatch(workspaceActions.conversationRead({ readerId: me.id, clientId: me.id }));
  }, [dispatch, me.id]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  const send = () => {
    if (!draft.trim()) return;
    const res = dispatch(sendMessage(me.id, draft, attach));
    if (res.ok) {
      setDraft("");
      setAttach("");
      setError("");
    } else setError(res.error ?? "");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="stack-16">
      <PageHeader
        title="Messages"
        description={`One conversation with your ${data.company.name} team. Every reply shows who answered and their role.`}
      />
      <Card>
        <div className="card-h">
          <span className="mini flex-1">{`Your team: ${userName(data, me.csr)} (CSR), plus Compliance and management as needed.`}</span>
        </div>
        <div ref={threadRef} className="thread max-h-[520px]" aria-live="polite">
          {msgs.map((m, i) => {
            const sender = data.users.find((u) => u.id === m.from);
            const mine = m.from === me.id;
            return (
              <div key={`${m.at ?? m.time}-${i}`} className="flex flex-col gap-2.5">
                {i === unreadFrom ? (
                  <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-danger before:h-px before:flex-1 before:bg-danger/30 after:h-px after:flex-1 after:bg-danger/30">
                    New messages
                  </div>
                ) : null}
                <div className={cn("flex flex-col gap-[3px]", mine ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "bubble",
                      mine
                        ? "rounded-tr-[4px] bg-primary text-primary-foreground"
                        : sender?.role === "CLIENT"
                          ? "rounded-tl-[4px] border border-border bg-surface"
                          : "rounded-tl-[4px] border border-[#C7D2FE] bg-primary-soft dark:border-primary/40",
                    )}
                  >
                    {m.text}
                  </div>
                  {m.attach ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                      <Icon name="clip" small />
                      {mine ? `You attached ${m.attach} · simulated, not stored` : `Attachment from ${sender?.name ?? "your team"}: ${m.attach}`}
                      {!mine ? (
                        <Button variant="ghost" size="sm" onClick={() => flash("Download simulated. Production uses a short-lived, permission-checked link.")}>
                          Download
                        </Button>
                      ) : null}
                    </span>
                  ) : null}
                  <span className="help">
                    {sender?.name ?? "Unknown"} · {sender ? roleLabelOf(data, sender.id) : ""} · {m.time}
                  </span>
                </div>
              </div>
            );
          })}
          {msgs.length === 0 ? (
            <div className="m-auto">
              <EmptyState title="No messages yet" text="Say hello or ask your team a question." />
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5 border-t border-muted p-2.5">
          <div className="flex gap-2">
            <Textarea
              className="min-h-[42px]"
              aria-label="Message to your team"
              placeholder="Message your team… Enter to send"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
            />
            <Button variant="primary" disabled={!draft.trim()} onClick={send}>
              Send
            </Button>
          </div>
          {error ? (
            <span role="alert" className="errtxt">
              {error}
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <FileButton ariaLabel="Attach a file" variant="ghost" icon="clip" onFile={(f) => setAttach(f?.name ?? "")}>
              {attach || "Attach a file"}
            </FileButton>
            <span className="help">For requested documents, use Documents so the file goes to review.</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
