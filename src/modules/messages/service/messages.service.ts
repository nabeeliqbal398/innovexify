import { Injectable, Logger, StreamableFile } from "@nestjs/common";
import type { Prisma, Role } from "@prisma/client";

import { AuditService } from "../../../common/audit/audit.service";
import {
  ConversationReadOnlyException,
  MessageHasNoAttachmentException,
  PermissionDeniedException,
  ResourceNotFoundException,
  StorageFailedException,
  ValidationFailedException,
} from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { NotificationService, type EmailRecipient } from "../../../common/notifications/notification.service";
import { assertOneDirection, parseCursor, type CursorQueryDto } from "../../../common/pagination/cursor.dto";
import { paginate } from "../../../common/pagination/paginate";
import type { PaginationQueryDto } from "../../../common/pagination/pagination.dto";
import { AccessService } from "../../../common/permissions/access.service";
import { can, REASON } from "../../../common/permissions/permissions";
import { CursorResponse, type PaginatedResponse } from "../../../common/responses/api-response";
import { clientScope } from "../../../common/scope/scope";
import { StorageObjectMissingError, StorageService } from "../../../common/storage/storage.service";
import { type IncomingFile, UploadService } from "../../../common/storage/upload.service";
import type { ConversationDto, MessageDto, ReadResultDto, SendMessageDto } from "../dto/messages.dto";
import { MessagesRepository, type ConversationRow, type MessageRecord } from "../repository/messages.repository";

const ROLE_LABEL: Record<Role, string> = { ADMIN: "Admin", MANAGER: "Manager", CSR: "CSR", COMPLIANCE: "Compliance", CLIENT: "Client" };

export function toMessageDto(m: MessageRecord, viewerId: string): MessageDto {
  return {
    id: m.id,
    clientId: m.clientId,
    text: m.text,
    sender: m.sender,
    mine: m.senderId === viewerId,
    attachment: m.attachmentName ? { name: m.attachmentName, mimeType: m.attachmentMime, sizeBytes: m.attachmentSize } : null,
    createdAt: m.createdAt,
  };
}

function toConversationDto(row: ConversationRow): ConversationDto {
  return {
    client: { id: row.id, name: row.name, status: row.status, caseNumber: row.caseNumber ?? "", businessName: row.businessName ?? "" },
    lastMessage: row.lastId
      ? {
          id: row.lastId,
          text: (row.lastText ?? "").slice(0, 200),
          sender: { id: row.lastSenderId ?? "", name: row.lastSenderName ?? "" },
          hasAttachment: Boolean(row.lastAttachment),
          createdAt: row.lastAt as Date,
        }
      : null,
    unread: row.unread,
    writable: row.status === "ACTIVE" || row.status === "INVITED",
  };
}

/**
 * One shared conversation per client. A client reads and writes only their own; a CSR only their assigned clients'; Admin,
 * Manager and Compliance every client's (the `conversation` permission). Messages are immutable: there is no edit or delete.
 */
