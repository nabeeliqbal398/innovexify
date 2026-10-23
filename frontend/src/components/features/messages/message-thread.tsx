"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

import { MessageBubble } from "@/components/common/message-bubble";
import { ErrorState, Skeleton } from "@/components/common/query-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { ROLE_LABEL } from "@/constants/vocab";
import { useAction } from "@/hooks/useAction";
import { useMe } from "@/hooks/useStore";
import type { ThreadState } from "@/hooks/useThread";
import { cn } from "@/lib/cn";
import { saveBlob, takeBlob } from "@/lib/download";
import { fileSizeLabel } from "@/lib/api-mappers";
import { FILE_ACCEPT, validateFile } from "@/lib/file-rules";
import { useDownloadAttachmentMutation, useSendMessageMutation } from "@/store/api/messages";
import type { Message } from "@/types/domain";

/** The attachment line under a message, with a download through the authenticated route. */
function Attachment({ message }: { message: Message }) {
  const run = useAction();
  const [download, { isLoading }] = useDownloadAttachmentMutation();
  const file = message.attachment;
  if (!file) return null;
  const get = async () => {
    const outcome = await run(download(message.id));
    if (!outcome.ok) return;
    const blob = takeBlob(outcome.data.key);
    if (blob) saveBlob(blob, outcome.data.filename || file.name);
  };
  const size = fileSizeLabel(file.sizeBytes);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs", message.mine ? "self-end" : "self-start")}>
      <Icon name="clip" small />
      {file.name}
      {size ? <span className="help">({size})</span> : null}
      <Button variant="ghost" size="sm" disabled={isLoading} onClick={() => void get()}>
        {isLoading ? "Downloading…" : "Download"}
      </Button>
    </span>
  );
}

/**
 * The messages of one thread, oldest at the top, with "Earlier messages" to walk back through history. Scrolls to the newest
 * message when one arrives or the thread opens (not when older ones are added above).
 */
export function ThreadMessages({
  thread,
  unreadFrom = 0,
  maxHeight,
  emptyText = "No messages yet.",
}: {
  thread: ThreadState;
  /** How many of the newest messages were unread when the thread opened: a divider is drawn above them. */
  unreadFrom?: number;
  maxHeight?: string;
  emptyText?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { messages, loading, error, hasOlder, loadingOlder, loadOlder, reload } = thread;
  const newestId = messages[messages.length - 1]?.id;

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newestId]);

  const dividerAt = unreadFrom > 0 && unreadFrom <= messages.length ? messages.length - unreadFrom : -1;

  return (
    <div ref={ref} className={cn("thread", maxHeight)} aria-live="polite">
      {loading ? <Skeleton rows={3} /> : null}
      {error && !loading ? <ErrorState error={error} onRetry={reload} title="We could not load this conversation" /> : null}
      {hasOlder && !loading ? (
        <Button size="sm" className="self-center" disabled={loadingOlder} onClick={() => void loadOlder()}>
          {loadingOlder ? "Loading…" : "Earlier messages"}
        </Button>
      ) : null}
      {messages.map((m, i) => (
        <div key={m.id} className="flex flex-col gap-1.5">
          {i === dividerAt ? (
            <div className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-danger before:h-px before:flex-1 before:bg-danger/30 after:h-px after:flex-1 after:bg-danger/30">
              New messages
            </div>
          ) : null}
          <MessageBubble text={m.text} who={m.fromName} role={ROLE_LABEL[m.fromRole]} time={m.time} mine={m.mine} senderRole={m.fromRole} />
          <Attachment message={m} />
        </div>
      ))}
      {!loading && !error && messages.length === 0 ? <span className="help m-auto">{emptyText}</span> : null}
    </div>
  );
}

/**
 * The reply box. A suspended or removed client's thread is read-only (the server says so too). Attachments are pre-checked
 * here for type and size, but the server checks the content itself and its message wins. CSRs cannot attach to client conversations.
 */
export function MessageComposer({
  clientId,
  placeholder,
  ariaLabel,
  writable,
  readOnlyText,
  canAttach,
  hint,
  onSent,
}: {
  clientId: string;
  placeholder: string;
  ariaLabel: string;
  writable: boolean;
  readOnlyText?: string;
  canAttach: boolean;
  hint: string;
  onSent: (message: Message) => void;
}) {
  const me = useMe();
  const run = useAction();
  const [send, { isLoading }] = useSendMessageMutation();
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState("");

  if (!writable) {
    return (
      <div className="flex items-center gap-1.5 border-t border-muted p-3 text-sm text-neutral" role="status">
        <Icon name="lock" small />
        {readOnlyText ?? "This conversation is read-only."}
      </div>
    );
  }

  const submit = async () => {
    if (!draft.trim() || isLoading) return;
    setProblem("");
    const outcome = await run(send({ clientId, text: draft.trim(), file }), { quiet: true });
    if (outcome.ok) {
      onSent(outcome.data);
      setDraft("");
      setFile(null);
    } else if (outcome.error.errorCode !== "PERMISSION_DENIED") {
      // Shown next to the box: the rate-limit wait, a refused file, a read-only thread.
      setProblem(outcome.error.fieldErrors[0]?.message ?? outcome.error.message);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!picked) return;
    const bad = validateFile(picked);
    setProblem(bad);
    setFile(bad ? null : picked);
  };

  return (
    <div className="flex flex-col gap-1.5 border-t border-muted p-2.5">
      <div className="flex gap-2">
        <Textarea className="min-h-[42px]" aria-label={ariaLabel} placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} />
        <Button variant="primary" onClick={() => void submit()} disabled={!draft.trim() || isLoading}>
          {isLoading ? "Sending…" : "Send"}
        </Button>
      </div>
      {problem ? (
        <span role="alert" className="errtxt">
          {problem}
        </span>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {canAttach ? (
          <label className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "relative cursor-pointer")}>
            <Icon name="clip" small />
            {file ? `Attached: ${file.name}` : "Attach file"}
            <input type="file" accept={FILE_ACCEPT} onChange={onPick} className="absolute size-px opacity-0" aria-label="Attach a file" />
          </label>
        ) : (
          <span className="help flex items-center gap-1.5">
            <Icon name="lock" small />
            CSRs can&apos;t attach files to client conversations.
          </span>
        )}
        {file ? (
          <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
            Remove file
          </Button>
        ) : null}
        <span className="help">{hint.replace("{name}", `${me.name} (${ROLE_LABEL[me.role]})`)}</span>
      </div>
    </div>
  );
}
