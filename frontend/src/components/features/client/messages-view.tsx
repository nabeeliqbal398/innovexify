"use client";

import { useRef } from "react";

import { MessageComposer, ThreadMessages } from "@/components/features/messages/message-thread";
import { Card, PageHeader } from "@/components/ui/primitives";
import { useMe } from "@/hooks/useStore";
import { useThread } from "@/hooks/useThread";
import { useConversationsQuery } from "@/store/api/messages";
import { usePortalCompanyQuery } from "@/store/api/home";
import { useClientQuery } from "@/store/api/people";

/** Client Messages: the single shared thread with the team. */
export function ClientMessagesView() {
  const me = useMe();
  const company = usePortalCompanyQuery();
  const profile = useClientQuery(me.id);
  const conversations = useConversationsQuery();
  const mine = conversations.data?.items.find((c) => c.client.id === me.id);
  // The divider position is the unread count as it was when the page opened, before opening marks the thread read.
  const openedWith = useRef<number | null>(null);
  if (openedWith.current === null && mine) openedWith.current = mine.unread;

  // Wait for the unread count first: opening the thread marks it read.
  const thread = useThread(conversations.isLoading ? null : me.id);
  const writable = mine ? mine.writable : true;

  return (
    <div className="stack-16">
      <PageHeader
        title="Messages"
        description={`One conversation with your ${company.data?.name ?? ""} team. Every reply shows who answered and their role.`}
      />
      <Card>
        <div className="card-h">
          <span className="mini flex-1">{`Your team: ${profile.data?.csrName ?? "your CSR"} (CSR), plus Compliance and management as needed.`}</span>
        </div>
        <ThreadMessages thread={thread} unreadFrom={openedWith.current ?? 0} maxHeight="max-h-[520px]" emptyText="No messages yet. Say hello or ask your team a question." />
        <MessageComposer
          clientId={me.id}
          ariaLabel="Message to your team"
          placeholder="Message your team… Enter to send"
          writable={writable}
          readOnlyText="Your account is suspended, so you can read this conversation but not send messages. Contact your administrator."
          canAttach
          hint="For requested documents, use Documents so the file goes to review."
          onSent={thread.append}
        />
      </Card>
    </div>
  );
}