@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly repo: MessagesRepository,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly notifications: NotificationService,
    private readonly uploads: UploadService,
    private readonly storage: StorageService,
  ) {}

  // ---- reading ------------------------------------------------------------------------------------------------

  /**
   * A page of the thread, oldest to newest within the page. No cursor: the newest `limit` messages. `before`: the `limit`
   * messages older than that message (or moment). `since`: messages newer than that message (or moment), for polling.
   */
  async list(c: ActorContext, clientId: string, query: CursorQueryDto): Promise<CursorResponse<MessageDto>> {
    assertOneDirection(query);
    const client = await this.requireThread(c, clientId);

    let rows: MessageRecord[];
    let hasMore: boolean;
    if (query.since !== undefined) {
      const after = await this.cursorWhere(client.id, query.since, "since", "after");
      const found = await this.repo.findMany({ clientId: client.id, ...after }, "asc", query.limit + 1);
      hasMore = found.length > query.limit;
      rows = found.slice(0, query.limit);
    } else {
      const older = query.before !== undefined ? await this.cursorWhere(client.id, query.before, "before", "before") : {};
      const found = await this.repo.findMany({ clientId: client.id, ...older }, "desc", query.limit + 1);
      hasMore = found.length > query.limit;
      rows = found.slice(0, query.limit).reverse();
    }
    return new CursorResponse(rows.map((m) => toMessageDto(m, c.actor.id)), {
      limit: query.limit,
      hasMore,
      nextBefore: rows[0]?.id ?? null,
      newest: rows[rows.length - 1]?.id ?? null,
    });
  }

  async conversations(c: ActorContext, query: PaginationQueryDto): Promise<PaginatedResponse<ConversationDto>> {
    return paginate(query, ({ skip, take }) => this.repo.conversations(c.actor, skip, take), toConversationDto);
  }

  async unreadCount(c: ActorContext): Promise<{ unread: number }> {
    return { unread: await this.repo.totalUnread(c.actor) };
  }

  // ---- writing ------------------------------------------------------------------------------------------------

  async send(c: ActorContext, clientId: string, dto: SendMessageDto, file: IncomingFile | undefined): Promise<MessageDto> {
    const client = await this.requireThread(c, clientId);
    if (client.status === "SUSPENDED" || client.status === "REMOVED") throw new ConversationReadOnlyException(client.name, client.status);
    // The prototype's rule: anyone but the client needs `attachStaff` (CSRs can't attach files to client conversations).
    if (file && c.actor.role !== "CLIENT") await this.access.assert(c.actor, "attachStaff", { csr: client.clientProfile?.csrId ?? null }, c.requestId, client.clientProfile?.caseNumber ?? "");

    const caseNumber = client.clientProfile?.caseNumber ?? "";
    let emails: EmailRecipient[] = [];
    let text = "";
    const write = async (attachment?: { fileName: string; storageKey: string; mimeType: string; sizeBytes: number }): Promise<MessageRecord> =>
      this.repo.transaction(async (tx) => {
        const created = await this.repo.create(
          {
            clientId: client.id,
            senderId: c.actor.id,
            text: dto.text,
            ...(attachment ? { attachmentName: attachment.fileName, attachmentKey: attachment.storageKey, attachmentMime: attachment.mimeType, attachmentSize: attachment.sizeBytes } : {}),
          },
          tx,
        );
        // The sender has, by definition, read everything up to their own message (the prototype's messageAdded).
        await this.repo.advanceReadMarker(c.actor.id, client.id, created.createdAt, tx);
        const senderName = created.sender.name;
        if (c.actor.role === "CLIENT") {
          text = `New message from ${senderName}`;
          emails = await this.notifications.notify(tx, { userIds: await this.notifications.teamOf(client.id, tx), text, link: "messages", category: "MESSAGES", excludeUserId: c.actor.id });
        } else {
          text = `New message from ${senderName} (${ROLE_LABEL[c.actor.role]})`;
          emails = await this.notifications.notify(tx, { userIds: [client.id], text, link: "cmsgs", category: "MESSAGES", excludeUserId: c.actor.id });
        }
        await this.audit.record(
          { actorId: c.actor.id, actorRole: c.actor.role, action: `Sent message${attachment ? ` with attachment ${attachment.fileName}` : ""}`, target: caseNumber, category: "messages", requestId: c.requestId, ipAddress: c.ipAddress },
          tx,
        );
        return created;
      });

    const message = file ? await this.uploads.store(file, (stored) => write(stored)) : await write();
    await this.notifications.emailAfterCommit(emails, text, "msg");
    return toMessageDto(message, c.actor.id);
  }

  /** Marks the thread read up to its newest message. Idempotent: the marker only moves forward. */
  async markRead(c: ActorContext, clientId: string): Promise<ReadResultDto> {
    const client = await this.requireThread(c, clientId);
    const newest = await this.repo.newest(client.id);
    if (!newest) return { unread: 0, readUpTo: await this.repo.readMarker(c.actor.id, client.id) };
    const readUpTo = await this.repo.transaction((tx) => this.repo.advanceReadMarker(c.actor.id, client.id, newest.createdAt, tx));
    return { unread: await this.repo.unreadIn(c.actor.id, client.id, readUpTo), readUpTo };
  }

  // ---- attachments --------------------------------------------------------------------------------------------

  /** Streams an attachment after the same thread check, and audits the download. */
  async attachment(c: ActorContext, messageId: string): Promise<{ file: StreamableFile; fileName: string; mimeType: string }> {
    const message = await this.repo.findMessage({ id: messageId });
    // Out of scope looks exactly like "no such message".
    if (!message) throw new ResourceNotFoundException("message", messageId);
    const client = await this.requireThread(c, message.clientId).catch((error: unknown) => {
      if (error instanceof ResourceNotFoundException) throw new ResourceNotFoundException("message", messageId);
      throw error;
    });
    if (!message.attachmentKey || !message.attachmentName) throw new MessageHasNoAttachmentException();

    let stored;
    try {
      stored = await this.storage.open(message.attachmentKey);
    } catch (error) {
      this.logger.error(`Message ${message.id} points at a missing or unreadable file: ${error instanceof StorageObjectMissingError ? "missing" : String(error)}`);
      throw new StorageFailedException();
    }
    await this.audit.record({
      actorId: c.actor.id,
      actorRole: c.actor.role,
      action: `Downloaded message attachment ${message.attachmentName}`,
      target: client.clientProfile?.caseNumber ?? "",
      category: "messages",
      requestId: c.requestId,
      ipAddress: c.ipAddress,
    });
    const mimeType = message.attachmentMime ?? "application/octet-stream";
    return { file: new StreamableFile(stored.stream, { type: mimeType, length: stored.sizeBytes }), fileName: message.attachmentName, mimeType };
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  /**
   * The client whose thread this is, if the caller may open it. A client outside the caller's scope is a 404 (the
   * prototype's `conversation` rule: "You can only open conversations for clients in your scope"). Removed clients' threads
   * stay readable to Admin and Manager.
   */
  private async requireThread(c: ActorContext, clientId: string) {
    const client = await this.repo.findClient({ AND: [{ id: clientId, role: "CLIENT" }, clientScope(c.actor, { includeRemoved: true })] });
    if (!client) throw new ResourceNotFoundException("conversation", clientId);
    if (!can(c.actor, "conversation", { id: client.id, csr: client.clientProfile?.csrId ?? null })) throw new PermissionDeniedException(REASON.conversation);
    return client;
  }

  /** The `where` for "older than" / "newer than" a cursor given as a message id or a timestamp. */
  private async cursorWhere(clientId: string, value: string, field: "before" | "since", direction: "before" | "after"): Promise<Prisma.MessageWhereInput> {
    const cursor = parseCursor(value, field);
    const cmp = direction === "before" ? "lt" : "gt";
    if (cursor.kind === "time") return { createdAt: { [cmp]: cursor.at } };
    const anchor = await this.repo.findMessage({ id: cursor.id, clientId });
    if (!anchor) throw new ValidationFailedException([{ field, message: `${field} isn't a message in this conversation.` }]);
    return { OR: [{ createdAt: { [cmp]: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { [cmp]: anchor.id } }] };
  }
}
