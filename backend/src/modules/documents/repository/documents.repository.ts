import { Injectable } from "@nestjs/common";
import type { DocStatus, DocType, Prisma, Role } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";
import {
  documentDetailSelect,
  documentListSelect,
  type DocumentDetailRecord,
  type DocumentListRecord,
} from "../interfaces/documents.interfaces";

type Db = Prisma.TransactionClient;

export interface NewDocument {
  clientId: string;
  name: string;
  type: DocType;
  status: DocStatus;
  note: string;
  requestedById: string;
  fileName?: string;
  storageKey?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface FileFields {
  fileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

/** All database access for the documents module. */
@Injectable()
export class DocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, { timeout: 15_000 });
  }

  async page(where: Prisma.DocumentWhereInput, orderBy: Prisma.DocumentOrderByWithRelationInput[], skip: number, take: number): Promise<[DocumentListRecord[], number]> {
    return this.prisma.$transaction([
      this.prisma.document.findMany({ where, orderBy, skip, take, select: documentListSelect }),
      this.prisma.document.count({ where }),
    ]);
  }

  findOne(where: Prisma.DocumentWhereInput, db: Db = this.prisma): Promise<DocumentDetailRecord | null> {
    return db.document.findFirst({ where, select: documentDetailSelect });
  }

  findById(id: string, db: Db = this.prisma): Promise<DocumentDetailRecord | null> {
    return db.document.findUnique({ where: { id }, select: documentDetailSelect });
  }

  findClient(where: Prisma.UserWhereInput, db: Db = this.prisma) {
    return db.user.findFirst({ where, select: { id: true, name: true, status: true, clientProfile: { select: { caseNumber: true, csrId: true } } } });
  }

  openRequests(clientId: string, statuses: readonly DocStatus[], db: Db = this.prisma): Promise<Array<{ id: string; name: string; status: DocStatus }>> {
    return db.document.findMany({ where: { clientId, deletedAt: null, status: { in: [...statuses] } }, select: { id: true, name: true, status: true } });
  }

  staffIds(roles: readonly Role[], db: Db = this.prisma): Promise<string[]> {
    return db.user.findMany({ where: { role: { in: [...roles] }, status: "ACTIVE", deletedAt: null }, select: { id: true } }).then((rows) => rows.map((r) => r.id));
  }

  async create(data: NewDocument, db: Db): Promise<{ id: string }> {
    return db.document.create({
      data: {
        clientId: data.clientId,
        name: data.name,
        type: data.type,
        status: data.status,
        note: data.note,
        requestedById: data.requestedById,
        fileName: data.fileName ?? "",
        storageKey: data.storageKey ?? null,
        mimeType: data.mimeType ?? null,
        sizeBytes: data.sizeBytes ?? null,
        submittedAt: data.status === "SHARED" ? new Date() : null,
      },
      select: { id: true },
    });
  }

  addEvent(data: { documentId: string; status: DocStatus; byId: string; note: string }, db: Db) {
    return db.documentEvent.create({ data, select: { id: true } });
  }

  /** The storage key a replacement will make obsolete, read inside the transaction that replaces it. */
  async currentStorageKey(id: string, db: Db): Promise<string | null> {
    return (await db.document.findUnique({ where: { id }, select: { storageKey: true } }))?.storageKey ?? null;
  }

  /** Attach a client's file: only while the document is still waiting for one. False when its status moved meanwhile. */
  async submitFile(id: string, allowedFrom: readonly DocStatus[], file: FileFields, db: Db): Promise<boolean> {
    const result = await db.document.updateMany({
      where: { id, deletedAt: null, status: { in: [...allowedFrom] } },
      data: { ...file, status: "SUBMITTED", reason: "", submittedAt: new Date(), reviewedAt: null, reviewedById: null },
    });
    return result.count === 1;
  }

  /** Record a review: only for a SUBMITTED document. False when someone else reviewed it first. */
  async review(id: string, status: DocStatus, reason: string, reviewerId: string, db: Db): Promise<boolean> {
    const result = await db.document.updateMany({
      where: { id, deletedAt: null, status: "SUBMITTED" },
      data: { status, reason, reviewedById: reviewerId, reviewedAt: new Date() },
    });
    return result.count === 1;
  }

  async softDelete(id: string, db: Db): Promise<boolean> {
    const result = await db.document.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
    return result.count === 1;
  }
}
