import { Injectable, Logger, StreamableFile } from "@nestjs/common";
import type { DocStatus, Prisma, Role } from "@prisma/client";

import { AuditService } from "../../../common/audit/audit.service";
import {
  DocumentDeletedException,
  DocumentHasNoFileException,
  DocumentReasonRequiredException,
  DocumentUploadNotAllowedException,
  DuplicateDocumentRequestException,
  InvalidStateTransitionException,
  PermissionDeniedException,
  ResourceNotFoundException,
  StorageFailedException,
  UserRemovedException,
} from "../../../common/exceptions";
import type { ActorContext } from "../../../common/interfaces/actor-context";
import { NotificationService, type EmailRecipient } from "../../../common/notifications/notification.service";
import { paginate, parseSort } from "../../../common/pagination/paginate";
import { AccessService } from "../../../common/permissions/access.service";
import { can, REASON } from "../../../common/permissions/permissions";
import type { PaginatedResponse } from "../../../common/responses/api-response";
import { findDuplicateRequest } from "../../../common/rules/duplicate-document";
import { clientScope, documentScope } from "../../../common/scope/scope";
import { StorageObjectMissingError, StorageService } from "../../../common/storage/storage.service";
import { type IncomingFile, UploadService } from "../../../common/storage/upload.service";
import type { DocumentDto, ListDocumentsQueryDto, RequestDocumentDto, ReviewDocumentDto, ShareDocumentDto } from "../dto/documents.dto";
import {
  DOC_STATUS_LABEL,
  DOCUMENT_SORT_FIELDS,
  OPEN_REQUEST,
  UPLOADABLE,
  type DocumentDetailRecord,
  type DocumentListRecord,
} from "../interfaces/documents.interfaces";
import { DocumentsRepository } from "../repository/documents.repository";

type Db = Prisma.TransactionClient;
type Row = DocumentListRecord | DocumentDetailRecord;

const REVIEWERS: readonly Role[] = ["ADMIN", "MANAGER", "COMPLIANCE"];
const caseNumberOf = (doc: Pick<Row, "client">): string => doc.client.clientProfile?.caseNumber ?? "";

/**
 * One response shape, three views. What each role may see comes from the permission table (`docsAccess`, `docsManage`),
 * not from ad-hoc checks, so the list, the detail and the download can't disagree.
 */
