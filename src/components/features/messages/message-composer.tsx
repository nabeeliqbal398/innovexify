"use client";

import { useState, type ChangeEvent, type KeyboardEvent } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/form";
import { ROLE_LABEL } from "@/constants/vocab";
import { useAppDispatch, useMe } from "@/hooks/useStore";
import { cn } from "@/lib/cn";
import { can } from "@/lib/permissions";
import { sendMessage, validateFile } from "@/store/actions/comms";
import type { User } from "@/types/domain";

/** Reply box for one client conversation. Mount it with a key so drafts reset per client. */
export function MessageComposer({ client }: { client: User }) {
  const dispatch = useAppDispatch();
  const me = useMe();
  const [draft, setDraft] = useState("");
  const [attach, setAttach] = useState("");
  const [error, setError] = useState("");
  const canAttach = can(me, "attachStaff");

  const send = () => {
    if (!draft.trim()) return;
    const result = dispatch(sendMessage(client.id, draft, attach));
    if (result.ok) {
      setDraft("");
      setAttach("");
      setError("");
    } else {
      setError(result.error ?? "");
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onAttach = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = validateFile(file);
    setError(problem);
    if (!problem) setAttach(file.name);
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-muted p-2.5">
      <div className="flex gap-2">
        <Textarea
          className="min-h-[42px]"
          aria-label={`Message to ${client.name}`}
          placeholder={`Message ${client.name.split(" ")[0]}… Enter to send`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <Button variant="primary" onClick={send} disabled={!draft.trim()}>
          Send
        </Button>
      </div>
      {error ? (
        <span role="alert" className="errtxt">
          {error}
        </span>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {canAttach ? (
          <label className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "relative cursor-pointer")}>
            <Icon name="clip" small />
            {attach ? `Attached: ${attach}` : "Attach file"}
            <input type="file" onChange={onAttach} className="absolute size-px opacity-0" />
          </label>
        ) : (
          <span className="help flex items-center gap-1.5">
            <Icon name="lock" small />
            CSRs can&apos;t attach files to client conversations.
          </span>
        )}
        <span className="help">
          Sending as {me.name} ({ROLE_LABEL[me.role]}). The client is notified in-app.
        </span>
      </div>
    </div>
  );
}