export function toDocumentDto(doc: Row, role: Role): DocumentDto {
  const identity: DocumentDto = {
    id: doc.id,
    name: doc.name,
    type: doc.type,
    status: doc.status,
    clientId: doc.clientId,
    requestedAt: doc.requestedAt,
    submittedAt: doc.submittedAt,
    reviewedAt: doc.reviewedAt,
  };
  const history = "history" in doc ? doc.history : undefined;
  const file = { fileName: doc.fileName, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, reason: doc.reason, note: doc.note };

  if (role === "CLIENT") {
    return { ...identity, ...file, history: history?.map((h) => ({ id: h.id, status: h.status, note: h.note, at: h.at })) };
  }
  const client = { id: doc.client.id, name: doc.client.name, caseNumber: caseNumberOf(doc) };
  if (!can({ id: "-", role, status: "ACTIVE" }, "docsAccess")) {
    // A CSR sees whether a document is required, waiting, approved or needs a correction, and nothing of its content.
    return { ...identity, client };
  }
  return {
    ...identity,
    ...file,
    client,
    requestedBy: doc.requestedBy,
    reviewedBy: doc.reviewedBy,
    deletedAt: doc.deletedAt,
    history: history?.map((h) => ({ id: h.id, status: h.status, note: h.note, at: h.at, by: h.by })),
  };
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly repo: DocumentsRepository,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly notifications: NotificationService,
    private readonly uploads: UploadService,
    private readonly storage: StorageService,
  ) {}

  // ---- reads --------------------------------------------------------------------------------------------------

  async list(c: ActorContext, query: ListDocumentsQueryDto): Promise<PaginatedResponse<DocumentDto>> {
    const sort = parseSort(query, DOCUMENT_SORT_FIELDS, { field: "requestedAt", order: "desc" });
    const search = query.search?.trim();
    const mayReadFileNames = can(c.actor, "docsAccess");
    const where: Prisma.DocumentWhereInput = {
      AND: [
        documentScope(c.actor),
        ...(query.clientId ? [{ clientId: query.clientId }] : []),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.type ? [{ type: query.type }] : []),
        ...(search
          ? [
              {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { client: { is: { name: { contains: search, mode: "insensitive" as const } } } },
                  // Searching file names would let a CSR probe for them, so it is for those who may open the files.
                  ...(mayReadFileNames ? [{ fileName: { contains: search, mode: "insensitive" as const } }] : []),
                ],
              },
            ]
          : []),
      ],
    };
    const orderBy: Prisma.DocumentOrderByWithRelationInput[] = [
      sort.field === "submittedAt" ? { submittedAt: { sort: sort.order, nulls: "last" } } : { [sort.field]: sort.order },
      { id: "asc" },
    ];
    return paginate(query, ({ skip, take }) => this.repo.page(where, orderBy, skip, take), (doc) => toDocumentDto(doc, c.actor.role));
  }

  async get(c: ActorContext, id: string): Promise<DocumentDto> {
    return toDocumentDto(await this.require(c, id), c.actor.role);
  }

  // ---- request, share -----------------------------------------------------------------------------------------

  /** Staff ask a client for a document. A request that repeats an open one is refused, naming the existing one. */
  async request(c: ActorContext, dto: RequestDocumentDto): Promise<DocumentDto> {
    const client = await this.requireClient(c, dto.clientId);
    const duplicate = findDuplicateRequest(dto.name, await this.repo.openRequests(client.id, OPEN_REQUEST));
    if (duplicate) throw new DuplicateDocumentRequestException(duplicate.name, "request");

    const note = dto.note ?? "";
    const text = `Document requested: ${dto.name}`;
    const { id, emails } = await this.repo.transaction(async (tx) => {
      const created = await this.repo.create({ clientId: client.id, name: dto.name, type: dto.type ?? "OTHER", status: "REQUESTED", note, requestedById: c.actor.id }, tx);
      await this.repo.addEvent({ documentId: created.id, status: "REQUESTED", byId: c.actor.id, note }, tx);
      const recipients = await this.notifications.notify(tx, { userIds: [client.id], text, link: "cdocs", category: "DOCUMENTS", excludeUserId: c.actor.id });
      await this.record(c, `Requested document: ${dto.name}`, client.clientProfile?.caseNumber ?? "", tx);
      return { id: created.id, emails: recipients };
    });
    await this.notifications.emailAfterCommit(emails, text);
    return toDocumentDto(await this.requireById(id), c.actor.role);
  }

  /** Staff share a finished document with a client: a file upload, stored and visible to the client at once. */
  async share(c: ActorContext, dto: ShareDocumentDto, file: IncomingFile | undefined): Promise<DocumentDto> {
    // Everything that can be refused without touching the disk is checked first.
    const client = await this.requireClient(c, dto.clientId);
    let emails: EmailRecipient[] = [];
    let text = "";
    const id = await this.uploads.store(file, (stored) =>
      this.repo.transaction(async (tx) => {
        const name = dto.name?.trim() || stored.fileName;
        text = `New document shared with you: ${name}`;
        const created = await this.repo.create(
          { clientId: client.id, name, type: "OTHER", status: "SHARED", note: "", requestedById: c.actor.id, fileName: stored.fileName, storageKey: stored.storageKey, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes },
          tx,
        );
        await this.repo.addEvent({ documentId: created.id, status: "SHARED", byId: c.actor.id, note: "" }, tx);
        emails = await this.notifications.notify(tx, { userIds: [client.id], text, link: "cdocs", category: "DOCUMENTS", excludeUserId: c.actor.id });
        await this.record(c, `Shared document ${stored.fileName}`, client.clientProfile?.caseNumber ?? "", tx);
        return created.id;
      }),
    );
    await this.notifications.emailAfterCommit(emails, text);
    return toDocumentDto(await this.requireById(id), c.actor.role);
  }

  // ---- upload (client) ----------------------------------------------------------------------------------------

  /** A client attaches a file to a request: REQUESTED, or REJECTED/INFO sent back, becomes SUBMITTED. */
  async upload(c: ActorContext, id: string, file: IncomingFile | undefined): Promise<DocumentDto> {
    const doc = await this.require(c, id);
    if (c.actor.role !== "CLIENT") throw new DocumentUploadNotAllowedException();
    await this.access.assert(c.actor, "docsAccess", { client: doc.clientId }, c.requestId, caseNumberOf(doc));
    if (doc.deletedAt) throw new DocumentDeletedException(doc.name);
    if (!UPLOADABLE.includes(doc.status)) this.refuseTransition(doc.status, "SUBMITTED");

    let staffEmails: EmailRecipient[] = [];
    let previousKey: string | null = null;
    const text = `${doc.client.name} submitted “${doc.name}” for review`;
    await this.uploads.store(file, (stored) =>
      this.repo.transaction(async (tx) => {
        previousKey = await this.repo.currentStorageKey(doc.id, tx);
        const moved = await this.repo.submitFile(doc.id, UPLOADABLE, { fileName: stored.fileName, storageKey: stored.storageKey, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes }, tx);
        if (!moved) {
          const now = await this.requireById(doc.id, tx);
          this.refuseTransition(now.status, "SUBMITTED");
        }
        await this.repo.addEvent({ documentId: doc.id, status: "SUBMITTED", byId: c.actor.id, note: stored.fileName }, tx);
        const reviewers = await this.repo.staffIds(REVIEWERS, tx);
        staffEmails = await this.notifications.notify(tx, { userIds: reviewers, text, link: "documents", category: "DOCUMENTS" });
        await this.record(c, `Uploaded ${stored.fileName}`, caseNumberOf(doc), tx);
      }),
    );
    // The replaced file is not referenced any more. Best effort: a leftover is logged, never a reason to fail.
    if (previousKey) await this.uploads.discard(previousKey);
    await this.notifications.emailAfterCommit(staffEmails, text);
    return toDocumentDto(await this.requireById(doc.id), c.actor.role);
  }

  // ---- review -------------------------------------------------------------------------------------------------

  async review(c: ActorContext, id: string, dto: ReviewDocumentDto): Promise<DocumentDto> {
    const doc = await this.require(c, id);
    await this.access.assert(c.actor, "docsReview", undefined, c.requestId, caseNumberOf(doc));
    if (doc.deletedAt) throw new DocumentDeletedException(doc.name);

    const target: DocStatus = dto.decision;
    if (doc.status !== "SUBMITTED") this.refuseTransition(doc.status, target);
    const reason = dto.reason?.trim() ?? "";
    if (dto.decision !== "APPROVED" && !reason) throw new DocumentReasonRequiredException(dto.decision);

    const verb = dto.decision === "APPROVED" ? "Approved " : dto.decision === "REJECTED" ? "Rejected " : "Requested more information on ";
    const message =
      dto.decision === "APPROVED" ? "was approved" : dto.decision === "REJECTED" ? `needs a correction: ${reason}` : `needs more information: ${reason}`;
    const text = `“${doc.name}” ${message}`;
    const kept = dto.decision === "APPROVED" ? "" : reason;

    const emails = await this.repo.transaction(async (tx) => {
      if (!(await this.repo.review(doc.id, target, kept, c.actor.id, tx))) {
        // Someone reviewed (or the client replaced the file) between our read and our write.
        this.refuseTransition((await this.requireById(doc.id, tx)).status, target);
      }
      await this.repo.addEvent({ documentId: doc.id, status: target, byId: c.actor.id, note: kept }, tx);
      const recipients = await this.notifications.notify(tx, { userIds: [doc.clientId], text, link: "cdocs", category: "DOCUMENTS", excludeUserId: c.actor.id });
      await this.record(c, `${verb}${doc.name}`, caseNumberOf(doc), tx);
      return recipients;
    });
    await this.notifications.emailAfterCommit(emails, text);
    return toDocumentDto(await this.requireById(doc.id), c.actor.role);
  }

  // ---- download -----------------------------------------------------------------------------------------------

  /**
   * Streams the file. The document must be in the caller's scope (otherwise 404). Then `docsAccess` decides: a CSR who
   * may see that the document exists but not open it is refused, and the refusal is written to the audit log (category
   * "docs"), exactly like the prototype's "Refused: Download ..." entries. Successful downloads are audited too.
   */
  async download(c: ActorContext, id: string): Promise<{ file: StreamableFile; fileName: string; mimeType: string; sizeBytes: number }> {
    const doc = await this.require(c, id);
    const label = doc.fileName || doc.name;
    if (!can(c.actor, "docsAccess", { client: doc.clientId })) {
      await this.audit.record({
        actorId: c.actor.id,
        actorRole: c.actor.role,
        action: `Refused: Download ${label} (${doc.client.name})`,
        target: caseNumberOf(doc),
        ok: false,
        category: "docs",
        requestId: c.requestId,
        ipAddress: c.ipAddress,
      });
      throw new PermissionDeniedException(REASON.docsAccess);
    }
    if (!doc.storageKey) throw new DocumentHasNoFileException(doc.name);

    let stored;
    try {
      stored = await this.storage.open(doc.storageKey);
    } catch (error) {
      // The row says a file exists but the store doesn't have it: an integrity problem, not the caller's mistake.
      this.logger.error(`Document ${doc.id} points at a missing or unreadable file: ${error instanceof StorageObjectMissingError ? "missing" : String(error)}`);
      throw new StorageFailedException();
    }
    await this.audit.record({
      actorId: c.actor.id,
      actorRole: c.actor.role,
      action: `Downloaded ${label}`,
      target: caseNumberOf(doc),
      category: "docs",
      requestId: c.requestId,
      ipAddress: c.ipAddress,
    });
    const mimeType = doc.mimeType ?? "application/octet-stream";
    return { file: new StreamableFile(stored.stream, { type: mimeType, length: stored.sizeBytes }), fileName: label, mimeType, sizeBytes: stored.sizeBytes };
  }

  // ---- delete -------------------------------------------------------------------------------------------------

  /** Soft delete (Admin and Manager): the record and the file are kept, everyone else stops seeing the document. */
  async remove(c: ActorContext, id: string): Promise<DocumentDto> {
    const doc = await this.require(c, id);
    await this.access.assert(c.actor, "deleteDocument", undefined, c.requestId, caseNumberOf(doc));
    if (doc.deletedAt) throw new DocumentDeletedException(doc.name);
    await this.repo.transaction(async (tx) => {
      await this.repo.softDelete(doc.id, tx);
      await this.record(c, `Deleted document ${doc.name}`, caseNumberOf(doc), tx);
    });
    return toDocumentDto(await this.requireById(doc.id), c.actor.role);
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  /** A document the caller may see (Admin and Manager also see deleted ones). Anything else: 404. */
  private async require(c: ActorContext, id: string): Promise<DocumentDetailRecord> {
    const doc = await this.repo.findOne({ AND: [{ id }, documentScope(c.actor, { includeRemoved: true })] });
    if (!doc) throw new ResourceNotFoundException("document", id);
    return doc;
  }

  private async requireById(id: string, db?: Db): Promise<DocumentDetailRecord> {
    const doc = await this.repo.findById(id, db);
    if (!doc) throw new ResourceNotFoundException("document", id);
    return doc;
  }

  /** A client in the caller's scope, active (documents aren't requested from or shared with removed accounts). */
  private async requireClient(c: ActorContext, id: string) {
    const client = await this.repo.findClient({ AND: [{ id, role: "CLIENT" }, clientScope(c.actor, { includeRemoved: true })] });
    if (!client) throw new ResourceNotFoundException("client", id);
    if (client.status === "REMOVED") throw new UserRemovedException(client.name);
    return client;
  }

  private refuseTransition(from: DocStatus, to: DocStatus): never {
    const reason: Partial<Record<DocStatus, string>> = {
      REQUESTED: to === "SUBMITTED" ? undefined : "The client hasn't submitted a file yet.",
      SUBMITTED: to === "SUBMITTED" ? "A file is already waiting for review." : undefined,
      APPROVED: "It was already approved. If something changed, request a new document.",
      REJECTED: to === "SUBMITTED" ? undefined : "It was rejected and is waiting for the client to upload a corrected file.",
      INFO: to === "SUBMITTED" ? undefined : "More information was requested and is waiting for the client.",
      SHARED: "A shared document is a finished file from the team; it isn't reviewed or replaced.",
    };
    throw new InvalidStateTransitionException("document", DOC_STATUS_LABEL[from], DOC_STATUS_LABEL[to], reason[from]);
  }

  private record(c: ActorContext, action: string, target: string, tx: Db): Promise<void> {
    return this.audit.record({ actorId: c.actor.id, actorRole: c.actor.role, action, target, category: "docs", requestId: c.requestId, ipAddress: c.ipAddress }, tx);
  }
}
